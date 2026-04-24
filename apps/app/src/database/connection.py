from __future__ import annotations
import pathlib
import threading
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from utils import Logger

_DB_PATH = pathlib.Path(__file__).parents[2] / "plunes.db"
_DATABASE_URL = f"sqlite+aiosqlite:///{_DB_PATH}"

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
            connect_args={"check_same_thread": False} # Needed for SQLite
        )
        self._session_maker = async_sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )

    async def init(self) -> None:
        """
        Ensures the database engine is ready. 
        Note: Table creation is usually handled by Base.metadata.create_all in lifespan or via Migrations.
        """
        Logger.info("[Database] SQLAlchemy engine initialized")

    @property
    def session_maker(self) -> async_sessionmaker:
        return self._session_maker

    async def close(self) -> None:
        """Dispose of the engine."""
        await self._engine.dispose()
        Logger.info("[Database] Engine disposed")

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
