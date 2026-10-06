"""Engine lines for game review's "Why" and "Best line" buttons, computed on demand.

For one move we want two short lines: the BEST line from the position before it (what the
mover should have played) and the WHY line from the position after it (how the opponent
punishes it). Stockfish gives the moves and a score but no reasons, so `explain()` writes a
sentence from what the line does: mate, material won or lost, or just the swing in win
chance.
"""
import chess
import chess.engine

from .analyze import MATE_CP, find_engine, win_pct

MIN_PLIES = 4   # show at least this much of a line...
MAX_PLIES = 8   # ...and at most this, stopping early at the first quiet move after MIN_PLIES
VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def material(board: chess.Board, color: chess.Color) -> int:
    """Material balance from `color`'s side, in pawns."""
    return sum(v * (len(board.pieces(p, color)) - len(board.pieces(p, not color)))
               for p, v in VALUES.items())


def trim(board: chess.Board, pv: list[chess.Move]) -> list[chess.Move]:
    """Cut the engine's principal variation to a readable length without stopping in the
    middle of an exchange: after MIN_PLIES, stop before the first quiet move (no capture,
    no check)."""
    b = board.copy()
    out = []
    for move in pv[:MAX_PLIES]:
        if len(out) >= MIN_PLIES and not b.is_capture(move) and not b.gives_check(move):
            break
        out.append(move)
        b.push(move)
    return out


def _amount(points: int) -> str:
    return {1: "a pawn", 2: "two pawns", 3: "a piece", 4: "a piece and a pawn", 5: "a rook",
            6: "a rook and a pawn", 9: "the queen"}.get(points, f"{points} points of material")


def _san_line(board: chess.Board, moves: list[chess.Move], limit: int = 3) -> str:
    b = board.copy()
    out = []
    for move in moves[:limit]:
        out.append(b.san(move))
        b.push(move)
    return " ".join(out)


def explain(kind: str, before: chess.Board, played: chess.Move, start: chess.Board,
            moves: list[chess.Move], score: chess.engine.PovScore, opponent: str) -> str:
    """One sentence for a line. `before` is the position before the reviewed move, `start`
    where the line begins (before it for "best", after it for "why"), `score` the engine's
    score at the end of the line."""
    mover = before.turn
    end = start.copy()
    for move in moves:
        end.push(move)
    gained = material(end, mover) - material(before, mover)
    mate = score.pov(mover).mate()
    played_san = before.san(played)

    if kind == "best":
        best_san = before.san(moves[0])
        if mate is not None and mate > 0:
            return f"{best_san} mates in {mate}: {_san_line(start, moves, 5)}."
        if gained > 0:
            follow = start.copy()
            follow.push(moves[0])
            tail = _san_line(follow, moves[1:])
            return f"{best_san} wins {_amount(gained)}" + (f", after {tail}…" if tail else ".")
        if gained < 0:
            return f"{best_san} gives up {_amount(-gained)} for a stronger position."
        return f"{best_san} keeps the balance where it was, unlike {played_san}."

    reply = start.san(moves[0])
    if mate is not None and mate < 0:
        return f"{played_san} allows mate in {-mate}, starting with {reply}."
    if gained < 0:
        return f"After {played_san}, {opponent} plays {reply} and wins {_amount(-gained)}."
    if gained > 0:
        return f"{played_san} wins {_amount(gained)}, but {reply} leaves you worse off than before."
    return f"No material changes hands, but after {reply} your position is worse."


def line_json(kind: str, before: chess.Board, played: chess.Move, start: chess.Board,
              pv: list[chess.Move], score: chess.engine.PovScore, opponent: str) -> dict:
    moves = trim(start, pv)
    b = start.copy()
    san = []
    for move in moves:
        san.append(b.san(move))
        b.push(move)
    mover = before.turn
    cp = score.pov(mover).score(mate_score=MATE_CP)
    return {
        "kind": kind,
        "start_fen": start.fen(),
        "moves": [m.uci() for m in moves],
        "san": san,
        # The reviewed move's mover's win chance at the end of the line.
        "win_pct": round(win_pct(cp), 1) if cp is not None else None,
        "mate": score.pov(mover).mate(),
        "summary": explain(kind, before, played, start, moves, score, opponent) if moves else None,
    }


def compute(fen_before: str, played_uci: str, opponent: str, analyse) -> dict:
    """Both lines for one move. `analyse(board) -> (PovScore, [Move])` runs the engine."""
    before = chess.Board(fen_before)
    played = chess.Move.from_uci(played_uci)
    after = before.copy()
    after.push(played)
    out = {}
    best_score, best_pv = analyse(before)
    if best_pv:
        out["best"] = line_json("best", before, played, before, best_pv, best_score, opponent)
    if not after.is_game_over():
        why_score, why_pv = analyse(after)
        if why_pv:
            out["why"] = line_json("why", before, played, after, why_pv, why_score, opponent)
    return out


class Engine:
    """A short-lived Stockfish for on-demand lines (one request, two positions)."""

    def __init__(self, depth: int, engine_path: str | None = None):
        self.depth = depth
        self.engine = chess.engine.SimpleEngine.popen_uci(find_engine(engine_path))

    def __call__(self, board: chess.Board):
        info = self.engine.analyse(board, chess.engine.Limit(depth=self.depth))
        return info["score"], info.get("pv", [])

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.engine.quit()
