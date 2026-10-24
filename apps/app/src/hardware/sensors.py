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

# Accumulated at/above-trigger timing state, keyed by (sensor, measure).
# Trigger time is accumulated only while the value is at/above the trigger
# level; below-threshold time pauses the counter and cooldown time never adds.
_timing_lock = threading.Lock()
_hold_elapsed: dict[tuple[str, str], float] = {}
_above_since: dict[tuple[str, str], float] = {}
_cooldown_until: dict[tuple[str, str], float] = {}


def _reset_hold(sensor_name: str, measure: str) -> None:
    with _timing_lock:
        key = (sensor_name, measure)
        _hold_elapsed.pop(key, None)
        _above_since.pop(key, None)


def _reset_sensor_holds(sensor_name: str) -> None:
    with _timing_lock:
        for key in [key for key in _hold_elapsed if key[0] == sensor_name]:
            _hold_elapsed.pop(key, None)
        for key in [key for key in _above_since if key[0] == sensor_name]:
            _above_since.pop(key, None)


def sensor_check_val(sensor_name: str, measure: str, val: float) -> None:
    """
    Check whether a sensor value should fire an alarm.

    ``*_delay_on`` is the amount of time the value must spend at or above the
    trigger level before an alarm fires:
    - only at/above-trigger time is accumulated;
    - below-threshold readings pause the counter, but do not reset it;
    - when the accumulated time reaches ``delay_on``, the alarm fires and the
      counter resets to zero;
    - ``*_delay_off`` is then a wall-clock cooldown in seconds. No trigger time
      is accumulated during cooldown. After cooldown, accumulation starts from
      zero again;
    - disconnect/reconnect or sensor disable resets the trigger counter.

    The positive/negative alarm counter is kept in seconds for compatibility
    with existing clients: positive = accumulated trigger seconds, negative =
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

        # Still cooling down: update the reading, but never fire and never
        # accumulate trigger time.
        if now < cooldown_until:
            _hold_elapsed.pop(key, None)
            _above_since.pop(key, None)
            fields_to_update[counter_key] = -math.ceil(cooldown_until - now)
            store.update_sensor_fields(sensor_name, fields_to_update)
            return

        if cooldown_until:
            _cooldown_until.pop(key, None)
            _hold_elapsed.pop(key, None)
            _above_since.pop(key, None)

        above = val >= current_sensor_settings[measure + "_alarm_level"]

        if above:
            above_since = _above_since.get(key)
            if above_since is None:
                above_since = now
                _above_since[key] = above_since
            elapsed = _hold_elapsed.get(key, 0.0) + (now - above_since)
        else:
            above_since = _above_since.get(key)
            if above_since is not None:
                # Close the current above-threshold run. The time spent
                # below threshold does not add to the counter.
                _hold_elapsed[key] = (
                    _hold_elapsed.get(key, 0.0) + now - above_since
                )
                _above_since.pop(key, None)
            elapsed = _hold_elapsed.get(key, 0.0)

        if elapsed >= delay_on:
            # Fire on the reading that completes the accumulated trigger
            # time, even if this particular reading is already below.
            fields_to_update[alarm_key] = (
                current_sensor_settings[alarm_key] + 1
            )
            _hold_elapsed.pop(key, None)
            _above_since.pop(key, None)
            fields_to_update[counter_key] = -delay_off

            if delay_off > 0:
                _cooldown_until[key] = now + delay_off
        else:
            fields_to_update[counter_key] = int(elapsed)

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
