"""Manual PGN import: over-the-board games, ChessBase exports, anything else in PGN.

Games have no platform id, so a hash of (players, date, moves) is the dedup key;
re-importing the same file, or a file that overlaps a previous one, is safe.
"""

import hashlib
from pathlib import Path

from .. import db
from ..pgn import apply_owner_perspective, iter_pgn_file


def _content_id(row: dict) -> str:
    key = "|".join(str(row.get(k) or "").lower() for k in ("white", "black", "played_at", "moves_san"))
    return hashlib.sha1(key.encode()).hexdigest()[:20]


def import_paths(conn, paths: list[Path], me: list[str], source: str = "otb",
                 speed: str | None = None, log=print) -> int:
    files = [f for p in paths for f in (sorted(p.rglob("*.pgn")) if p.is_dir() else [p])]
    for name in me:
        db.add_account(conn, source, name)
    added = 0
    for f in files:
        seen = new = unmatched = 0
        for row in iter_pgn_file(f.read_text(encoding="utf-8", errors="replace")):
            seen += 1
            if row["parse_errors"]:
                log(f"  warning: {f.name} game {seen}: {row['parse_errors'][0]}")
            row.update(source=source, source_id=_content_id(row), speed=speed)
            apply_owner_perspective(row, me)
            if me and not row.get("user_color"):
                unmatched += 1
            if db.insert_game(conn, row):
                new += 1
        conn.commit()
        added += new
        msg = f"  {f.name}: {seen} games, {new} new"
        if unmatched:
            msg += f" ({unmatched} where neither player matched --me)"
        log(msg)
    return added
