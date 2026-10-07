"""Lichess via its public API: https://lichess.org/api

Games: public, streamed as NDJSON oldest-first so the cursor (last createdAt) can be
saved as we go. A token is optional but makes the download 3x faster for your own games.
Puzzles: /api/puzzle/activity needs a personal access token with the `puzzle:read`
scope (create one at https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read).
"""

from datetime import UTC, datetime
from urllib.parse import urlencode

from .. import db
from ..http import get_json, stream_ndjson
from ..pgn import apply_owner_perspective, parse_pgn_text

API = "https://lichess.org/api"
SOURCE = "lichess"
COMMIT_EVERY = 200


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _auth(token: str | None) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


def game_row(g: dict, username: str) -> dict:
    row = parse_pgn_text(g["pgn"])
    row.update(
        source=SOURCE,
        source_id=g["id"],
        url=f"https://lichess.org/{g['id']}",
        played_at=_iso(g["createdAt"]),
        speed=g.get("speed"),
        rated=g.get("rated"),
        variant=g.get("variant", "standard"),
        termination=g.get("status") or row.get("termination"),
        opening=(g.get("opening") or {}).get("name") or row.get("opening"),
        raw={k: v for k, v in g.items() if k != "pgn"},
    )
    apply_owner_perspective(row, [username])
    row["account"] = username
    if color := row.get("user_color"):
        opp = "black" if color == "white" else "white"
        players = g.get("players", {})
        row["user_accuracy"] = players.get(color, {}).get("analysis", {}).get("accuracy")
        row["opponent_accuracy"] = players.get(opp, {}).get("analysis", {}).get("accuracy")
    return row


def sync_games(conn, username: str, token: str | None = None, since: str | None = None,
               log=print) -> int:
    """Import games for `username`. `since` is 'YYYY-MM' (or 'YYYY-MM-DD') to limit a first import."""
    username = username.lower()
    profile = get_json(f"{API}/user/{username}", _auth(token))  # fails fast on an unknown username
    db.add_account(conn, SOURCE, username)
    db.add_snapshot(conn, SOURCE, username, "profile", profile)
    conn.commit()
    if profile.get("count", {}).get("all") == 0:
        log("  lichess: account has no games")
        return 0

    params = {"pgnInJson": "true", "clocks": "true", "evals": "true", "opening": "true",
              "accuracy": "true", "sort": "dateAsc"}
    since_ms = [int(c) + 1 for c in [db.get_cursor(conn, SOURCE, username, "games")] if c]
    if since:
        since_ms.append(int(datetime.fromisoformat(since if len(since) > 7 else f"{since}-01")
                            .replace(tzinfo=UTC).timestamp() * 1000))
    if since_ms:
        params["since"] = max(since_ms)

    added = seen = 0
    last_created = None
    for g in stream_ndjson(f"{API}/games/user/{username}?{urlencode(params)}", _auth(token)):
        seen += 1
        if db.insert_game(conn, game_row(g, username)):
            added += 1
        last_created = g["createdAt"]
        if seen % COMMIT_EVERY == 0:
            db.set_cursor(conn, SOURCE, username, "games", str(last_created))
            conn.commit()
            log(f"  lichess: {seen} games streamed ({added} new), up to {_iso(last_created)[:10]}")
    if last_created:
        db.set_cursor(conn, SOURCE, username, "games", str(last_created))
    conn.commit()
    log(f"  lichess: {seen} games streamed, {added} new")
    return added


def puzzle_row(entry: dict, username: str) -> dict:
    p = entry["puzzle"]
    return {
        "source": SOURCE,
        "puzzle_id": p["id"],
        "account": username,
        "attempted_at": _iso(entry["date"]),
        "success": entry.get("win"),
        "fen": p.get("fen"),
        "last_move": p.get("lastMove"),
        "solution": " ".join(p.get("solution", [])),
        "themes": p.get("themes", []),
        "puzzle_rating": p.get("rating"),
        "plays": p.get("plays"),
        "url": f"https://lichess.org/training/{p['id']}",
        "raw": entry,
    }


def sync_puzzles(conn, username: str, token: str, log=print) -> int:
    username = username.lower()
    params = {}
    if cursor := db.get_cursor(conn, SOURCE, username, "puzzles"):
        params["since"] = int(cursor) + 1
    # Activity is newest-first, so the cursor only advances once the stream completes;
    # an interrupted run just re-fetches and the unique key drops the duplicates.
    added = seen = newest = 0
    for entry in stream_ndjson(f"{API}/puzzle/activity?{urlencode(params)}", _auth(token)):
        seen += 1
        newest = max(newest, entry["date"])
        if db.insert_puzzle_attempt(conn, puzzle_row(entry, username)):
            added += 1
        if seen % COMMIT_EVERY == 0:
            conn.commit()
            log(f"  lichess puzzles: {seen} attempts streamed ({added} new)")
    if newest:
        db.set_cursor(conn, SOURCE, username, "puzzles", str(newest))
    conn.commit()
    log(f"  lichess puzzles: {seen} attempts streamed, {added} new")
    return added
