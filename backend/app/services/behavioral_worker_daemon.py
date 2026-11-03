"""Dedicated daemon entrypoint for the Weirwise Behavioral Intelligence stream consumer.

Handles SIGTERM/SIGINT for clean graceful shutdown, connection teardown, and lifecycle logging.
"""

import asyncio
import logging
import signal
import sys
from backend.app.core.logging import configure_logging, logger
from backend.app.services.behavioral_worker import BehavioralStreamConsumer

configure_logging()

async def main():
    logger.info("Initializing WBI Stream Consumer Background Daemon...")
    consumer = BehavioralStreamConsumer(consumer_name="daemon_wbi_worker")
    
    stop_event = asyncio.Event()

    def _signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, initiating graceful shutdown...")
        consumer.stop()
        stop_event.set()

    # Register OS signals for graceful teardown
    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    worker_task = asyncio.create_task(consumer.run())

    try:
        await worker_task
    except asyncio.CancelledError:
        logger.info("Worker task cancelled during shutdown.")
    except Exception as e:
        logger.exception(f"Unhandled exception in WBI daemon: {e!s}")
        sys.exit(1)
    finally:
        logger.info("WBI Stream Consumer Background Daemon shutdown complete.")

if __name__ == "__main__":
    asyncio.run(main())
