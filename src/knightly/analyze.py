"""Stockfish pass: evaluate every position of every game into the `moves` table.

Each worker thread owns one single-threaded Stockfish process; that scales better across
cores than one big multi-threaded engine. Results are written one game per transaction, so
an interrupted run keeps what it finished and the next run picks up the rest.
"""

import io
import math
import os
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import chess
import chess.engine
import chess.pgn

from . import brilliance, db, positions

MATE_CP = 10000   # mate-in-N stored as +/-(MATE_CP - N)
CLAMP_CP = 1000   # evals clamped to this for cp_loss / win% so mates don't dominate averages
PIECE_VALUES = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}

# Drop in the mover's win% (0-100) for each label, Chess.com's "expected points lost"
# bands (0.02 / 0.05 / 0.10 / 0.20) on a 0-100 scale. Smaller drops are "excellent".
THRESHOLDS = [(20, "blunder"), (10, "mistake"), (5, "inaccuracy"), (2, "good")]
# A "miss": the opponent's previous move lost at least this much and the reply gave up at
# least this much too, instead of cashing in.
MISS_DROP = 10
# Great and Brilliant (brilliance.py) need the top move, or one losing less than this.
TOP_DROP = 1

MOVE_COLUMNS = [
    "game_id", "ply", "move_number", "color", "is_user", "phase", "san", "uci",
    "best_san", "best_uci", "eval_before", "eval_after", "mate_before", "mate_after", "cp_loss",
    "win_pct_before", "win_pct_after", "accuracy", "classification", "clock_left", "time_spent",
    "eval_second",
]
SUMMARY_COLUMNS = [
    "game_id", "engine", "depth", "nodes", "user_acpl", "opponent_acpl", "user_accuracy",
    "opponent_accuracy", "user_inaccuracies", "user_mistakes", "user_blunders", "opponent_blunders",
]


def _clamp(cp: int) -> int:
    return max(-CLAMP_CP, min(CLAMP_CP, cp))


def win_pct(cp: int) -> float:
    """Lichess's win% curve, from the point of view of whoever `cp` is relative to."""
    cp = _clamp(cp)
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def move_accuracy(win_before: float, win_after: float) -> float:
    """Lichess's per-move accuracy formula (100 = no win% lost)."""
    raw = 103.1668 * math.exp(-0.04354 * max(0.0, win_before - win_after)) - 3.1669
    return max(0.0, min(100.0, raw))


def classify(win_before: float, win_after: float, is_best: bool,
             opponent_drop: float | None = None, special: str | None = None) -> str:
    """Label one move. `opponent_drop` is how much win% the opponent's previous move lost;
    `special` is "brilliant" or "great" when brilliance.py found the move to be one."""
    if special:
        return special
    if is_best:
        return "best"
    drop = win_before - win_after
    if opponent_drop is not None and opponent_drop >= MISS_DROP and drop >= MISS_DROP:
        return "miss"
    for threshold, label in THRESHOLDS:
        if drop >= threshold:
            return label
    return "excellent"


def special(before: chess.Board, move: chess.Move, is_best: bool, win_before: float,
            win_after: float, cp_after: int, cp_second: int | None) -> str | None:
    """"brilliant", "great" or None for one move; evals in centipawns from the mover's side."""
    if not is_best and win_before - win_after >= TOP_DROP:
        return None
    if brilliance.is_brilliant(before, move, cp_after, cp_second):
        return "brilliant"
    win_second = win_pct(cp_second) if cp_second is not None else None
    if brilliance.is_great(before, move, is_best, win_before, win_second, cp_after, cp_second):
        return "great"
    return None


def phase(board: chess.Board, move_number: int) -> str:
    """Endgame once both sides are down to <= 13 points of pieces (e.g. rook + two minors),
    opening for the first 10 moves otherwise, middlegame in between."""
    def material(color):
        return sum(v * len(board.pieces(p, color)) for p, v in PIECE_VALUES.items())
    if material(chess.WHITE) <= 13 and material(chess.BLACK) <= 13:
        return "endgame"
    return "opening" if move_number <= 10 else "middlegame"


def parse_time_control(tc: str | None) -> tuple[float | None, float]:
    """'600+5' -> (600, 5). Daily ('1/259200') and unknown controls -> (None, 0)."""
    m = re.fullmatch(r"(\d+)(?:\+(\d+))?", tc or "")
    if not m:
        return None, 0.0
    return float(m.group(1)), float(m.group(2) or 0)


def _evaluate(engine, board: chess.Board, depth: int | chess.engine.Limit) -> dict:
    """For one position, White POV: cp and mate-in-N for the best move, cp for the second
    best (None with only one legal move), and the best move. `depth` may be a full Limit,
    e.g. a node budget."""
    if board.is_checkmate():  # side to move has been mated
        return {"cp": -MATE_CP if board.turn == chess.WHITE else MATE_CP, "mate": None,
                "second": None, "best": None}
    if board.is_game_over():  # stalemate, insufficient material, ...
        return {"cp": 0, "mate": None, "second": None, "best": None}
    limit = depth if isinstance(depth, chess.engine.Limit) else chess.engine.Limit(depth=depth)
    infos = engine.analyse(board, limit, multipv=2)
    score = infos[0]["score"].white()
    pv = infos[0].get("pv") or []
    second = infos[1]["score"].white().score(mate_score=MATE_CP) if len(infos) > 1 else None
    return {"cp": score.score(mate_score=MATE_CP), "mate": score.mate(), "second": second,
            "best": pv[0] if pv else None}


def analyze_game(engine, game_id: int, pgn: str, user_color: str | None,
                 time_control: str | None, depth: int | chess.engine.Limit, evaluate_all=None) -> list[dict]:
    """Evaluate every position in the game and return one dict per half-move.
    `evaluate_all(boards) -> evals` replaces the one-engine loop, e.g. to spread the
    positions over several engines."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        return []
    base, increment = parse_time_control(time_control)
    board = game.board()
    nodes = list(game.mainline())

    boards = [board.copy()]
    for node in nodes:
        board.push(node.move)
        boards.append(board.copy())
    evals = (evaluate_all or (lambda bs: [_evaluate(engine, b, depth) for b in bs]))(boards)

    last_clock = {chess.WHITE: base, chess.BLACK: base}
    rows = []
    prev_drop = None
    for i, node in enumerate(nodes):
        before = boards[i]
        mover = before.turn
        sign = 1 if mover == chess.WHITE else -1
        cp_before, mate_before, best = evals[i]["cp"], evals[i]["mate"], evals[i]["best"]
        cp_after, mate_after = evals[i + 1]["cp"], evals[i + 1]["mate"]
        cp_second = evals[i]["second"]

        wb, wa = win_pct(sign * cp_before), win_pct(sign * cp_after)
        is_best = best is not None and node.move == best

        clock = node.clock()
        spent = None
        if clock is not None and last_clock[mover] is not None:
            spent = max(0.0, last_clock[mover] - clock + increment)
        if clock is not None:
            last_clock[mover] = clock

        color = "white" if mover == chess.WHITE else "black"
        rows.append({
            "game_id": game_id,
            "ply": i + 1,
            "move_number": before.fullmove_number,
            "color": color,
            "is_user": None if user_color is None else int(color == user_color),
            "phase": phase(before, before.fullmove_number),
            "san": before.san(node.move),
            "uci": node.move.uci(),
            "best_san": before.san(best) if best else None,
            "best_uci": best.uci() if best else None,
            "eval_before": cp_before,
            "eval_after": cp_after,
            "mate_before": mate_before,
            "mate_after": mate_after,
            "cp_loss": max(0, sign * (_clamp(cp_before) - _clamp(cp_after))),
            "win_pct_before": round(wb, 2),
            "win_pct_after": round(wa, 2),
            "accuracy": round(move_accuracy(wb, wa), 2),
            "classification": classify(wb, wa, is_best, prev_drop, special(
                before, node.move, is_best, wb, wa, sign * cp_after,
                sign * cp_second if cp_second is not None else None)),
            "clock_left": clock,
            "time_spent": round(spent, 2) if spent is not None else None,
            "eval_second": cp_second,
        })
        prev_drop = wb - wa
    return rows


def budget(depth: int | None = None, nodes: int | None = None) -> chess.engine.Limit:
    """How hard to look at each position: a fixed depth when given, else a node budget."""
    return chess.engine.Limit(depth=depth) if depth else chess.engine.Limit(nodes=nodes or db.DEFAULT_NODES)


def describe(limit: chess.engine.Limit) -> str:
    return f"{limit.nodes / 1000:g}k nodes a move" if limit.nodes else f"depth {limit.depth}"


def summarize(game_id: int, rows: list[dict], engine_name: str, depth: int | chess.engine.Limit) -> dict:
    def side(user: int):
        mine = [r for r in rows if r["is_user"] == user]
        return mine, (lambda f: round(sum(f(r) for r in mine) / len(mine), 1) if mine else None)

    limit = depth if isinstance(depth, chess.engine.Limit) else chess.engine.Limit(depth=depth)
    summary = {"game_id": game_id, "engine": engine_name, "depth": limit.depth, "nodes": limit.nodes}
    if not rows or rows[0]["is_user"] is None:
        return summary  # owner unknown: per-move rows are still useful, per-side stats aren't
    me, my_avg = side(1)
    opp, opp_avg = side(0)
    count = lambda rs, label: sum(r["classification"] == label for r in rs)
    summary.update(
        user_acpl=my_avg(lambda r: r["cp_loss"]),
        opponent_acpl=opp_avg(lambda r: r["cp_loss"]),
        user_accuracy=my_avg(lambda r: r["accuracy"]),
        opponent_accuracy=opp_avg(lambda r: r["accuracy"]),
        user_inaccuracies=count(me, "inaccuracy"),
        user_mistakes=count(me, "mistake"),
        user_blunders=count(me, "blunder"),
        opponent_blunders=count(opp, "blunder"),
    )
    return summary


def reclassify(conn, log=print) -> int:
    """Re-label every analysed move from its stored win%s (no engine needed), e.g. after
    THRESHOLDS change, and refresh the per-game counts. Returns games updated."""
    game_ids = [r[0] for r in conn.execute("SELECT game_id FROM game_analysis")]
    with conn:
        for game_id in game_ids:
            rows = [dict(r) for r in conn.execute(
                """SELECT ply, is_user, color, uci, best_uci, win_pct_before,
                          win_pct_after, cp_loss, accuracy, eval_after, eval_second
                   FROM moves WHERE game_id = ? ORDER BY ply""", (game_id,))]
            fens = positions.fens(conn, [game_id])
            if any((game_id, r["ply"]) not in fens for r in rows):
                continue  # the game's moves don't replay: keep its labels
            prev_drop = None
            for r in rows:
                wb, wa = r["win_pct_before"], r["win_pct_after"]
                sign = 1 if r["color"] == "white" else -1
                move = chess.Move.from_uci(r["uci"])
                second = r["eval_second"]
                r["classification"] = classify(wb, wa, r["uci"] == r["best_uci"], prev_drop, special(
                    chess.Board(fens[(game_id, r["ply"])]), move, r["uci"] == r["best_uci"], wb, wa,
                    sign * r["eval_after"], sign * second if second is not None else None))
                prev_drop = wb - wa
            conn.executemany("UPDATE moves SET classification = ? WHERE game_id = ? AND ply = ?",
                             [(r["classification"], game_id, r["ply"]) for r in rows])
            counts = summarize(game_id, rows, "", 0)
            if "user_blunders" in counts:
                conn.execute(
                    """UPDATE game_analysis SET user_inaccuracies = ?, user_mistakes = ?,
                       user_blunders = ?, opponent_blunders = ? WHERE game_id = ?""",
                    (counts["user_inaccuracies"], counts["user_mistakes"], counts["user_blunders"],
                     counts["opponent_blunders"], game_id))
    log(f"Reclassified moves in {len(game_ids)} games.")
    return len(game_ids)


def save(conn, game_id: int, rows: list[dict], summary: dict) -> None:
    with conn:  # one transaction per game
        conn.execute("DELETE FROM moves WHERE game_id = ?", (game_id,))
        conn.executemany(
            f"INSERT INTO moves ({', '.join(MOVE_COLUMNS)}) VALUES ({', '.join('?' * len(MOVE_COLUMNS))})",
            [[r[c] for c in MOVE_COLUMNS] for r in rows])
        conn.execute(
            f"INSERT INTO game_analysis ({', '.join(SUMMARY_COLUMNS)}) "
            f"VALUES ({', '.join('?' * len(SUMMARY_COLUMNS))}) ON CONFLICT (game_id) DO UPDATE SET "
            + ", ".join(f"{c} = excluded.{c}" for c in SUMMARY_COLUMNS[1:]) + ", analyzed_at = iso_now()",
            [summary.get(c) for c in SUMMARY_COLUMNS])


def find_engine(path: str | None) -> str:
    found = path or os.environ.get("STOCKFISH") or shutil.which("stockfish")
    if not found:
        raise SystemExit("Stockfish not found. Install it (`brew install stockfish`) or pass --engine PATH.")
    return found


def unanalysed(conn) -> int:
    """How many games `run` would still analyse."""
    return conn.execute("""SELECT count(*) FROM games WHERE variant = 'standard'
                           AND id NOT IN (SELECT game_id FROM game_analysis)""").fetchone()[0]


def run(conn, depth: int | None = None, workers: int | None = None, engine_path: str | None = None,
        force: bool = False, limit: int | None = None, log=print, on_progress=None,
        nodes: int | None = None) -> int:
    """Analyse games that haven't been analysed yet (or all with force), newest first, at
    most `limit` of them. Each position gets `nodes` (default DEFAULT_NODES), or a fixed
    `depth` when that's given. Returns games analysed. `on_progress(done, total)` is called
    before the first game and after each one."""
    search = budget(depth, nodes)
    engine_path = find_engine(engine_path)
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    sql = """SELECT id, pgn, user_color, time_control FROM games
             WHERE variant = 'standard' {} ORDER BY played_at DESC NULLS LAST""".format(
        "" if force else "AND id NOT IN (SELECT game_id FROM game_analysis)")
    if limit:
        sql += f" LIMIT {int(limit)}"
    todo = [tuple(r) for r in conn.execute(sql)]
    if on_progress:
        on_progress(0, len(todo))
    if not todo:
        log("Nothing to analyse: every game already has engine analysis (use --force to redo).")
        return 0

    local, engines, lock = threading.local(), [], threading.Lock()

    def get_engine():
        if not hasattr(local, "engine"):
            local.engine = chess.engine.SimpleEngine.popen_uci(engine_path)
            local.engine.configure({"Threads": 1, "Hash": 64})
            with lock:
                engines.append(local.engine)
        return local.engine

    def work(game_id, pgn, user_color, time_control):
        engine = get_engine()
        rows = analyze_game(engine, game_id, pgn, user_color, time_control, search)
        return game_id, rows, summarize(game_id, rows, engine.id.get("name", "unknown"), search)

    log(f"Analysing {len(todo)} games at {describe(search)} with {workers} Stockfish workers...")
    done, failed, started = 0, 0, time.monotonic()
    pool = ThreadPoolExecutor(max_workers=workers)
    try:
        futures = {pool.submit(work, *g): g[0] for g in todo}
        for fut in as_completed(futures):
            try:
                game_id, rows, summary = fut.result()
            except Exception as e:  # one bad game shouldn't stop the run
                failed += 1
                log(f"  game {futures[fut]} failed: {e}")
                continue
            save(conn, game_id, rows, summary)
            done += 1
            if on_progress:
                on_progress(done, len(todo))
            if done % 10 == 0 or done == len(todo):
                elapsed = time.monotonic() - started
                eta = elapsed / done * (len(todo) - done)
                log(f"  {done}/{len(todo)} games  ({elapsed / 60:.1f} min elapsed, ~{eta / 60:.0f} min left)")
    except KeyboardInterrupt:
        log(f"Interrupted; {done} games saved. Run `knightly analyze` again to continue.")
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        for engine in engines:
            try:
                engine.quit()
            except Exception:
                pass
    if failed:
        log(f"{failed} games failed; they'll be retried on the next run.")
    return done
