"""Knowing when a server is unwell: errors to Sentry, and the worker's heartbeat.

Both are off unless configured, so your own Mac sends nothing anywhere:

- SENTRY_DSN: errors (and a sample of slow requests) from the web app and the worker go to
  Sentry, tagged with KNIGHTLY_ENV (staging, production).
- KNIGHTLY_HEARTBEAT_URL: the worker requests it every few minutes (a Better Stack heartbeat,
  say), so a worker that has died or hung raises an alert when the pings stop.
"""
import os
import urllib.request

_started = False


def init(component: str) -> bool:
    """Start Sentry for "web" or "worker", once. Returns whether it's on."""
    global _started
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False
    if not _started:
        import sentry_sdk

        sentry_sdk.init(dsn=dsn, environment=os.environ.get("KNIGHTLY_ENV", "production"),
                        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
                        send_default_pii=False)
        _started = True
    import sentry_sdk

    sentry_sdk.set_tag("component", component)
    return True


def capture(error: BaseException) -> None:
    """Report an error that was handled (a failed job), when Sentry is on."""
    if _started:
        import sentry_sdk

        sentry_sdk.capture_exception(error)


def heartbeat() -> bool:
    """Ping KNIGHTLY_HEARTBEAT_URL, if set. A failed ping is only skipped: the alert is for
    missing pings, so one blip shouldn't stop the worker."""
    url = os.environ.get("KNIGHTLY_HEARTBEAT_URL")
    if not url:
        return False
    try:
        urllib.request.urlopen(url, timeout=10).close()
    except OSError:
        return False
    return True
