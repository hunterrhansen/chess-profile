"""Run `knightly update` daily via a macOS launchd agent.

launchd rather than cron because a StartCalendarInterval job that was missed while the Mac
slept runs as soon as it wakes. (A Mac that was fully shut down just catches up the next day:
every step is incremental, so nothing is lost.)
"""

import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

LABEL = "com.knightly.update"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
LOG = Path.home() / "Library" / "Logs" / "knightly.log"
SCHEDULED_WORKERS = 3  # leave most cores free; a day's games take a minute or two anyway


def _executable() -> str:
    """The installed `knightly` entry point, as an absolute path (launchd has no PATH)."""
    candidate = Path(sys.executable).parent / "knightly"
    if candidate.exists():
        return str(candidate)
    found = shutil.which("knightly")
    if not found:
        raise SystemExit("Can't find the `knightly` executable; run this via `uv run knightly`.")
    return str(Path(found).resolve())


def build_plist(db_path: Path, hour: int, minute: int, stockfish: str | None) -> dict:
    db_path = Path(db_path).resolve()
    env = {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"}
    if stockfish:
        env["STOCKFISH"] = stockfish
    return {
        "Label": LABEL,
        "ProgramArguments": [_executable(), "--db", str(db_path), "update", "--scheduled",
                             "--workers", str(SCHEDULED_WORKERS)],
        "StartCalendarInterval": {"Hour": hour, "Minute": minute},
        "WorkingDirectory": str(db_path.parent),
        "EnvironmentVariables": env,
        "StandardOutPath": str(LOG),
        "StandardErrorPath": str(LOG),
        "ProcessType": "Background",  # macOS throttles CPU/IO for background jobs
        "Nice": 10,                   # inherited by the Stockfish workers
        "LowPriorityIO": True,
    }


def _launchctl(*args) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def install(db_path: Path, hour: int = 6, minute: int = 0, log=print) -> None:
    if not Path(db_path).exists():
        raise SystemExit(f"No database at {db_path}; run a sync first.")
    stockfish = os.environ.get("STOCKFISH") or shutil.which("stockfish")
    if not stockfish:
        log("warning: Stockfish not found; scheduled runs will sync and back up but not analyse.")
    plist = build_plist(db_path, hour, minute, stockfish)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)

    domain = f"gui/{os.getuid()}"
    _launchctl("bootout", f"{domain}/{LABEL}")  # replace any previous install; fails harmlessly if none
    PLIST.write_bytes(plistlib.dumps(plist))
    result = _launchctl("bootstrap", domain, str(PLIST))
    if result.returncode != 0:
        raise SystemExit(f"launchctl bootstrap failed: {result.stderr.strip() or result.stdout.strip()}")
    log(f"Installed: `knightly update` runs daily at {hour:02d}:{minute:02d} "
        f"(or on wake if the Mac was asleep).")
    log(f"  database: {Path(db_path).resolve()}")
    log(f"  log:      {LOG}")
    log(f"  agent:    {PLIST}")


def uninstall(log=print) -> None:
    _launchctl("bootout", f"gui/{os.getuid()}/{LABEL}")
    if PLIST.exists():
        PLIST.unlink()
        log(f"Removed {PLIST}; daily updates are off.")
    else:
        log("Not installed.")


def run_now(log=print) -> None:
    """Kick the installed job immediately, exactly as launchd would run it."""
    result = _launchctl("kickstart", f"gui/{os.getuid()}/{LABEL}")
    if result.returncode != 0:
        raise SystemExit("Not installed (run `knightly schedule install` first).")
    log(f"Started; follow it with: tail -f {LOG}")


def current() -> dict | None:
    """The installed schedule as {"hour", "minute", "loaded"}, or None if not installed."""
    if not PLIST.exists():
        return None
    when = plistlib.loads(PLIST.read_bytes())["StartCalendarInterval"]
    loaded = _launchctl("print", f"gui/{os.getuid()}/{LABEL}").returncode == 0
    return {"hour": when["Hour"], "minute": when["Minute"], "loaded": loaded}


def status(conn, log=print) -> None:
    if PLIST.exists():
        cfg = plistlib.loads(PLIST.read_bytes())
        when = cfg["StartCalendarInterval"]
        loaded = _launchctl("print", f"gui/{os.getuid()}/{LABEL}").returncode == 0
        log(f"Schedule: daily at {when['Hour']:02d}:{when['Minute']:02d}"
            f"{'' if loaded else '  (plist present but NOT loaded; reinstall)'}")
        log(f"  database: {cfg['ProgramArguments'][2]}")
        log(f"  log:      {LOG}")
    else:
        log("Schedule: not installed (`knightly schedule install`).")
    rows = conn.execute("""SELECT started_at, status, trigger, new_games, new_puzzles,
                                  games_analysed, errors FROM runs ORDER BY id DESC LIMIT 5""").fetchall()
    if not rows:
        log("No runs yet.")
        return
    log("Recent runs:")
    for r in rows:
        line = (f"  {r['started_at']}  {r['status']:<8} {r['trigger'] or '':<9}"
                f" {r['new_games'] or 0} games, {r['new_puzzles'] or 0} puzzles,"
                f" {r['games_analysed'] or 0} analysed")
        log(line + (f"  errors: {r['errors']}" if r["errors"] else ""))
