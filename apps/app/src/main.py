"""
PlunEStim composition root: wire the core singletons, then start the hardware
threads and the FastAPI server.
"""

import json
import logging
from datetime import datetime
from threading import Thread

import dotenv
import uvicorn

from api.app import app
from api.ws.websocket_notifier import ws_notifier
from constants import BT_UNITS
from database.connection import Database
from events.dispatcher import EventDispatcher
from events.executor import ActionExecutor
from events.queue import ActionQueue
from events.registry import EventRegistry
from hardware.sensors import thread_sensors_bt
from hardware.units import mk2b_init, thread_bt_unit
from store import Store
from utils import initialize_logger

# load env
dotenv.load_dotenv("config.env")

# Configure logger to make log readable
start_time = datetime.now()
session_name = start_time.strftime("%d_%m_%y_%Hh%M")
logger = initialize_logger(session_name=session_name, level=logging.INFO)

# init logging TODO: refactor here
std_logger = logging.getLogger()


# filter
def filter_Logger(record):
    # if record.module == 'proactor_events':
    #   return False
    return True


# File
logging.basicConfig(
    level=logging.DEBUG,
    format="[%(asctime)s] %(threadName)s %(module)s %(message)s",
    datefmt="%H:%M:%S",
    filename="log.txt",
    filemode="w",
)
# Console
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(
    logging.Formatter("[%(asctime)s] %(threadName)s %(module)s %(message)s")
)
console.addFilter(filter_Logger)
std_logger.addHandler(console)

# DEBUG setting
# Hardware connexion search is toggled at runtime per device (persisted in
# configurations/hardware.json) via the WS `hardware:*` commands; hardware
# threads always run and idle while their device is disabled in the Store.

# Bluetooth sensors type/mac/service_id
with open("configurations/bt_sensors.json") as json_file:
    BT_SENSORS = json.load(json_file)

# Instantiate the core singletons in order (Database -> Store -> events pipeline)
db = Database()
store = Store()
registry = EventRegistry(db)
executor = ActionExecutor(store, ws_notifier=ws_notifier)
action_queue = ActionQueue(executor, ws_notifier=ws_notifier)
dispatcher = EventDispatcher(registry, action_queue, ws_notifier=ws_notifier)


# REST API
def start_api():
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    logger.info("Starting PlunEStim 1.0.0")

    threads = {}

    # init thread for BT sensors
    for name, addr, service in BT_SENSORS:
        threads[name] = Thread(target=thread_sensors_bt, args=(name, addr, service))

    mk2b_init()
    # init threads for each mk2b unit
    for bt_name in BT_UNITS:
        threads[bt_name] = Thread(target=thread_bt_unit, args=(bt_name,))

    # start all thread
    for tr in threads.keys():
        logger.info(f"[Main] Starting thread '{tr}'!", thread_name=tr)
        threads[tr].daemon = True
        threads[tr].start()

    # run the API on the main thread (blocking). User loading + ROOT
    # bootstrap happen in the FastAPI lifespan (async, DB-backed).
    start_api()
