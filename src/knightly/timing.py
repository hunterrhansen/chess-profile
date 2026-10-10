"""Request-scoped durations only: no moves, user IDs, tokens or request bodies."""
from contextlib import contextmanager
from contextvars import ContextVar
from time import perf_counter

_current = ContextVar("practice_timings", default=None)


@contextmanager
def collect():
    sample = {}
    token = _current.set(sample)
    try:
        yield sample
    finally:
        _current.reset(token)


@contextmanager
def stage(phase):
    sample = _current.get()
    if sample is None:
        yield
        return
    start = perf_counter()
    try:
        yield
    finally:
        sample[phase] = sample.get(phase, 0) + (perf_counter() - start) * 1000


def call(phase, work, *args, **kwargs):
    with stage(phase):
        return work(*args, **kwargs)
