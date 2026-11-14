from __future__ import annotations
import pathlib
import structlog
import threading
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

_DB_PATH = pathlib.Path(__file__).parents[2] / "plunes.db"
_DATABASE_URL = f"sqlite+aiosqlite:///{_DB_PATH}"

logger = structlog.get_logger("pes")


class Database:
    """
    Singleton Async SQLAlchemy engine manager.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    @classmethod
    def get_instance(cls) -> Database:
        if cls._instance is None:
            # Fallback to creating it if not already exists
            return cls()
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._engine = create_async_engine(
            _DATABASE_URL,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False},  # Needed for SQLite
        )
        self._session_maker = async_sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )

    async def init(self) -> None:
        """
        Ensures the database engine is ready.
        Note: Table creation is usually handled by Base.metadata.create_all in lifespan or via Migrations.
        """
        logger.info("[Database] SQLAlchemy engine initialized")

    async def ensure_schema(self) -> None:
        """
        Apply additive SQLite migrations that create_all cannot express.

        `create_all` only creates missing tables; new columns on an existing
        table have to be added explicitly. Keep this list idempotent.
        """
        async with self._engine.begin() as conn:
            result = await conn.execute(text("PRAGMA table_info(sessions)"))
            columns = {row[1] for row in result.fetchall()}
            if columns and "integration_ids" not in columns:
                await conn.execute(
                    text("ALTER TABLE sessions ADD COLUMN integration_ids JSON")
                )
                logger.info("[Database] Added sessions.integration_ids")

            result = await conn.execute(
                text("PRAGMA table_info(training_edging_sessions)")
            )
            edging_session_columns = {row[1] for row in result.fetchall()}
            if edging_session_columns:
                edging_session_migrations = {
                    "app_session_id": "VARCHAR",
                    "program_id": "VARCHAR",
                    "program_step": "INTEGER",
                    "mode": "VARCHAR DEFAULT 'manual'",
                    "guided_config": "JSON",
                    "min_edge_interval_seconds": "INTEGER DEFAULT 0",
                    "notification_level": "VARCHAR DEFAULT 'all'",
                    "allow_partner_edges": "BOOLEAN DEFAULT 0",
                    "visibility": "VARCHAR DEFAULT 'private'",
                    "participant_ids": "JSON",
                    "paused_at": "DATETIME",
                    "total_paused_seconds": "INTEGER DEFAULT 0",
                }
                for column, sql_type in edging_session_migrations.items():
                    if column not in edging_session_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE training_edging_sessions "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(
                            f"[Database] Added training_edging_sessions.{column}"
                        )
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_training_edging_sessions_app_session_id "
                        "ON training_edging_sessions (app_session_id)"
                    )
                )
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_training_edging_sessions_program_id "
                        "ON training_edging_sessions (program_id)"
                    )
                )

            result = await conn.execute(
                text("PRAGMA table_info(training_edging_templates)")
            )
            template_columns = {row[1] for row in result.fetchall()}
            if template_columns:
                template_migrations = {
                    "mode": "VARCHAR DEFAULT 'manual'",
                    "guided_config": "JSON",
                    "participant_ids": "JSON",
                    "min_edge_interval_seconds": "INTEGER DEFAULT 0",
                    "notification_level": "VARCHAR DEFAULT 'all'",
                    "allow_partner_edges": "BOOLEAN DEFAULT 0",
                    "visibility": "VARCHAR DEFAULT 'private'",
                }
                for column, sql_type in template_migrations.items():
                    if column not in template_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE training_edging_templates "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(
                            f"[Database] Added training_edging_templates.{column}"
                        )

            result = await conn.execute(
                text("PRAGMA table_info(training_edging_programs)")
            )
            program_columns = {row[1] for row in result.fetchall()}
            if program_columns:
                program_migrations = {
                    "goals": "JSON",
                    "reward_profile": "VARCHAR",
                    "reward_level_pct": "INTEGER DEFAULT 80",
                    "rewarded_at": "DATETIME",
                }
                for column, sql_type in program_migrations.items():
                    if column not in program_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE training_edging_programs "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(
                            f"[Database] Added training_edging_programs.{column}"
                        )

            result = await conn.execute(
                text("PRAGMA table_info(training_edging_edges)")
            )
            edging_edge_columns = {row[1] for row in result.fetchall()}
            if edging_edge_columns:
                edging_edge_migrations = {
                    "source": "VARCHAR DEFAULT 'host'",
                    "interval_seconds": "INTEGER",
                    "level_snapshot": "JSON",
                    "note": "TEXT",
                    "client_edge_id": "VARCHAR",
                }
                for column, sql_type in edging_edge_migrations.items():
                    if column not in edging_edge_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE training_edging_edges "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(
                            f"[Database] Added training_edging_edges.{column}"
                        )
                await conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS "
                        "uq_edging_edge_client "
                        "ON training_edging_edges (session_id, client_edge_id)"
                    )
                )

            result = await conn.execute(text("PRAGMA table_info(triggered_events)"))
            event_columns = {row[1] for row in result.fetchall()}
            if event_columns:
                # Keep this list idempotent: SQLite has no
                # `ADD COLUMN IF NOT EXISTS`, so each ALTER is gated on
                # PRAGMA table_info.
                event_migrations = {
                    "session_id": "VARCHAR",
                    "occurred_at": "DATETIME",
                    "source": "VARCHAR",
                    "actor_id": "VARCHAR",
                    "correlation_id": "VARCHAR",
                    "causation_id": "VARCHAR",
                    "dedupe_key": "VARCHAR",
                    "severity": "VARCHAR DEFAULT 'info'",
                    "tags": "JSON",
                    "version": "INTEGER DEFAULT 1",
                }
                for column, sql_type in event_migrations.items():
                    if column not in event_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE triggered_events "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(f"[Database] Added triggered_events.{column}")

                # `create_all` does not add an index to a table that already
                # exists, so create the new indexes explicitly (idempotent).
                event_indexes = {
                    "ix_triggered_events_session_id": "session_id",
                    "ix_triggered_events_source": "source",
                    "ix_triggered_events_actor_id": "actor_id",
                    "ix_triggered_events_correlation_id": "correlation_id",
                }
                for index_name, column in event_indexes.items():
                    await conn.execute(
                        text(
                            f"CREATE INDEX IF NOT EXISTS {index_name} "
                            f"ON triggered_events ({column})"
                        )
                    )

            result = await conn.execute(text("PRAGMA table_info(trigger_rules)"))
            rule_columns = {row[1] for row in result.fetchall()}
            if rule_columns:
                rule_migrations = {
                    "conditions": "JSON",
                    "condition_mode": "VARCHAR DEFAULT 'all'",
                    "cooldown_seconds": "INTEGER DEFAULT 0",
                    "window_count": "INTEGER DEFAULT 0",
                    "window_seconds": "INTEGER DEFAULT 0",
                    "budget_count": "INTEGER DEFAULT 0",
                    "budget_window_seconds": "INTEGER DEFAULT 3600",
                    "budget_per_actor": "BOOLEAN DEFAULT 0",
                    "requires_approval": "BOOLEAN DEFAULT 0",
                    "approval_timeout_seconds": "INTEGER DEFAULT 300",
                }
                for column, sql_type in rule_migrations.items():
                    if column not in rule_columns:
                        await conn.execute(
                            text(
                                "ALTER TABLE trigger_rules "
                                f"ADD COLUMN {column} {sql_type}"
                            )
                        )
                        logger.info(f"[Database] Added trigger_rules.{column}")

            result = await conn.execute(text("PRAGMA table_info(trigger_actions)"))
            action_columns = {row[1] for row in result.fetchall()}
            if action_columns and "modifiers" not in action_columns:
                await conn.execute(
                    text(
                        "ALTER TABLE trigger_actions "
                        "ADD COLUMN modifiers JSON"
                    )
                )
                logger.info("[Database] Added trigger_actions.modifiers")

    @property
    def session_maker(self) -> async_sessionmaker:
        return self._session_maker

    async def close(self) -> None:
        """Dispose of the engine."""
        await self._engine.dispose()
        logger.info("[Database] Engine disposed")

    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Provides an async session."""
        async with self._session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
