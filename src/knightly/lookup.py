"""An account on Chess.com or Lichess, looked up before it's added: "Is this you?" in the
welcome flow. Public profiles only; nothing is saved.
"""
import urllib.error
from datetime import datetime, timezone

from .http import get_json

CHESSCOM = "https://api.chess.com/pub/player"
LICHESS = "https://lichess.org/api/user"


def headline_rating(source: str, data: dict | None) -> dict:
    """An account's one number: its rating in the speed it plays most, else (a Lichess
    account used for puzzles only) its puzzle rating. `data` is Chess.com's stats or a
    Lichess profile."""
    best = None  # (games, rating, kind)
    if data and source == "chesscom":
        for speed in ("rapid", "blitz", "bullet", "daily"):
            s = data.get(f"chess_{speed}") or {}
            games = sum((s.get("record") or {}).get(k, 0) for k in ("win", "loss", "draw"))
            if s.get("last") and (best is None or games > best[0]):
                best = (games, s["last"]["rating"], speed.capitalize())
    elif data and source == "lichess":
        perfs = data.get("perfs") or {}
        for speed in ("rapid", "blitz", "bullet", "classical", "correspondence"):
            p = perfs.get(speed) or {}
            if p.get("games") and (best is None or p["games"] > best[0]):
                best = (p["games"], p["rating"], speed.capitalize())
        if best is None and (perfs.get("puzzle") or {}).get("games"):
            best = (perfs["puzzle"]["games"], perfs["puzzle"]["rating"], "Puzzles")
    return {"rating": best[1], "rating_kind": best[2]} if best else {"rating": None, "rating_kind": None}


def _missing(e: urllib.error.HTTPError) -> bool:
    return e.code in (404, 410)


def account(source: str, handle: str) -> dict | None:
    """{"source", "handle", "rating", "rating_kind", "games", "since"} for a username, or None
    when the site has no such account. `games` counts rated games; `since` is the month of
    the first game ("2026-01"), None with no games."""
    try:
        if source == "chesscom":
            profile = get_json(f"{CHESSCOM}/{handle}")
            stats = get_json(f"{CHESSCOM}/{handle}/stats")
            archives = get_json(f"{CHESSCOM}/{handle}/games/archives").get("archives") or []
            games = sum(sum((stats.get(f"chess_{s}") or {}).get("record", {}).get(k, 0) for k in ("win", "loss", "draw"))
                        for s in ("rapid", "blitz", "bullet", "daily"))
            since = "-".join(archives[0].rstrip("/").split("/")[-2:]) if archives else None
            name = profile.get("url", "").rstrip("/").split("/")[-1] or profile.get("username") or handle
            return {"source": source, "handle": name, **headline_rating(source, stats), "games": games, "since": since}
        if source == "lichess":
            user = get_json(f"{LICHESS}/{handle}")
            if user.get("disabled") or user.get("tosViolation"):
                return None
            games = (user.get("count") or {}).get("rated", 0)
            created = user.get("createdAt")
            since = datetime.fromtimestamp(created / 1000, timezone.utc).strftime("%Y-%m") if created and games else None
            return {"source": source, "handle": user.get("username") or handle, **headline_rating(source, user),
                    "games": games, "since": since}
    except urllib.error.HTTPError as e:
        if _missing(e):
            return None
        raise
    raise ValueError(f"unknown source {source!r}")
