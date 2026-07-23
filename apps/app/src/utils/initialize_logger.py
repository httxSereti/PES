from pathlib import Path
import logging
import sys

import structlog


def initialize_logger(
    session_name: str,
    logger_name: str = "pes",
    log_dir: str = "logs",
    level: int = logging.INFO,
) -> structlog.BoundLogger:
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)

    log_file = log_path / f"{session_name}_logs.txt"

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=False),
        structlog.processors.dict_tracebacks,
    ]

    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processor=structlog.dev.ConsoleRenderer(colors=True),
    )

    file_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processor=structlog.processors.JSONRenderer(),
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)

    file_handler = logging.FileHandler(
        filename=log_file,
        encoding="utf-8",
    )
    file_handler.setFormatter(file_formatter)

    stdlib_logger = logging.getLogger(logger_name)

    stdlib_logger.handlers.clear()

    stdlib_logger.addHandler(console_handler)
    stdlib_logger.addHandler(file_handler)

    stdlib_logger.setLevel(level)
    stdlib_logger.propagate = False

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    return structlog.wrap_logger(stdlib_logger)
