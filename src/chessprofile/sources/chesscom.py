"""Chess.com via the public Published-Data API (no auth): https://www.chess.com/news/view/published-data-api

Games come in monthly archives. We remember the last month synced and re-fetch from
there on, since the current month keeps growing. Chess.com exposes no puzzle history,
so we snapshot the stats endpoint (which includes the tactics rating) instead.
"""

import re

from .. import db
from ..http import get_json
from ..pgn import apply_owner_perspective, parse_pgn_text

API = "https://api.chess.com/pub/player"
SOURCE = "chesscom"


def _opening_from_url(url: str | None) -> str | None:
    """'.../openings/Sicilian-Defense-Najdorf-Variation-6.Be3' -> 'Sicilian Defense Najdorf Variation'."""
    if not url or "/openings/" not in url:
        return None
    slug = url.rsplit("/", 1)[-1]
    # The move sequence starts at the first number: "...-6.Be3" or "...Defense...3.f4-g6".
    name = re.split(r"(?:-|\.\.\.)\d", slug)[0]
    return name.replace("-", " ").strip() or None


def game_row(g: dict, username: str) -> dict | None:
    if not g.get("pgn"):
        return None
    row = parse_pgn_text(g["pgn"])
    rules = g.get("rules", "chess")
    row.update(
        source=SOURCE,
        source_id=g.get("uuid") or g["url"].rsplit("/", 1)[-1],
        url=g.get("url"),
        speed=g.get("time_class"),
        rated=g.get("rated"),
        variant="standard" if rules == "chess" else rules,
        opening=_opening_from_url(g.get("eco")),
        raw={k: v for k, v in g.items() if k != "pgn"},
    )
    apply_owner_perspective(row, [username])
    row["account"] = username
    if acc := g.get("accuracies"):
        if row.get("user_color"):
            opp = "black" if row["user_color"] == "white" else "white"
            row["user_accuracy"] = acc.get(row["user_color"])
            row["opponent_accuracy"] = acc.get(opp)
    return row


def sync(conn, username: str, since: str | None = None, log=print) -> int:
    """Import all games for `username`. `since` is 'YYYY-MM' to limit a first import."""
    username = username.lower()
    stats = get_json(f"{API}/{username}/stats")  # fails fast on an unknown username
    db.add_account(conn, SOURCE, username)
    db.add_snapshot(conn, SOURCE, username, "stats", stats)
    conn.commit()

    archives = get_json(f"{API}/{username}/games/archives")["archives"]
    start = max(filter(None, [db.get_cursor(conn, SOURCE, username, "games"),
                              since.replace("-", "/") if since else None]), default=None)
    added = 0
    for url in archives:
        month = "/".join(url.rstrip("/").split("/")[-2:])  # "YYYY/MM"
        if start and month < start:
            continue
        games = get_json(url).get("games", [])
        new = 0
        for g in games:
            row = game_row(g, username)
            if row and db.insert_game(conn, row):
                new += 1
        db.set_cursor(conn, SOURCE, username, "games", month)
        conn.commit()
        added += new
        log(f"  chess.com {month}: {len(games)} games, {new} new")
    return added
