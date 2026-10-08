"""What one person can use of a shared server, so nobody's history crowds out anyone else's.

Measured on a real account (687 games): a game takes about 3 KB to keep and 11 KB more once
analysed (its moves). So the two limits that bound storage and engine time are how far back
a first import reaches and how many games are analysed in all; past that, Knightly keeps up
with new games but stops working back through old ones. Both are off on your own Mac.

  KNIGHTLY_HISTORY_MONTHS  first import reaches back this far (server default 24; 0 = all)
  KNIGHTLY_MAX_ANALYSED    backfills stop once this many games are analysed (server default
                           1000; 0 = all). New games are always analysed.

The engine endpoints (a move's Why/Best line, the bot's moves) share a rate limit per person,
and each person can follow a few accounts.
"""
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date

from . import config

MAX_ACCOUNTS = 4
ENGINE_PER_MINUTE = 60  # far more than anyone playing or reviewing; stops a script


def _setting(name: str, server_default: int) -> int | None:
    raw = os.environ.get(name)
    value = int(raw) if raw else (None if config.on_mac() else server_default)
    return value or None  # 0 means no limit


def history_months() -> int | None:
    return _setting("KNIGHTLY_HISTORY_MONTHS", 24)


def max_analysed() -> int | None:
    return _setting("KNIGHTLY_MAX_ANALYSED", 1000)


def history_since(today: date | None = None) -> str | None:
    """'YYYY-MM': the first month a first import fetches, or None for everything."""
    months = history_months()
    if months is None:
        return None
    today = today or date.today()
    index = today.year * 12 + today.month - 1 - months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def backfill_room(analysed: int) -> int | None:
    """How many more old games may be analysed (None: no limit)."""
    cap = max_analysed()
    return None if cap is None else max(0, cap - analysed)


def describe() -> dict:
    return {"history_months": history_months(), "max_analysed": max_analysed(),
            "max_accounts": MAX_ACCOUNTS}


class RateLimit:
    """At most `per_minute` calls per key in any minute (in memory: one web process)."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self.calls: dict[object, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self.lock:
            calls = self.calls[key]
            while calls and calls[0] <= now - 60:
                calls.popleft()
            if len(calls) >= self.per_minute:
                return False
            calls.append(now)
            return True
