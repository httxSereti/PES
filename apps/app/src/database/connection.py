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

            result = await conn.execute(text("PRAGMA table_info(triggered_events)"))
            event_columns = {row[1] for row in result.fetchall()}
            if event_columns and "session_id" not in event_columns:
                await conn.execute(
                    text(
                        "ALTER TABLE triggered_events "
                        "ADD COLUMN session_id VARCHAR"
                    )
                )
                logger.info("[Database] Added triggered_events.session_id")

            if event_columns:
                # `create_all` does not add an index to a table that already
                # exists, so create it explicitly (idempotent).
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_triggered_events_session_id "
                        "ON triggered_events (session_id)"
                    )
                )

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
