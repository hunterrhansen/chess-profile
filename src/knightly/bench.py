"""How long engine analysis takes per game: a fixed depth against node budgets (`knightly bench`).

Each setting runs one single-threaded Stockfish over the same newest games, so its seconds
per game are CPU time, which is what the server's workers spend. Each setting's labels and
best moves for your moves are compared with the first setting's, so a cheaper budget is
judged on what it changes as well as on its speed. Nothing is saved.
"""
import os
import platform
import time

import chess.engine

from .analyze import analyze_game, find_engine


def _label(limit: chess.engine.Limit) -> str:
    if limit.nodes:
        return f"{limit.nodes / 1e6:g}M nodes"
    return f"depth {limit.depth}"


def run(conn, limits: list[chess.engine.Limit], games: int = 5, engine_path: str | None = None,
        log=print) -> list[dict]:
    """One result per limit: {"setting", "seconds_per_game", "seconds_per_position",
    "label_agreement", "best_agreement"}; agreements are vs the first limit, None for it."""
    engine_path = find_engine(engine_path)
    todo = conn.execute("""SELECT id, pgn, user_color, time_control FROM games
                           WHERE variant = 'standard' ORDER BY played_at DESC NULLS LAST LIMIT ?""", (games,)).fetchall()
    if not todo:
        raise SystemExit("No games to benchmark on; sync some first.")
    log(f"{len(todo)} games, one single-threaded Stockfish, on {platform.machine()} "
        f"with {os.cpu_count()} cores")

    results, baseline = [], None
    for limit in limits:
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            engine.configure({"Threads": 1, "Hash": 64})
            started, moves = time.monotonic(), []
            for g in todo:
                moves += analyze_game(engine, g["id"], g["pgn"], g["user_color"], g["time_control"], limit)
            seconds = time.monotonic() - started
        mine = [m for m in moves if m["is_user"] != 0]  # yours, or every move when the owner is unknown
        result = {"setting": _label(limit), "seconds_per_game": seconds / len(todo),
                  "seconds_per_position": seconds / (len(moves) + len(todo)),
                  "label_agreement": None, "best_agreement": None}
        if baseline is None:
            baseline = mine
        else:
            pairs = list(zip(baseline, mine))
            result["label_agreement"] = sum(a["classification"] == b["classification"] for a, b in pairs) / len(pairs)
            result["best_agreement"] = sum(a["best_uci"] == b["best_uci"] for a, b in pairs) / len(pairs)
        results.append(result)
        log(f"  {result['setting']}: {result['seconds_per_game']:.0f}s per game")
    return results
