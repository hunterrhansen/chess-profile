"""The board position before each move of a game, rebuilt from the game's own moves.

`moves` doesn't store positions (a FEN was a quarter of every row). Replaying a game's moves
with python-chess takes a few milliseconds, so the few places that need a position (engine
lines, practice cards, pattern tagging, re-labelling) rebuild it here.
"""
import chess


def fens(conn, game_ids) -> dict[tuple[int, int], str]:
    """{(game_id, ply): FEN of the position that ply's move was played from}, for every
    move of the given games. A game whose moves don't replay has none."""
    out = {}
    ids = sorted(set(game_ids))
    if not ids:
        return out
    for g in conn.execute("SELECT id, start_fen, moves_san FROM games WHERE id = ANY(?)", (ids,)):
        board = chess.Board(g["start_fen"] or chess.STARTING_FEN)
        try:
            for ply, san in enumerate((g["moves_san"] or "").split(), start=1):
                out[(g["id"], ply)] = board.fen()
                board.push_san(san)
        except ValueError:
            continue  # keeps the positions up to the move that didn't parse
    return out


def fen_before(conn, game_id: int, ply: int) -> str | None:
    return fens(conn, [game_id]).get((game_id, ply))
