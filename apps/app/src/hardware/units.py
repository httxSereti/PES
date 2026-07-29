"""
2B unit connection management: serial-over-Bluetooth link to the Mk2B units,
the per-unit hardware thread, and initial unit settings.
"""

import json
import re
import time
from typing import Optional

import bluetooth  # type: ignore
import serial.tools.list_ports  # type: ignore
import structlog

from api.ws.websocket_notifier import ws_notifier
from constants import BT_UNITS
from store import Store
from typings import UnitDict

logger = structlog.get_logger("pes")

store = Store()


class HardwareDisabled(Exception):
    """Raised when the unit is disabled at runtime while a blocking scan/connect
    is in progress, so the hardware thread can abort it immediately."""


# BT serial configuration for 2B
SERIAL_BAUDRATE = 9600
SERIAL_RETRY = 5
SERIAL_TIMEOUT = 2
SERIAL_KEEPALIVE = 20  # check every x second the connexion (100 ms steps)

# firmware command , order is important
FW_2B_CMD = {
    "level_h": "L-H",  # power Low/High
    "level_d": "-Y",  # power dynamic mode
    "power_bias": "Q",  # power bias Q0=chA,Q1=chB,Q2=avg,Q3=max
    "level_map": "O",  # power curve O0=Map A/O1=Map B/02= Map C
    "mode": "M",  # mode see mode description
    "adj_1": "C",  # waveform set 1
    "adj_2": "D",  # waveform set 2
    "adj_3": "R",  # ramp speed RO=x1,R1=x2,R2=x3,R3=x4
    "adj_4": "W",  # warp factor WO=x1,W1=x2,W2=x4,W3=x8,W4=x16,W5=x32
    "ch_A": "A",  # chA level
    "ch_B": "B",  # chB level
}

# Limit for estim level for every usage
with open("configurations/usage_limit.json") as json_file:
    USAGE_LIMIT = json.load(json_file)

# hardware units settings
with open("configurations/default_usage.json") as json_file:
    DEFAULT_USAGE = json.load(json_file)

# starting value
with open("configurations/init_settings.json") as json_file:
    DEFAULT_USAGE_SETTING = json.load(json_file)


class UnitConnect:
    """
    Manage the connexion to the 2B unit with the serial over BT
    """

    def __init__(self, unit_name: str, settings: dict) -> None:
        """
        init all attributes
        Args:
            unit_name: BT name of the 2B module UNITx
            settings: target settings for the 2B
        """
        self.name = unit_name
        self.status = "not connected"
        self.settings_target = settings
        # settings of the 2B
        self.settings_current = {
            "ch_A": 0,
            "ch_B": 0,
            "adj_1": 50,
            "adj_2": 50,
            "mode": 0,
            "level_h": False,
            "ch_link": False,
        }
        # returned values from the 2B
        self.settings_return = {
            "ch_A": 0,
            "ch_B": 0,
            "adj_1": 50,
            "adj_2": 50,
            "mode": 0,
            "level_h": False,
            "ch_link": False,
            "bat_level": 0,
        }
        # serial access for the BT connexion
        self.serial_dev = None

        # bind logger to unit for better logging
        self.logger = logger.bind(unit_name=unit_name)

        # start trying to connect the 2B
        self.detect()

    def parse_reply(self, reply_raw: bytes) -> Optional[str]:
        """
        parse the data returned by the 2B, if it's fail the serial connexion is reinitialized
        Args:
            reply_raw: raw data from serial reply of the 2B

        Returns:
            Firmware version off the 2B if successful
        """
        reply = reply_raw.decode().rstrip("\r\n")

        self.logger.debug("Received reply from 2B unit", reply=reply)

        if m := re.match(
            r"^(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):([L,H]):(\d+):(\d+):(\d+):(\d+):(\d+):(2\..+)$",
            reply,
        ):
            self.settings_return["bat_level"] = int(m[1])
            self.settings_return["ch_A"] = int(m[2]) // 2
            self.settings_return["ch_B"] = int(m[3]) // 2
            self.settings_return["adj_1"] = int(m[4]) // 2
            self.settings_return["adj_2"] = int(m[5]) // 2
            self.settings_return["mode"] = int(m[6])
            self.settings_return["level_h"] = m[7] == "H"
            self.settings_return["level_d"] = m[7] == "D"
            self.settings_return["power_bias"] = int(m[8])
            self.settings_return["level_map"] = int(m[10])
            self.settings_return["adj_4"] = int(m[11])
            self.settings_return["adj_3"] = int(m[12])

            return str(m[13])  # return firmware version
        self.logger.info("Fail to parse the 2B reply -> reconnecting", reply=reply)
        self.detect()
        return None

    def detect(self):
        """
        Detect the BT module of the 2B and initialize the serial port
        Returns: serial port object
        """
        self.settings_target["cnx_ok"] = False
        self.settings_target["sync"] = False
        # close previous open (lost connexion)
        if self.serial_dev:
            if self.serial_dev.isOpen():
                self.logger.debug("close serial port")
                self.serial_dev.close()
            else:
                self.logger.debug("port already close")

        # loop for BT serial connexion until succes
        while True:
            # abort the scan as soon as the unit is disabled at runtime
            if not store.is_hardware_enabled(self.name):
                raise HardwareDisabled(self.name)

            self.logger.info("Scanning for device using BT...")
            nearby_devices = bluetooth.discover_devices(
                duration=1, lookup_names=True, flush_cache=True, lookup_class=False
            )

            # don't spam
            if len(nearby_devices) == 0:
                time.sleep(5)

            # Loop on BT device to find the good one
            for addr, name in nearby_devices:
                if self.name == name:
                    self.logger.debug(
                        "Detected an UNIT associated on machine", address=addr
                    )
                    com_ports = list(serial.tools.list_ports.comports())
                    addr = addr.replace(":", "")

                    # Find the associated COM port
                    for com, _des, hwenu in com_ports:
                        if addr in hwenu:
                            self.logger.debug("Serial port detected", port=com)

                            for retry in range(1, SERIAL_RETRY):
                                try:
                                    self.serial_dev = serial.Serial(
                                        com,
                                        SERIAL_BAUDRATE,
                                        timeout=SERIAL_TIMEOUT,
                                        bytesize=serial.EIGHTBITS,
                                        parity=serial.PARITY_NONE,
                                        stopbits=serial.STOPBITS_ONE,
                                    )
                                except serial.SerialException:
                                    self.logger.debug(
                                        "Serial retry open", retry_count=retry
                                    )
                                    time.sleep(0.5)
                                else:
                                    self.serial_dev.write(b"E\n\r")  # reset
                                    firmware_version = self.parse_reply(
                                        self.serial_dev.readline()
                                    )
                                    if firmware_version is not None:
                                        self.logger.info(
                                            "Serial access to 2B is OK",
                                            firmware_version=firmware_version,
                                        )
                                        self.settings_target["cnx_ok"] = True

                                        ws_notifier.notify(
                                            "units:update",
                                            {
                                                "id": self.name,
                                                "changes": {"cnx_ok": True},
                                            },
                                        )

                                        return self.serial_dev
                                    self.logger.info("2B not responding")
                                    self.serial_dev.close()
                                    self.logger.debug(
                                        "Serial retry open", retry_count=retry
                                    )
                                    time.sleep(0.5)

    def send_cmd(self, cmd: str) -> Optional[str]:
        """
        Send a command to the 2B
        Args:
            cmd: command in 2B format

        Returns:
            2B text reply
        """
        cmd = cmd + "\n\r"  # standard CR for the 2B
        while True:
            try:
                self.serial_dev.write(cmd.encode())
            except serial.SerialException:
                self.detect()
            else:
                return self.parse_reply(self.serial_dev.readline())

    def check_2b_settings(self) -> bool:
        """
        Check if the 2B settings are equal to the targets values and adjusts if needed
        Returns:
            True if settings match the target
        """
        self.serial_dev.write(b"\n\r")
        self.parse_reply(self.serial_dev.readline())
        no_updated = True
        updated_fields: dict = {}

        # loop on all 2B settings (the order is important)
        for field in FW_2B_CMD.keys():
            # check if update is needed
            if self.settings_return[field] != self.settings_target[field]:
                self.logger.info(
                    "Adjust 2B Settings",
                    field=field,
                    previous=self.settings_return[field],
                    new=self.settings_target[field],
                )

                updated_fields[field] = self.settings_target[field]
                # the update command can be fixed value or an argument
                if len(FW_2B_CMD[field]) == 1:
                    cmd = "{}{}".format(FW_2B_CMD[field], self.settings_target[field])
                else:
                    cmd = FW_2B_CMD[field].split("-")[int(self.settings_target[field])]
                # if something to do
                if cmd != "":
                    self.logger.debug("Sending 2B command", cmd=cmd)
                    # check if target and 2B synchronized on the next call
                    self.settings_target["sync"] = False
                    no_updated = False
                    self.send_cmd(cmd)
        # if no change it is synchronized !
        if no_updated:
            self.settings_target["sync"] = True
        else:
            ws_notifier.notify(
                "units:update",
                {"id": self.name, "changes": updated_fields},
            )

        return no_updated


def thread_bt_unit(unit_str: str) -> None:
    """
    Manage on 2B unit, this function must run inside a thread
    Args:
        unit: name of the 2B unit like UNITx

    Returns:
    """
    unit = UnitDict(unit_str)

    while True:
        # unit disabled at runtime: mark it offline (once) and wait
        if not store.is_hardware_enabled(unit_str):
            if store.get_unit_setting(unit, "cnx_ok"):
                store.update_unit_dict(unit, {"cnx_ok": False, "sync": False})
                ws_notifier.notify(
                    "units:update",
                    {"id": unit_str, "changes": {"cnx_ok": False, "sync": False}},
                )
            time.sleep(1)
            continue
        try:
            # create bt object inside a thread
            bt = UnitConnect(unit_str, store.get_unit_dict(unit))
            last_rescan = store.get_hardware_rescan(unit_str)

            cycle = 0  # for the keepalive
            while True:
                # disabled while running: drop the connexion, back to idle loop
                if not store.is_hardware_enabled(unit_str):
                    if bt.serial_dev and bt.serial_dev.isOpen():
                        bt.serial_dev.close()
                    break

                # rescan requested from the dashboard: restart the search
                rescan = store.get_hardware_rescan(unit_str)
                if rescan != last_rescan:
                    last_rescan = rescan
                    bt.detect()

                # fetch unit data with lock and make set it as updated
                snapshot = store.consume_unit_update(unit)

                # if new values are waiting
                if snapshot:
                    # set 2B to synced
                    store.set_unit_setting(unit, "sync", False)

                    # Set the target with the new values
                    for setting in FW_2B_CMD.keys():
                        bt.settings_target[setting] = snapshot[setting]

                    bt.check_2b_settings()
                    cycle = 0  # reset keepalive

                elif cycle > SERIAL_KEEPALIVE:
                    # check connection state
                    bt.check_2b_settings()
                    cycle = 0
                else:
                    time.sleep(0.1)
                    cycle = cycle + 1
        except HardwareDisabled:
            # disabled during a blocking scan/connect: back to the idle loop
            continue
        except Exception:
            logger.exception("ThreadError for unit", unit_name=unit_str)
            # backoff in 1s steps to stay responsive to disable/rescan
            for _ in range(30):
                time.sleep(1)


def mk2b_init():
    # Init 2B threads settings
    for init_bt_name in BT_UNITS:
        # TODO: REF double init
        store.update_unit_dict(
            unit_dict=UnitDict(init_bt_name),
            changes={
                "id": init_bt_name,
                # Channel A
                "ch_A": 0,  # ch_A target level for the 2B
                "ch_A_multiplier": 100,  # percentage of level multiplier
                # Channel B
                "ch_B": 0,  # ch_B target level for the 2B
                "ch_B_multiplier": 100,  # percentage of level multiplier
                # Channels usage
                "ch_A_use": DEFAULT_USAGE[init_bt_name]["A"],  # ch_A usage
                "ch_B_use": DEFAULT_USAGE[init_bt_name]["B"],  # ch_B usage
                "ch_A_limit": USAGE_LIMIT.get(
                    DEFAULT_USAGE[init_bt_name]["A"], USAGE_LIMIT["default"]
                ),
                "ch_B_limit": USAGE_LIMIT.get(
                    DEFAULT_USAGE[init_bt_name]["B"], USAGE_LIMIT["default"]
                ),
                # waveform setting 1
                "adj_1": DEFAULT_USAGE_SETTING[init_bt_name][
                    "adj_1"
                ],  # 2B adj 1 target setting
                # waveform setting 2
                "adj_2": DEFAULT_USAGE_SETTING[init_bt_name][
                    "adj_2"
                ],  # 2B adj 2 target setting
                # 2B timer adjusts
                "adj_3": DEFAULT_USAGE_SETTING[init_bt_name]["adj_3"],  # ramp speed
                "adj_4": DEFAULT_USAGE_SETTING[init_bt_name]["adj_4"],  # wrap factor
                # power config
                "ch_link": False,  # link between ch A and B (not used)
                "level_d": False,  # Dynamic power mode
                "level_h": DEFAULT_USAGE_SETTING[init_bt_name]["level_h"],  # L/H c
                "level_map": 0,  # power map used
                "power_bias": 0,  # power bias usage
                # mode
                "mode": DEFAULT_USAGE_SETTING[init_bt_name]["mode"],  # mode
                # status
                "cnx_ok": False,  # 2B connexion status
                "sync": False,  # 2B settings are synchronized
                "updated": False,  # values are changed
            },
        )
    logger.info(f"[Units] Initialized 2B initials settings for {len(BT_UNITS)} Units.")
