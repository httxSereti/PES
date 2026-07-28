"""
Bluetooth LE sensors (motion + sound): connection threads, notification
parsing, and alarm threshold checks.
"""

import asyncio
import re
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


def sensor_check_val(sensor_name: str, measure: str, val: int) -> None:
    """
    Check if the sensor can fire an alarm
    Args:
        sensor: Name of the sensor
        measure: What the sensor check
        val: sensor value

    Returns:

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
        return

    fields_to_update = {"current_" + measure: new_current_value}

    new_counter = current_sensor_settings[measure + "_alarm_counter"]

    # value is superior to alarm level
    if (
        val > current_sensor_settings[measure + "_alarm_level"]
        or current_sensor_settings[measure + "_alarm_counter"] < 0
    ):
        current_sensor_settings[measure + "_alarm_counter"] = (
            current_sensor_settings[measure + "_alarm_counter"] + 1
        )

        new_counter = new_counter + 1
        fields_to_update[measure + "_alarm_counter"] = new_counter

    # consecutive detect and activate delay_off
    if new_counter >= current_sensor_settings[measure + "_delay_on"]:
        # alarm
        fields_to_update[measure + "_alarm_number"] = (
            current_sensor_settings[measure + "_alarm_number"] + 1
        )
        # add delay before the next alarm
        fields_to_update[measure + "_alarm_counter"] = -current_sensor_settings[
            measure + "_delay_off"
        ]

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
        new_position_ref: int = pos

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

        # queue ws update
        ws_notifier.notify(
            payload_type="sensors:update",
            payload={"id": sensor_name, "changes": {"sensor_online": True}},
        )

        await client.start_notify(char_uuid, partial(sensor_notification, sensor_name))
        await disconnected_event.wait()


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
        try:
            # thread isolation
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            # run
            loop.run_until_complete(sensor_bt(sensor, addr, service))
            loop.close()
        except BleakDeviceNotFoundError:
            time.sleep(30)
        except Exception:
            logger.exception(
                f"[Sensors] Thread error in start_sensors_bt {sensor}",
                sensor_name=sensor,
            )
            time.sleep(30)


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
