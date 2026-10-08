"""What your mistakes come down to: the tactic behind each one.

A blunder or mistake is tagged by what the opponent's punishing line does to you: a fork, a
pin, a skewer, a discovered attack, taking a loose piece, or mate. A miss is tagged by what
your own best line would have done to them. Anything else, usually a slower positional slip,
is "other".

Two passes. `tag_all` is instant (board geometry on the moves already stored: the engine's
best reply is the next ply's best move) and catches one-move tactics; what it can't name is
left "pending". `deepen` then asks Stockfish for the line and looks for the tactic in its
first few moves, which catches combinations (a trade, then the fork); it runs in the daily
update and in `knightly patterns`.

The tags are Lichess puzzle theme names, so the path can later serve puzzles of the same
theme.
"""
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import chess
import chess.engine

from . import db, positions
from .analyze import find_engine

THEMES = ["hangingPiece", "fork", "pin", "skewer", "discoveredAttack", "backRankMate", "mate"]
OTHER = "other"
PENDING = "pending"  # no one-move tactic; waiting for `deepen` to look further
DEEP_DEPTH = 12      # engine depth for `deepen`'s lines
DEEP_PLIES = 6       # how far into the line to look for the tactic
KINDS = ("mistake", "miss", "blunder")
VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9,
          chess.KING: 100}
TARGET = 3  # a fork or discovered attack has to hit something worth at least a minor piece


def _value(piece: chess.Piece | None) -> int:
    return VALUES[piece.piece_type] if piece else 0


def _targets(board: chess.Board, square: chess.Square, side: chess.Color) -> list[chess.Square]:
    """Pieces of `side` that the piece on `square` attacks and could win: the king, anything
    worth more than the attacker, or anything worth a minor piece or more left undefended."""
    attacker = _value(board.piece_at(square))
    out = []
    for sq in board.attacks(square):
        piece = board.piece_at(sq)
        if not piece or piece.color != side:
            continue
        v = _value(piece)
        if piece.piece_type == chess.KING or v > attacker or (v >= TARGET and not board.is_attacked_by(side, sq)):
            out.append(sq)
    return out


def _pinned(board: chess.Board, side: chess.Color) -> int:
    return sum(1 for sq in chess.SquareSet(board.occupied_co[side])
               if board.piece_type_at(sq) != chess.KING and board.is_pinned(side, sq)
               and _value(board.piece_at(sq)) >= TARGET)


def _back_rank(board: chess.Board) -> bool:
    """Checkmate with the king on its own back rank, mated along that rank."""
    side = board.turn
    king = board.king(side)
    home = 0 if side == chess.WHITE else 7
    if king is None or chess.square_rank(king) != home:
        return False
    return any(chess.square_rank(sq) == home and board.piece_type_at(sq) in (chess.ROOK, chess.QUEEN)
               for sq in board.checkers())


def _skewer(board: chess.Board, square: chess.Square, side: chess.Color) -> bool:
    """A slider on `square` checks the king, and behind the king on the same line stands a
    piece of `side` that will be taken once the king steps aside."""
    if board.piece_type_at(square) not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        return False
    king = board.king(side)
    if king is None or square not in board.checkers():
        return False
    df = chess.square_file(king) - chess.square_file(square)
    dr = chess.square_rank(king) - chess.square_rank(square)
    step_f, step_r = (df > 0) - (df < 0), (dr > 0) - (dr < 0)
    f, r = chess.square_file(king) + step_f, chess.square_rank(king) + step_r
    while 0 <= f < 8 and 0 <= r < 8:
        piece = board.piece_at(chess.square(f, r))
        if piece:
            return piece.color == side and _value(piece) >= TARGET
        f, r = f + step_f, r + step_r
    return False


def motif(board: chess.Board, move: chess.Move) -> str | None:
    """The tactic `move` (by the side to move in `board`) carries out against the other side,
    or None. In order: mate, fork, pin, skewer, discovered attack, taking a loose piece."""
    me, them = board.turn, not board.turn
    attacker = board.piece_at(move.from_square)
    captured = board.piece_at(move.to_square)
    if board.is_en_passant(move):
        captured = chess.Piece(chess.PAWN, them)
    loose = captured is not None and (not board.is_attacked_by(them, move.to_square)
                                      or _value(captured) > _value(attacker))
    pins_before = _pinned(board, them)
    # Valuable pieces of theirs that pieces other than the mover already attacked.
    hit_before = {sq for sq in chess.SquareSet(board.occupied_co[them])
                  if _value(board.piece_at(sq)) >= 5
                  and any(a != move.from_square for a in board.attackers(me, sq))}

    after = board.copy()
    after.push(move)
    if after.is_checkmate():
        return "backRankMate" if _back_rank(after) else "mate"
    if len(_targets(after, move.to_square, them)) >= 2:
        return "fork"
    if _pinned(after, them) > pins_before:
        return "pin"
    if _skewer(after, move.to_square, them):
        return "skewer"
    hit_after = {sq for sq in chess.SquareSet(after.occupied_co[them])
                 if _value(after.piece_at(sq)) >= 5
                 and any(a != move.to_square for a in after.attackers(me, sq))}
    if hit_after - hit_before:
        return "discoveredAttack"
    if loose:
        return "hangingPiece"
    return None


def tag(fen_before: str, played: str, best: str | None, reply: str | None, kind: str,
        mate_after: int | None, color: str) -> str:
    """The pattern for one of your mistakes. A miss is about the move you didn't play
    (`best`); a mistake or blunder about the reply it allowed (`reply`, the opponent's best
    move afterwards). `mate_after` is White's mate-in-N after your move, if any."""
    board = chess.Board(fen_before)
    if kind == "miss":
        if best:
            found = motif(board, chess.Move.from_uci(best))
            if found:
                return found
        return PENDING
    after = board.copy()
    after.push(chess.Move.from_uci(played))
    if reply:
        try:
            found = motif(after, chess.Move.from_uci(reply))
        except (ValueError, AssertionError):
            found = None
        if found:
            return found
    # They can force mate, but the first move of it isn't a recognisable tactic.
    sign = 1 if color == "white" else -1
    if mate_after is not None and sign * mate_after < 0:
        return "mate"
    return PENDING


def in_line(board: chess.Board, line: list[chess.Move]) -> str | None:
    """The first tactic the side to move in `board` carries out in `line` (its moves only,
    within DEEP_PLIES)."""
    b = board.copy()
    for i, move in enumerate(line[:DEEP_PLIES]):
        if move not in b.legal_moves:
            break
        if i % 2 == 0:
            found = motif(b, move)
            if found:
                return found
        b.push(move)
    return None


def deepen(conn: db.Connection, engine_path: str | None = None, workers: int | None = None,
           depth: int = DEEP_DEPTH, log=print) -> int:
    """Settle every "pending" tag with the engine's line: for a blunder or mistake, the line
    after your move (their tactic); for a miss, the line before it (yours). Returns how many
    were settled."""
    rows = conn.execute(
        """SELECT game_id, ply, uci, classification FROM moves
           WHERE is_user = 1 AND pattern = ?""", (PENDING,)).fetchall()
    if not rows:
        return 0
    fens = positions.fens(conn, [r["game_id"] for r in rows])
    engine_path = find_engine(engine_path)  # only needed when there's something to look at
    log(f"Looking deeper at {len(rows)} mistakes for their tactic...")
    local, engines, lock = threading.local(), [], threading.Lock()

    def engine():
        if not hasattr(local, "engine"):
            local.engine = chess.engine.SimpleEngine.popen_uci(engine_path)
            local.engine.configure({"Threads": 1, "Hash": 32})
            with lock:
                engines.append(local.engine)
        return local.engine

    def work(r):
        fen = fens.get((r["game_id"], r["ply"]))
        if fen is None:  # the game's moves don't replay
            return OTHER, r["game_id"], r["ply"]
        board = chess.Board(fen)
        if r["classification"] != "miss":
            board.push(chess.Move.from_uci(r["uci"]))
        if board.is_game_over():
            return OTHER, r["game_id"], r["ply"]
        info = engine().analyse(board, chess.engine.Limit(depth=depth))
        return in_line(board, info.get("pv") or []) or OTHER, r["game_id"], r["ply"]

    pool = ThreadPoolExecutor(max_workers=workers or max(1, (os.cpu_count() or 2) - 1))
    try:
        tags = list(pool.map(work, rows))
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        for e in engines:
            try:
                e.quit()
            except Exception:
                pass
    with conn:
        conn.executemany("UPDATE moves SET pattern = ? WHERE game_id = ? AND ply = ?", tags)
    return len(tags)


def tag_all(conn: db.Connection) -> int:
    """First pass over every one of your mistakes, misses and blunders that isn't tagged yet
    (new games, or re-analysed ones, whose rows come back untagged): one-move tactics are
    named, the rest left PENDING for `deepen`. Returns how many were tagged."""
    rows = conn.execute(
        f"""SELECT m.game_id, m.ply, m.uci, m.best_uci, m.classification,
                   m.mate_after, m.color, n.best_uci AS reply
            FROM moves m LEFT JOIN moves n ON n.game_id = m.game_id AND n.ply = m.ply + 1
            WHERE m.is_user = 1 AND m.pattern IS NULL
              AND m.classification IN ({", ".join("?" for _ in KINDS)})""",
        KINDS,
    ).fetchall()
    fens = positions.fens(conn, [r["game_id"] for r in rows])

    def safe(r):
        fen = fens.get((r["game_id"], r["ply"]))
        if fen is None:  # the game's moves don't replay
            return OTHER
        try:
            return tag(fen, r["uci"], r["best_uci"], r["reply"], r["classification"],
                       r["mate_after"], r["color"])
        except (ValueError, AssertionError):  # a position python-chess can't read
            return OTHER

    tags = [(safe(r), r["game_id"], r["ply"]) for r in rows]
    conn.executemany("UPDATE moves SET pattern = ? WHERE game_id = ? AND ply = ?", tags)
    return len(tags)
