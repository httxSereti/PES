"""
Bluetooth LE sensors (motion + sound): connection threads, notification
parsing, and alarm threshold checks.
"""

import asyncio
import math
import re
import threading
import time
from functools import partial

import structlog
from bleak import BleakClient
from bleak.exc import BleakDeviceNotFoundError

from api.ws.websocket_notifier import ws_notifier
from events.dispatcher import EventDispatcher
from store import Store

logger = structlog.get_logger("pes")

store = Store()

# Wall-clock timing state for hold/cooldown, keyed by (sensor, measure).
# This is intentionally independent of the BLE notification rate.
_timing_lock = threading.Lock()
_alarm_since: dict[tuple[str, str], float] = {}
_cooldown_until: dict[tuple[str, str], float] = {}


def _reset_hold(sensor_name: str, measure: str) -> None:
    with _timing_lock:
        _alarm_since.pop((sensor_name, measure), None)


def _reset_sensor_holds(sensor_name: str) -> None:
    with _timing_lock:
        for key in [key for key in _alarm_since if key[0] == sensor_name]:
            _alarm_since.pop(key, None)


def sensor_check_val(sensor_name: str, measure: str, val: float) -> None:
    """
    Check whether a sensor value should fire an alarm.

    ``*_delay_on`` and ``*_delay_off`` are seconds, not notification counts:
    - the first reading above the threshold starts the hold timer;
    - once ``delay_on`` seconds have elapsed, the next above-threshold reading
      fires an alarm;
    - below-threshold readings do **not** reset the hold timer; it is reset
      only when the sensor disconnects/reconnects or is disabled;
    - after firing, ``delay_off`` seconds must pass before another alarm
      (cooldown). The hold timer keeps running during cooldown.

    The positive/negative alarm counter is kept in seconds for compatibility
    with existing clients: positive = elapsed hold seconds, negative =
    remaining cooldown seconds.
    """
    # fetch current settings
    current_sensor_settings = store.get_sensor_setting(sensor_name)

    # max value at 50 (why?)
    if sensor_name == "sound":
        new_current_value = min(round(val), 90)
    else:
        new_current_value = min(round(val), 50)

    # no check if offline
    if not current_sensor_settings["sensor_online"]:
        _reset_hold(sensor_name, measure)
        return

    fields_to_update = {"current_" + measure: new_current_value}

    delay_on = max(0, int(current_sensor_settings[measure + "_delay_on"]))
    delay_off = max(0, int(current_sensor_settings[measure + "_delay_off"]))
    counter_key = measure + "_alarm_counter"
    alarm_key = measure + "_alarm_number"
    key = (sensor_name, measure)

    with _timing_lock:
        now = time.monotonic()
        cooldown_until = _cooldown_until.get(key, 0.0)

        # Still cooling down: update the reading, but never fire. The cooldown
        # may start the hold timer, but it must not reset it.
        if now < cooldown_until:
            if val > current_sensor_settings[measure + "_alarm_level"]:
                _alarm_since.setdefault(key, now)
            fields_to_update[counter_key] = -math.ceil(cooldown_until - now)
            store.update_sensor_fields(sensor_name, fields_to_update)
            return

        if cooldown_until:
            _cooldown_until.pop(key, None)

        if val > current_sensor_settings[measure + "_alarm_level"]:
            # The timer starts on the first above-threshold reading. Below
            # threshold readings do not reset it.
            since = _alarm_since.setdefault(key, now)
            elapsed = now - since
            fields_to_update[counter_key] = int(elapsed)

            if elapsed >= delay_on:
                fields_to_update[alarm_key] = (
                    current_sensor_settings[alarm_key] + 1
                )
                fields_to_update[counter_key] = -delay_off
                # Keep the hold timer: if the value stays above threshold,
                # the next alarm is eligible as soon as cooldown expires.

                if delay_off > 0:
                    _cooldown_until[key] = now + delay_off
        else:
            # Do not clear the hold timer here; only a disconnect/reconnect
            # or sensor disable resets it. Keep the elapsed time visible in
            # the compatibility counter.
            hold_since = _alarm_since.get(key)
            fields_to_update[counter_key] = (
                int(now - hold_since) if hold_since is not None else 0
            )

        store.update_sensor_fields(sensor_name, fields_to_update)


def sensor_notification(sensor_name, _, data: bytearray) -> None:
    """
    Function call for every BT notify
    Args:
        sensor:sensor name
        _:BT client
        data: notification data

    Returns:

    """

    current_sensor_settings = store.get_sensor_setting(sensor_name)

    if sensor_name == "sound":
        level = int.from_bytes(data[0:1], byteorder="big", signed=False)
        sensor_check_val(sensor_name, "sound", level)
    else:
        # X/Y/Z position (not sure about the unit)
        x_angle = int.from_bytes(data[0:2], byteorder="big", signed=True)
        y_angle = int.from_bytes(data[2:4], byteorder="big", signed=True)
        z_angle = int.from_bytes(data[4:6], byteorder="big", signed=True)
        # X/Y/Z acceleration
        x_acc = int.from_bytes(data[6:8], byteorder="big", signed=True)
        y_acc = int.from_bytes(data[8:10], byteorder="big", signed=True)
        z_acc = int.from_bytes(data[10:12], byteorder="big", signed=True)

        # Calc something proportional to movement
        move = round((abs(x_acc) + abs(y_acc) + abs(z_acc)) / 30)

        # Calc something proportional to the position change
        pos = (abs(x_angle) + abs(y_angle) + abs(z_angle)) / 100

        # new position
        new_position_ref: float = pos

        if current_sensor_settings["position_ref"] == -1:
            new_position_ref = pos
        else:
            new_position_ref = (
                current_sensor_settings["position_ref"] * 100 + pos
            ) / 101  # Add 1% of the new position

        # update sensor
        store.update_sensor_field(sensor_name, "position_ref", new_position_ref)

        pos = abs(pos - new_position_ref)

        # check values
        sensor_check_val(sensor_name, "position", pos)
        sensor_check_val(sensor_name, "move", move)


async def sensor_bt(sensor_name: str, address: str, char_uuid: str) -> None:
    """
    Start connexion with the BT ensors and activate notification
    Args:
        sensor: Name of the sensors
        address: BT addr of the module
        char_uuid: BT uuid for the sensor
    Returns:
        None
    """

    current_sensor_settings = store.get_sensor_setting(sensor_name)
    current_sensor_settings["sensor_online"] = False

    disconnected_event = asyncio.Event()
    logger.info("[Sensors] Searching Sensor...", sensor_name=sensor_name)

    def disconnected_callback(bt_client):
        logger.info("[Sensors] Sensor offline", sensor_name=sensor_name)
        current_sensor_settings["sensor_online"] = False

        if sensor_name == "sound":
            sensor_check_val(sensor_name, "sound", 0)
        else:
            sensor_check_val(sensor_name, "move", 0)
            sensor_check_val(sensor_name, "position", 0)

        # queue ws update
        ws_notifier.notify(
            payload_type="sensors:update",
            payload={"id": sensor_name, "changes": {"sensor_online": False}},
        )

        disconnected_event.set()

    async with BleakClient(
        address, disconnected_callback=disconnected_callback
    ) as client:
        logger.info("[Sensors] Sensor online", sensor_name=sensor_name)
        current_sensor_settings["sensor_online"] = True
        _reset_sensor_holds(sensor_name)

        # queue ws update
        ws_notifier.notify(
            payload_type="sensors:update",
            payload={"id": sensor_name, "changes": {"sensor_online": True}},
        )

        await client.start_notify(char_uuid, partial(sensor_notification, sensor_name))

        # wait until the sensor disconnects, is disabled, or a rescan is requested
        last_rescan = store.get_hardware_rescan(sensor_name)
        while not disconnected_event.is_set():
            if not store.is_hardware_enabled(sensor_name):
                logger.info(
                    "[Sensors] Sensor disabled, disconnecting", sensor_name=sensor_name
                )
                break
            if store.get_hardware_rescan(sensor_name) != last_rescan:
                logger.info(
                    "[Sensors] Rescan requested, reconnecting", sensor_name=sensor_name
                )
                break
            await asyncio.sleep(0.5)


def thread_sensors_bt(sensor: str, addr: str, service: str) -> None:
    """
    Loop forever for collect motion sensor data
        Args:
        sensor: Name of the sensors
        address: BT addr of the module
        char_uuid: BT uuid for the MPU6050 sensor
    Returns:

    """
    logger.info("[Sensors] Start Sensor thread", sensor_name=sensor)
    while True:
        # sensor disabled at runtime: mark it offline (once) and wait
        if not store.is_hardware_enabled(sensor):
            if store.get_sensor_setting(sensor)["sensor_online"]:
                store.update_sensor_field(sensor, "sensor_online", False)
                _reset_sensor_holds(sensor)
            time.sleep(1)
            continue
        try:
            # thread isolation
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            # run
            loop.run_until_complete(sensor_bt(sensor, addr, service))
            loop.close()
        except BleakDeviceNotFoundError:
            # backoff in 1s steps to stay responsive to disable/rescan
            for _ in range(30):
                time.sleep(1)
        except Exception:
            logger.exception(
                f"[Sensors] Thread error in start_sensors_bt {sensor}",
                sensor_name=sensor,
            )
            for _ in range(30):
                time.sleep(1)


async def sensor_alarm_check() -> None:
    """
    Check alarm about position and moving for the BT sensors and dispatch
    events for newly fired alarms.
    """
    dispatcher = EventDispatcher.get_instance()

    for sensor_name in sorted(store.get_all_sensors_settings().keys()):
        current_sensor_settings = store.get_sensor_setting(sensor_name)

        for field in sorted(current_sensor_settings.keys()):
            if m := re.match(r"^(\w+)_alarm_number$", field):
                value = m[1]
                if (
                    current_sensor_settings[value + "_alarm_number"]
                    != current_sensor_settings[value + "_alarm_number_action"]
                ):
                    current_sensor_settings[value + "_alarm_number_action"] = (
                        current_sensor_settings[value + "_alarm_number"]
                    )
                    store.update_sensor_field(
                        sensor_name,
                        value + "_alarm_number_action",
                        current_sensor_settings[value + "_alarm_number"],
                    )

                    # Dispatch sensor alarm event via new system
                    if current_sensor_settings["alarm_enable"]:
                        sensor_event_map = {
                            "sound": "sensor_sound_alarm",
                            "position": "sensor_position_alarm",
                            "move": "sensor_move_alarm",
                        }
                        event_type = sensor_event_map.get(value, value)

                        logger.info(
                            "[Sensors] Sensor alarm fired!", sensor_name=sensor_name
                        )
                        await dispatcher.dispatch(
                            event_type=event_type,
                            origin=f"sensor:{sensor_name}:{value}",
                        )
