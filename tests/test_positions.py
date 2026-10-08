import chess

from knightly import db, positions


def add_game(conn, gid, moves_san, start_fen=None):
    conn.execute("INSERT INTO games (id, source, source_id, pgn, moves_san, start_fen) VALUES (?, 'otb', ?, '', ?, ?)",
                 (gid, str(gid), moves_san, start_fen))


def test_positions_are_rebuilt_from_the_games_moves(db_url):
    conn = db.connect(db_url)
    add_game(conn, 1, "e4 e5 Nf3")
    add_game(conn, 2, "Kd2", start_fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1")
    add_game(conn, 3, "e4 Qh5")  # an illegal second move: positions stop there
    fens = positions.fens(conn, [1, 2, 3, 1])
    assert fens[(1, 1)] == chess.STARTING_FEN
    assert fens[(1, 3)] == "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    assert (1, 4) not in fens
    assert fens[(2, 1)] == "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
    assert (3, 1) in fens and (3, 2) in fens and (3, 3) not in fens
    assert positions.fen_before(conn, 1, 2).split()[1] == "b"
    assert positions.fen_before(conn, 9, 1) is None and positions.fens(conn, []) == {}


def test_enum_columns_read_and_compare_as_text(db_url):
    conn = db.connect(db_url)
    add_game(conn, 1, "e4")
    conn.execute("""INSERT INTO moves (game_id, ply, move_number, color, is_user, phase, san, uci,
                    classification, eval_before) VALUES (1, 1, 1, ?, 1, ?, 'e4', 'e2e4', ?, ?)""",
                 ("white", "opening", "blunder", -9990))
    row = conn.execute("SELECT color, phase, classification, eval_before FROM moves WHERE classification IN (?, ?)",
                       ("blunder", "mistake")).fetchone()
    assert tuple(row) == ("white", "opening", "blunder", -9990)
