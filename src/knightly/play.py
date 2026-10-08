"""Play against Stockfish in the web app, at a chosen rating, and save the game for review.

Stockfish only weakens itself down to about 1320 Elo (`UCI_Elo`). Below that the bot picks
among the engine's top moves at random, weighted by how good each one is, with more
randomness the lower the rating, so a 250 bot hangs pieces and misses mates like a beginner.
"""
import io
import math
import os
import random
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import chess
import chess.engine
import chess.pgn

from . import analyze
from .pgn import apply_owner_perspective, parse_game

MIN_UCI_ELO = 1320   # Stockfish's lowest UCI_Elo
MAX_ELO = 3200       # at or above this: full strength
MOVE_TIME = 0.3      # seconds per bot move when limited by UCI_Elo
WEAK_DEPTH = 8       # search depth for the sub-1320 bots' candidate moves
WEAK_CANDIDATES = 8  # how many top moves a sub-1320 bot chooses from
HINT_DEPTH = 16
SOURCE = "bot"       # games.source for games played here


def temperature(elo: int) -> float:
    """Softmax temperature in win% points for the sub-1320 bots: about 30 at 250 (barely
    prefers good moves), falling to about 3 just under 1320 (rarely strays far)."""
    t = (MIN_UCI_ELO - max(elo, 100)) / (MIN_UCI_ELO - 250)
    return 3 + 27 * max(0.0, t) ** 1.5


def pick_weak(infos: list[dict], turn: chess.Color, elo: int, rng: random.Random) -> chess.Move:
    """One of the engine's top moves, chosen with probability rising with its win%."""
    scored = []
    for info in infos:
        pv = info.get("pv")
        if pv:
            cp = info["score"].pov(turn).score(mate_score=analyze.MATE_CP)
            scored.append((pv[0], analyze.win_pct(cp)))
    t = temperature(elo)
    top = max(w for _, w in scored)
    weights = [math.exp((w - top) / t) for _, w in scored]
    return rng.choices([m for m, _ in scored], weights=weights)[0]


def bot_move(engine: chess.engine.SimpleEngine, board: chess.Board, elo: int | None,
             rng: random.Random | None = None) -> chess.Move:
    """The bot's move at `elo`, or the engine's best move (a hint) when `elo` is None."""
    if elo is None:
        return engine.play(board, chess.engine.Limit(depth=HINT_DEPTH)).move
    if elo >= MAX_ELO:
        return engine.play(board, chess.engine.Limit(time=MOVE_TIME * 2)).move
    if elo >= MIN_UCI_ELO:
        engine.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})
        return engine.play(board, chess.engine.Limit(time=MOVE_TIME)).move
    n = min(WEAK_CANDIDATES, board.legal_moves.count())
    infos = engine.analyse(board, chess.engine.Limit(depth=WEAK_DEPTH), multipv=n)
    return pick_weak(infos, board.turn, elo, rng or random.Random())


CHECK_DEPTH = 14  # Blunder check: how deep the engine looks before and after your move
PIECE_NAMES = {chess.PAWN: "pawn", chess.KNIGHT: "knight", chess.BISHOP: "bishop",
               chess.ROOK: "rook", chess.QUEEN: "queen"}


def blunder_check(engine: chess.engine.SimpleEngine, board: chess.Board, move: chess.Move,
                  drop: float) -> dict:
    """Whether `move` throws away `drop`+ points of win chance for the side playing it, and
    the reply that punishes it: what Play's Blunder check warns about before the bot moves."""
    me = board.turn
    before = engine.analyse(board, chess.engine.Limit(depth=CHECK_DEPTH))
    win_before = analyze.win_pct(before["score"].pov(me).score(mate_score=analyze.MATE_CP))
    after_board = board.copy()
    after_board.push(move)
    if after_board.is_game_over():
        return {"blunder": False, "before": round(win_before), "after": None}
    after = engine.analyse(after_board, chess.engine.Limit(depth=CHECK_DEPTH))
    score = after["score"].pov(me)
    win_after = analyze.win_pct(score.score(mate_score=analyze.MATE_CP))
    reply = (after.get("pv") or [None])[0]
    captured = after_board.piece_at(reply.to_square) if reply else None
    if reply and after_board.is_en_passant(reply):
        captured = chess.Piece(chess.PAWN, me)
    return {
        "blunder": win_before - win_after >= drop and reply is not None,
        "before": round(win_before),
        "after": round(win_after),
        "reply_uci": reply.uci() if reply else None,
        "reply_san": after_board.san(reply) if reply else None,
        "wins": PIECE_NAMES.get(captured.piece_type) if captured else None,
        "mates": score.is_mate() and score.mate() < 0,
    }


def termination(board: chess.Board, resigned: str | None, winner: str | None) -> tuple[str, str]:
    """(PGN result, Termination text) for a finished game. The text uses the same wording
    as Chess.com's, so `api.ended_by` labels it the same way."""
    if resigned:
        return ("0-1" if resigned == "white" else "1-0"), f"{winner} won by resignation"
    outcome = board.outcome(claim_draw=True)
    if outcome is None:
        raise ValueError("the game isn't over")
    if outcome.winner is not None:
        return outcome.result(), f"{winner} won by checkmate"
    how = {
        chess.Termination.STALEMATE: "stalemate",
        chess.Termination.INSUFFICIENT_MATERIAL: "insufficient material",
        chess.Termination.THREEFOLD_REPETITION: "repetition",
        chess.Termination.FIVEFOLD_REPETITION: "repetition",
        chess.Termination.FIFTY_MOVES: "50-move rule",
        chess.Termination.SEVENTYFIVE_MOVES: "50-move rule",
    }.get(outcome.termination, "agreement")
    return "1/2-1/2", f"Game drawn by {how}"


def game_row(moves: list[str], user_color: str, user_name: str, bot_name: str, elo: int,
             resigned: str | None = None, started_at: datetime | None = None) -> dict:
    """A `games` row for a finished game, as the importers build it. `moves` are UCI;
    `resigned` is the color that resigned, if the game ended that way."""
    board = chess.Board()
    for uci in moves:
        board.push_uci(uci)  # raises ValueError on an illegal move
    started = started_at or datetime.now(timezone.utc)
    white, black = (user_name, bot_name) if user_color == "white" else (bot_name, user_name)
    loser = resigned or ("white" if board.turn == chess.WHITE else "black")
    winner = black if loser == "white" else white
    result, term = termination(board, resigned, winner)

    game = chess.pgn.Game.from_board(board)
    game.headers.update({
        "Event": f"vs {bot_name}", "Site": "knightly",
        "Date": started.strftime("%Y.%m.%d"), "UTCDate": started.strftime("%Y.%m.%d"),
        "UTCTime": started.strftime("%H:%M:%S"),
        "White": white, "Black": black, "Result": result, "Termination": term,
        ("BlackElo" if user_color == "white" else "WhiteElo"): str(elo),
    })
    row = parse_game(chess.pgn.read_game(io.StringIO(str(game))))
    row.update(source=SOURCE, source_id=uuid.uuid4().hex, rated=0, speed=None)
    return apply_owner_perspective(row, [user_name])


def analyse_saved(conn, game_id: int, nodes: int, engine_path: str | None = None) -> None:
    """Engine analysis of one just-played game, so it can be reviewed straight away: its
    positions are spread over one single-threaded engine per core, as `analyze` spreads games."""
    g = conn.execute("SELECT pgn, user_color, time_control FROM games WHERE id = ?", (game_id,)).fetchone()
    path = analyze.find_engine(engine_path)
    search = analyze.budget(nodes=nodes)
    local, engines, lock = threading.local(), [], threading.Lock()

    def evaluate(board):
        if not hasattr(local, "engine"):
            local.engine = chess.engine.SimpleEngine.popen_uci(path)
            local.engine.configure({"Threads": 1, "Hash": 64})
            with lock:
                engines.append(local.engine)
        return analyze._evaluate(local.engine, board, search)

    workers = max(1, (os.cpu_count() or 2) - 1)
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            rows = analyze.analyze_game(None, game_id, g[0], g[1], g[2], search,
                                        evaluate_all=lambda boards: list(pool.map(evaluate, boards)))
        name = engines[0].id.get("name", "unknown") if engines else "unknown"
    finally:
        for engine in engines:
            engine.quit()
    analyze.save(conn, game_id, rows, analyze.summarize(game_id, rows, name, search))
