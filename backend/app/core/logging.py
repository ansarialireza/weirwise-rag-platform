"""Structured logging and correlation tracking."""

import logging
import sys

from backend.app.core.config import settings


def configure_logging() -> None:
    log_format = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
    )


logger = logging.getLogger("weirwise.platform")
