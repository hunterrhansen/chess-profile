"""Where Knightly runs: on your own Mac, or as a server (in Docker, on Linux).

`KNIGHTLY_MODE=server` turns off what only makes sense on one person's Mac: the launchd daily
job, the Lichess token in the Keychain, and macOS notifications. It's the default anywhere but
macOS, so the Docker image needs no setting; on a Mac, set it to try server behaviour.
"""
import os
import sys
from pathlib import Path

MODES = ("mac", "server")


def mode() -> str:
    value = os.environ.get("KNIGHTLY_MODE") or ("mac" if sys.platform == "darwin" else "server")
    if value not in MODES:
        raise SystemExit(f"KNIGHTLY_MODE must be one of {', '.join(MODES)}, not {value!r}.")
    return value


def data_dir() -> Path:
    """Where backups and your own sounds live: $KNIGHTLY_DATA_DIR, else the folder Knightly
    runs from (the repo, on your Mac; /data in the Docker image)."""
    return Path(os.environ.get("KNIGHTLY_DATA_DIR") or Path.cwd())


def on_mac() -> bool:
    """True when the macOS-only features (launchd, Keychain, notifications) are on."""
    return mode() == "mac"
