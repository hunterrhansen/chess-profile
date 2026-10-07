"""Source-independent PGN parsing; every importer funnels through here."""

import io
import re
from collections.abc import Iterator

import chess
import chess.pgn

RESULT_OUTCOME = {"1-0": ("win", "loss"), "0-1": ("loss", "win"), "1/2-1/2": ("draw", "draw")}


def _int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _pgn_date(headers) -> str | None:
    """Best-effort ISO date/time from PGN headers; partial dates like 2024.??.?? keep what's known."""
    date = headers.get("UTCDate") or headers.get("Date") or ""
    parts = [p for p in date.split(".") if p and "?" not in p]
    if not parts:
        return None
    iso = "-".join(parts)
    time_ = headers.get("UTCTime")
    if len(parts) == 3 and time_ and re.fullmatch(r"\d\d:\d\d:\d\d", time_):
        iso += f"T{time_}Z"
    return iso


def parse_game(game: chess.pgn.Game, pgn_text: str | None = None) -> dict:
    h = game.headers
    sans = []
    board = game.board()
    for move in game.mainline_moves():
        sans.append(board.san(move))
        board.push(move)
    start_fen = h.get("FEN") if h.get("SetUp") == "1" or "FEN" in h else None
    if start_fen == chess.STARTING_FEN:
        start_fen = None
    if pgn_text is None:
        pgn_text = str(game)
    return {
        "played_at": _pgn_date(h),
        "white": h.get("White"),
        "black": h.get("Black"),
        "white_elo": _int(h.get("WhiteElo")),
        "black_elo": _int(h.get("BlackElo")),
        "result": h.get("Result"),
        "termination": h.get("Termination"),
        "time_control": h.get("TimeControl") if h.get("TimeControl") not in (None, "-", "?") else None,
        "variant": (h.get("Variant") or "standard").lower(),
        "eco": h.get("ECO") if h.get("ECO") not in (None, "?") else None,
        "opening": h.get("Opening"),
        "start_fen": start_fen,
        "ply_count": len(sans),
        "moves_san": " ".join(sans),
        "pgn": pgn_text.strip(),
        "parse_errors": [str(e) for e in game.errors],
    }


def parse_pgn_text(pgn_text: str) -> dict:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("No game found in PGN")
    return parse_game(game, pgn_text)


def iter_pgn_file(text: str) -> Iterator[dict]:
    """Yield parsed games from a (possibly multi-game) PGN string."""
    stream = io.StringIO(text)
    while True:
        offset = stream.tell()
        game = chess.pgn.read_game(stream)
        if game is None:
            return
        raw = text[offset:stream.tell()]
        yield parse_game(game, raw)


def apply_owner_perspective(game: dict, handles: list[str]) -> dict:
    """Fill user_* / opponent* columns given the owner's handle(s) for this source."""
    wanted = {h.strip().lower() for h in handles}
    white, black = (game.get("white") or "").lower(), (game.get("black") or "").lower()
    if white in wanted:
        color = "white"
    elif black in wanted:
        color = "black"
    else:
        return game
    me, opp = ("white", "black") if color == "white" else ("black", "white")
    outcomes = RESULT_OUTCOME.get(game.get("result") or "")
    game.update(
        account=game.get(me),
        user_color=color,
        user_outcome=(outcomes[0] if color == "white" else outcomes[1]) if outcomes else None,
        user_rating=game.get(f"{me}_elo"),
        opponent=game.get(opp),
        opponent_rating=game.get(f"{opp}_elo"),
    )
    return game
