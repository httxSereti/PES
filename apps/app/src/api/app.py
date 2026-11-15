"""
FastAPI application assembly: lifespan, routers, middleware.
"""

import asyncio
import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.rest import admin, auth, logs, users
from api.rest import events_v3 as events_v3_router
from api.rest import flow_graphs as flow_graphs_router
from api.rest import integrations as integrations_router
from api.rest import trigger_rules as trigger_rules_router
from api.ws.endpoint import router as ws_router
from api.ws.websocket_notifier import ws_notifier
from database.connection import Database
from database.seed import seed_from_json
from events.dispatcher import EventDispatcher
from events.queue import ActionQueue
from events.v3 import get_v3_config
from hardware.sensors import sensor_alarm_check
from integrations import IntegrationContext, integration_registry
from services.neutralize import neutralize_all
from services.profiles import list_profiles
from services.users import user_service
from store import Store
from utils import send_discord_startup_message

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


async def training_tick_loop():
    """Auto-stop edging sessions when their duration goal is reached."""
    from services.training import tick_running_sessions

    while True:
        try:
            await tick_running_sessions()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Training] Task exception for training tick")
        await asyncio.sleep(1)


async def flow_scheduler_loop():
    """Run `trigger.schedule` FlowSpec nodes at their configured interval."""
    from database.repositories.trigger_rule_repo import TriggerRuleRepo
    from events.dispatcher import EventDispatcher

    try:
        dispatcher = EventDispatcher.get_instance()
    except RuntimeError:
        logger.warning("[Events v3] Scheduler disabled: dispatcher not initialized")
        return
    last_run: dict[str, float] = {}
    while True:
        try:
            rules = await TriggerRuleRepo().get_all_rules()
            now = time.monotonic()
            for rule in rules:
                if not rule.enabled or not isinstance(rule.graph, dict):
                    continue
                for node in rule.graph.get("nodes") or []:
                    if not isinstance(node, dict) or node.get("type") != "trigger.schedule":
                        continue
                    config = node.get("config") or {}
                    try:
                        interval = max(30, int(config.get("interval_seconds", 0) or 0))
                    except (TypeError, ValueError):
                        interval = 0
                    if interval <= 0:
                        break
                    key = f"{rule.id}:{node.get('id')}"
                    if now - last_run.get(key, 0.0) < interval:
                        break
                    last_run[key] = now
                    logger.info(
                        "[Events v3] Scheduled flow run",
                        rule_id=rule.id,
                        node_id=node.get("id"),
                        interval_seconds=interval,
                    )
                    await dispatcher.run_rule_manual(
                        rule.id,
                        event_data={"schedule": True, "node_id": node.get("id")},
                    )
                    break
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Events v3] Scheduler tick failed")
        await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    loop = asyncio.get_event_loop()
    v3_config = get_v3_config()
    logger.info(
        "[Events v3] rollout flags",
        enabled=v3_config.enabled,
        shadow_mode=v3_config.shadow_mode,
        telemetry=v3_config.telemetry,
        scheduler=v3_config.scheduler,
        dedupe_ttl_seconds=v3_config.dedupe_ttl_seconds,
        retention_days=v3_config.retention_days,
        max_workers=v3_config.max_workers,
    )
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
    from database.models.edging_session import EdgingSession  # noqa: F401
    from database.models.edging_edge import EdgingEdge  # noqa: F401
    from database.models.edging_template import EdgingTemplate  # noqa: F401
    from database.models.edging_program import EdgingProgram  # noqa: F401
    from database.models.app_session import AppSession  # noqa: F401
    from database.models.lovense import (  # noqa: F401
        LovenseDevice,
        LovenseNode,
        LovensePattern,
        LovenseRun,
    )
    from database.models.actor import (  # noqa: F401
        Actor,
        ActorIdentity,
        ActorStats,
    )
    from database.models.flow import (  # noqa: F401
        EffectLedger,
        FlowDef,
        FlowRun,
        FlowTriggerIndex,
        FlowVersion,
        NodeRun,
    )
    from database.models.approval import ApprovalRequest  # noqa: F401
    from database.models.trigger_rule import TriggerRuleVersion  # noqa: F401

    async with db._engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await db.ensure_schema()

    if v3_config.retention_days > 0:
        from database.repositories.flow_repo import FlowRepo

        repo = FlowRepo(db)
        pruned_runs = await repo.prune_runs(v3_config.retention_days)
        pruned_approvals = await repo.prune_approvals(v3_config.retention_days)
        logger.info(
            "[Events v3] retention cleanup",
            runs=pruned_runs,
            approvals=pruned_approvals,
            retention_days=v3_config.retention_days,
        )

    # Any training session still marked running belongs to a previous process
    # (crash or restart): close it so it no longer blocks new sessions.
    from services.training import recover_orphan_sessions

    await recover_orphan_sessions()

    # Auto-stop sessions whose duration goal is reached.
    training_task = asyncio.create_task(training_tick_loop())

    await seed_from_json(db)

    # Load persisted users into the Store cache, then bootstrap HOST if needed
    await user_service.migrate_legacy_root_role()
    await user_service.load_from_db()
    await user_service.ensure_host_bootstrap()

    # Inject the runtime context into every integration (webhooks, clients)
    await integration_registry.start(
        IntegrationContext(
            store=store,
            dispatcher=EventDispatcher.get_instance(),
            registry=integration_registry,
            notifier=ws_notifier,
        )
    )

    scheduler_task = (
        asyncio.create_task(flow_scheduler_loop())
        if get_v3_config().scheduler
        else None
    )

    # Notify Discord that the app started successfully
    await send_discord_startup_message(profile_count=len(list_profiles()))

    yield

    # shutdown
    queue_task.cancel()
    alarm_task.cancel()
    training_task.cancel()
    if scheduler_task is not None:
        scheduler_task.cancel()
    try:
        await training_task
    except asyncio.CancelledError:
        pass
    if scheduler_task is not None:
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    # Same neutralize path as session end and the panic stop: no ramp or
    # queued action may outlive the process and leave a unit driven.
    await neutralize_all(reason="shutdown")
    # Do not leave a "running" training session behind across restarts.
    await recover_orphan_sessions()
    await integration_registry.stop()
    await db.close()


app = FastAPI(lifespan=lifespan)

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(logs.router)
app.include_router(integrations_router.router)
for integration_router in integration_registry.routers():
    app.include_router(integration_router)
app.include_router(trigger_rules_router.router)
app.include_router(events_v3_router.router)
app.include_router(flow_graphs_router.router)
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
