"""
FastAPI application assembly: lifespan, routers, middleware.
"""

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.rest import users, auth, admin
from api.rest import trigger_rules as trigger_rules_router
from api.rest.webhooks import chaster as chaster_webhooks
from api.ws.endpoint import router as ws_router
from api.ws.websocket_notifier import ws_notifier
from database.connection import Database
from database.seed import seed_from_json
from events.dispatcher import EventDispatcher
from events.queue import ActionQueue
from hardware.sensors import sensor_alarm_check
from services.users import user_service
from store import Store

logger = structlog.get_logger("pes")

store = Store()
db = Database()


async def queue_tick_loop():
    """Tick the event action queue once per second (owned by the API loop)."""
    action_queue = ActionQueue.get_instance()
    while True:
        try:
            await action_queue.tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Queue] Task exception for queue tick")
        await asyncio.sleep(1)


async def sensor_alarm_loop():
    """Check BT sensor alarms once per second (owned by the API loop)."""
    while True:
        try:
            await sensor_alarm_check()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Sensors] Task exception for sensor alarm check")
        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    loop = asyncio.get_event_loop()
    ws_notifier.setup(loop)
    asyncio.create_task(ws_notifier.consume(store.websocket))

    # Per-second action queue tick
    queue_task = asyncio.create_task(queue_tick_loop())

    # Per-second sensor alarm check
    alarm_task = asyncio.create_task(sensor_alarm_loop())

    # Initialize database and seed data
    await db.init()

    # Create tables if they don't exist
    from database.base import Base
    from database.models.triggered_event import (
        TriggeredEvent,
    )  # ensure table is registered
    from database.models.magic_token import MagicTokenModel  # noqa: F401
    from database.models.user import UserModel  # noqa: F401

    async with db._engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await seed_from_json(db)

    # Load persisted users into the Store cache, then bootstrap ROOT if needed
    await user_service.load_from_db()
    await user_service.ensure_root_bootstrap()

    # Inject into routers
    chaster_webhooks.setup(EventDispatcher.get_instance())

    yield

    # shutdown
    queue_task.cancel()
    alarm_task.cancel()
    await db.close()


app = FastAPI(lifespan=lifespan)

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(chaster_webhooks.router)
app.include_router(trigger_rules_router.router)
app.include_router(ws_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def api_home():
    return {"version": "1.0.0", "app": "PlunEStim"}
