import chess

from knightly import patterns


def motif(fen, uci):
    return patterns.motif(chess.Board(fen), chess.Move.from_uci(uci))


def test_fork():
    # Nc7+ hits the king and the rook on a8.
    assert motif("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", "b5c7") == "fork"


def test_loose_piece():
    # The rook on d4 has no defender.
    assert motif("4k3/8/8/8/3r4/8/8/3RK3 w - - 0 1", "d1d4") == "hangingPiece"


def test_back_rank_mate():
    assert motif("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "a1a8") == "backRankMate"


def test_pin():
    # Bb5 pins the knight on c6 to the king.
    assert motif("4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1", "f1b5") == "pin"


def test_skewer():
    # Rh8+ and the queen behind the king on the eighth rank falls.
    assert motif("q3k3/8/8/8/8/8/8/4K2R w - - 0 1", "h1h8") == "skewer"


def test_quiet_move_has_no_motif():
    assert motif(chess.STARTING_FEN, "e2e4") is None


def test_tag_blunder_by_the_reply_and_miss_by_the_best_move():
    fen = "4k3/8/8/8/8/8/3r4/3RK3 w - - 0 1"
    # Kf1 leaves the rook on d1 loose, and Black's best reply takes it.
    assert patterns.tag(fen, "e1f1", None, "d2d1", "blunder", None, "white") == "hangingPiece"
    # The miss: White could have taken Black's loose rook on d2 instead.
    assert patterns.tag(fen, "e1f1", "d1d2", None, "miss", None, "white") == "hangingPiece"
    # Nothing to go on yet: left for the engine pass.
    assert patterns.tag(fen, "e1f1", None, None, "mistake", None, "white") == patterns.PENDING
    assert patterns.tag(fen, "e1f1", None, None, "blunder", -3, "white") == "mate"


def test_in_line_finds_the_tactic_later_in_the_line():
    # A quiet knight move first; after ...Ke7, Nc6+ forks the king and the rook on d8.
    board = chess.Board("3rk3/8/8/8/2N5/8/8/4K3 w - - 0 1")
    line = [chess.Move.from_uci(u) for u in ("c4a5", "e8e7", "a5c6")]
    assert patterns.motif(board, line[0]) is None
    assert patterns.in_line(board, line) == "fork"
    # Black's moves in the line don't count as White's tactics.
    assert patterns.in_line(board, line[:2]) is None
