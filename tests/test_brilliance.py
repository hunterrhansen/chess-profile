import chess

from knightly import brilliance


def brilliant(fen, san, cp_after=150, cp_second=50):
    board = chess.Board(fen)
    return brilliance.is_brilliant(board, board.parse_san(san), cp_after, cp_second)


def great(fen, san, win_before=50, win_second=30, cp_after=0, cp_second=-150):
    board = chess.Board(fen)
    return brilliance.is_great(board, board.parse_san(san), True, win_before, win_second, cp_after, cp_second)


# 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6: Legal's trap, 5.Nxe5! leaves the queen hanging.
LEGAL = "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5"
# The Greek gift: Bxh7+ gives a bishop for a pawn.
GREEK_GIFT = "r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8"


def test_sacrifices_are_brilliant():
    assert brilliant(LEGAL, "Nxe5")
    assert brilliant(GREEK_GIFT, "Bxh7+")


def test_not_brilliant():
    # A trade: bishop takes knight, nothing worth more is left hanging.
    assert not brilliant("rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 3 3", "Bxc3")
    # A quiet developing move hangs nothing.
    assert not brilliant(chess.STARTING_FEN, "Nf3")
    # Already completely winning without it, or worse after it.
    assert not brilliant(LEGAL, "Nxe5", cp_second=800)
    assert not brilliant(LEGAL, "Nxe5", cp_after=-50)


def test_piece_safety():
    board = chess.Board("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1")
    assert not brilliance.is_safe(board, chess.D5)  # undefended, attacked
    board = chess.Board("4k3/8/2p5/3n4/8/8/8/3RK3 w - - 0 1")
    assert brilliance.is_safe(board, chess.D5)      # rook attacks a pawn-defended knight
    board = chess.Board("4k3/8/2p5/3r4/8/8/8/3NK3 b - - 0 1")
    board.push_san("Rd4")                            # attacked by nothing cheaper: fine
    assert brilliance.is_safe(board, chess.D4)
    board = chess.Board("4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1")
    assert not brilliance.is_safe(board, chess.D5)   # a pawn attacks a rook


def test_great():
    assert great(chess.STARTING_FEN, "e4")
    assert not great(chess.STARTING_FEN, "e4", win_second=45)                  # alternatives were fine
    assert not great(chess.STARTING_FEN, "e4", cp_second=800)                  # winning anyway
    assert not great(chess.STARTING_FEN, "e4", cp_after=-30)                   # still worse after
    assert not great(chess.STARTING_FEN, "e4", cp_after=brilliance.MATE_CP - 3)  # mate in hand
    # Taking a free queen isn't great, however much the alternatives lose.
    assert not great("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1", "Qxd5")
    # Getting out of check is forced.
    assert not great("4k3/8/8/8/8/8/3q4/4K3 w - - 0 1", "Kxd2")


def test_king_defends():
    # The rook on h6 is attacked by the rook on h2 but the king on h7 takes back.
    board = chess.Board("8/7K/4R2p/3k4/6P1/8/7r/8 w - - 5 46")
    assert not brilliant(board.fen(), "Rxh6")
    board.push_san("Rxh6")
    assert brilliance.is_safe(board, chess.H6)


def test_xray_defenders_count():
    # 11.Be4 vs Coach-David: the h1 rook looks hanging to Qg2, but after ...Qxh1+ the bishop
    # on e4 takes back along the opened diagonal. Not a sacrifice.
    assert not brilliant("r1b1k1nr/3p1ppp/ppN1p3/2b1P3/8/2NB4/PPP1QPqP/R1B1K2R w KQkq - 0 11", "Be4")
    # Doubled rooks: the back rook defends the front one.
    board = chess.Board("3rk3/8/8/8/8/8/3R4/3RK3 w - - 0 1")
    assert brilliance.is_safe(board, chess.D2)


def test_taking_the_bait_must_be_safe():
    # 9.a3 vs Coach-David: the b5 bishop's guard on c3 is pinned, but ...Qxb5 unpins it and
    # Nxb5 wins the queen, so the bishop isn't really hanging.
    assert not brilliant("rn2kb1r/pp1b1ppp/3ppn2/1B6/1q2P1P1/1NN5/PPP2P1P/R1BQK2R w KQkq - 2 9", "a3")
