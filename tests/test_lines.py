import chess
import chess.engine

from chessprofile import lines

# 38...Rd2?? from a real game: Black was winning, ...Rb3 kept it, Rd2 let White equalise.
BEFORE_RD2 = "6k1/5p2/p5p1/6p1/P1p2P2/2R2P2/1r5P/5K2 b - - 0 38"
BEST = ["b2b3", "c3c4", "b3f3", "f1g2", "f3f4", "c4c8", "g8g7", "c8c5"]
WHY = ["f4g5", "d2d5", "c3c4", "d5g5", "c4d4", "g8h7"]


def fake_engine(best_score, why_score):
    """Stand-in for Stockfish: the real lines and scores for this position."""
    def analyse(board):
        if board.turn == chess.BLACK:
            return chess.engine.PovScore(best_score, chess.WHITE), [chess.Move.from_uci(u) for u in BEST]
        return chess.engine.PovScore(why_score, chess.WHITE), [chess.Move.from_uci(u) for u in WHY]
    return analyse


def test_both_lines_with_explanations():
    out = lines.compute(BEFORE_RD2, "b2d2", "Kylawot",
                        fake_engine(chess.engine.Cp(-511), chess.engine.Cp(-2)))
    best, why = out["best"], out["why"]
    # Trimmed to whole exchanges: the best line runs on through the Rc8+ check, then stops.
    assert best["san"] == ["Rb3", "Rxc4", "Rxf3+", "Kg2", "Rxf4", "Rc8+"]
    assert why["san"] == ["fxg5", "Rd5", "Rxc4", "Rxg5"]
    assert best["summary"] == "[[b:Rb3]] wins a pawn, after [[w:Rxc4]] [[b:Rxf3+]] [[w:Kg2]]…"
    assert why["summary"] == "After [[b:Rd2]], Kylawot plays [[w:fxg5]] and wins a pawn."
    assert best["win_pct"] > 85 and 45 < why["win_pct"] < 55  # from Black's (the mover's) side
    assert why["start_fen"].split()[1] == "w" and best["start_fen"] == BEFORE_RD2


def test_mate_wording():
    # Scholar's mate setup: 3...Nf6?? allows Qxf7#.
    before = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3"

    def analyse(board):
        if board.turn == chess.BLACK:
            return chess.engine.PovScore(chess.engine.Cp(-300), chess.BLACK), [chess.Move.from_uci("g7g6")]
        return chess.engine.PovScore(chess.engine.Mate(1), chess.WHITE), [chess.Move.from_uci("h5f7")]

    why = lines.compute(before, "g8f6", "your opponent", analyse)["why"]
    assert why["summary"] == "[[b:Nf6]] allows mate in 1, starting with [[w:Qxf7#]]."
    assert why["mate"] == -1


def test_trim_stops_at_the_first_quiet_move_after_four_plies():
    board = chess.Board()
    pv = [chess.Move.from_uci(u) for u in ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3"]]
    assert len(lines.trim(board, pv)) == 4
