"""Per-process routing state: concurrency slots and request/token rate windows.

The platform is normally served by a single API worker for provider routing.
When multiple workers or instances are used, these counters should be backed by
Redis; this module keeps the accounting local to avoid silently claiming
distributed precision we cannot guarantee.
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
        self._token_windows: dict[str, Deque[tuple[float, int]]] = {}

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

    def concurrency_available(self, credential_id: str, max_concurrency: int) -> bool:
        if max_concurrency <= 0:
            return True
        with self._lock:
            return self._in_flight.get(credential_id, 0) < max_concurrency

    def rate_limit_retry_after(self, credential_id: str, rpm: int) -> int:
        """Return seconds until a request slot is available, or 0 when the key may be used."""
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

    def token_limit_retry_after(self, credential_id: str, tpm: int, estimated_tokens: int = 0) -> int:
        """Return seconds until the token-per-minute window can accept the request."""
        if tpm <= 0:
            return 0
        now = time.monotonic()
        window_start = now - 60.0
        needed = max(0, estimated_tokens)
        with self._lock:
            window = self._token_windows.setdefault(credential_id, deque())
            while window and window[0][0] < window_start:
                window.popleft()
            used = sum(tokens for _, tokens in window)
            if used + needed <= tpm:
                return 0
            excess = used + needed - tpm
            freed = 0
            for timestamp, tokens in window:
                freed += tokens
                if freed >= excess:
                    return max(1, int(60 - (now - timestamp)) + 1)
            return 60

    def record_request(self, credential_id: str) -> None:
        with self._lock:
            self._record_request_locked(credential_id, time.monotonic())

    def record_tokens(self, credential_id: str, tokens: int) -> None:
        if tokens <= 0:
            return
        now = time.monotonic()
        window_start = now - 60.0
        with self._lock:
            window = self._token_windows.setdefault(credential_id, deque())
            while window and window[0][0] < window_start:
                window.popleft()
            window.append((now, tokens))

    def reserve(
        self,
        *,
        concurrency_limits: dict[str, int],
        rpm_limits: dict[str, int],
        tpm_limits: dict[str, tuple[int, int]],
    ) -> tuple[bool, str]:
        """Atomically check every limit and reserve a slot.

        ``concurrency_limits`` keys are always tracked even when the limit is 0
        (unlimited) so least-loaded routing and dashboards stay accurate.
        ``rpm_limits`` and ``tpm_limits`` only include configured limits.
        """
        now = time.monotonic()
        window_start = now - 60.0
        with self._lock:
            for key, maximum in concurrency_limits.items():
                if maximum > 0 and self._in_flight.get(key, 0) >= maximum:
                    return False, "concurrency"

            for key, rpm in rpm_limits.items():
                window = self._request_windows.setdefault(key, deque())
                while window and window[0] < window_start:
                    window.popleft()
                if len(window) >= rpm:
                    return False, "rpm"

            for key, (tpm, estimated_tokens) in tpm_limits.items():
                token_window: Deque[tuple[float, int]] = self._token_windows.setdefault(key, deque())
                while token_window and token_window[0][0] < window_start:
                    token_window.popleft()
                used = sum(tokens for _, tokens in token_window)
                if used + max(0, estimated_tokens) > tpm:
                    return False, "tpm"

            for key in concurrency_limits:
                self._in_flight[key] = self._in_flight.get(key, 0) + 1
            for key in rpm_limits:
                self._record_request_locked(key, now)
            for key, (_, estimated_tokens) in tpm_limits.items():
                if estimated_tokens > 0:
                    self._token_windows[key].append((now, estimated_tokens))
            return True, ""

    def release(self, keys: tuple[str, ...] | list[str]) -> None:
        with self._lock:
            for key in keys:
                remaining = self._in_flight.get(key, 0) - 1
                if remaining > 0:
                    self._in_flight[key] = remaining
                else:
                    self._in_flight.pop(key, None)

    def _record_request_locked(self, key: str, now: float) -> None:
        window_start = now - 60.0
        window = self._request_windows.setdefault(key, deque())
        while window and window[0] < window_start:
            window.popleft()
        window.append(now)

    def snapshot(self, key: str) -> dict[str, int]:
        """Live utilization for one key, used by the admin dashboards."""
        now = time.monotonic()
        window_start = now - 60.0
        with self._lock:
            request_window = self._request_windows.get(key)
            rpm_used = 0
            if request_window is not None:
                while request_window and request_window[0] < window_start:
                    request_window.popleft()
                rpm_used = len(request_window)
            token_window = self._token_windows.get(key)
            tpm_used = 0
            if token_window is not None:
                while token_window and token_window[0][0] < window_start:
                    token_window.popleft()
                tpm_used = sum(tokens for _, tokens in token_window)
            return {
                "in_flight": self._in_flight.get(key, 0),
                "rpm_used": rpm_used,
                "tpm_used": tpm_used,
            }

    def reset(self) -> None:
        with self._lock:
            self._in_flight.clear()
            self._request_windows.clear()
            self._token_windows.clear()


routing_state = RoutingStateTracker()
