"""Per-process routing state: in-flight counters and token rate windows.

The platform is normally served by a single API worker for provider routing.
When multiple workers are used, rate limiting should be backed by Redis; this
module keeps the accounting local to avoid silently claiming distributed
precision we cannot guarantee.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque


class RoutingStateTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._in_flight: dict[str, int] = {}
        self._request_windows: dict[str, Deque[float]] = {}

    def begin_request(self, credential_id: str) -> None:
        with self._lock:
            self._in_flight[credential_id] = self._in_flight.get(credential_id, 0) + 1

    def end_request(self, credential_id: str) -> None:
        with self._lock:
            remaining = self._in_flight.get(credential_id, 0) - 1
            if remaining > 0:
                self._in_flight[credential_id] = remaining
            else:
                self._in_flight.pop(credential_id, None)

    def in_flight(self, credential_id: str) -> int:
        with self._lock:
            return self._in_flight.get(credential_id, 0)

    def rate_limit_retry_after(self, credential_id: str, rpm: int) -> int:
        """Return seconds until a slot is available, or 0 when the token may be used."""
        if rpm <= 0:
            return 0
        now = time.monotonic()
        window_start = now - 60.0
        with self._lock:
            window = self._request_windows.setdefault(credential_id, deque())
            while window and window[0] < window_start:
                window.popleft()
            if len(window) >= rpm:
                return max(1, int(60 - (now - window[0])) + 1)
            return 0

    def record_request(self, credential_id: str) -> None:
        with self._lock:
            window = self._request_windows.setdefault(credential_id, deque())
            window.append(time.monotonic())

    def reset(self) -> None:
        with self._lock:
            self._in_flight.clear()
            self._request_windows.clear()


routing_state = RoutingStateTracker()
