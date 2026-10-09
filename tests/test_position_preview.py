import chess
import chess.engine

from knightly import lines


def test_preview_uses_white_perspective_for_black_to_move():
    board = chess.Board()
    board.push_uci("e2e4")
    score = chess.engine.PovScore(chess.engine.Cp(200), chess.BLACK)
    out = lines.preview(board, lambda _: (score, [chess.Move.from_uci("e7e5")]))
    assert out["eval_cp"] == -200
    assert out["white_win"] < 50
    assert out["moves"] == ["e7e5"] and out["san"] == ["e5"]
    assert out["start_fen"] == board.fen()


def test_preview_mate_and_draw_need_no_engine():
    board = chess.Board()
    for uci in ["f2f3", "e7e5", "g2g4", "d8h4"]:
        board.push_uci(uci)
    out = lines.preview(board, None)
    assert out["result"] == "Checkmate" and out["white_win"] == 0
    assert not out["moves"]
    out = lines.preview(chess.Board("7k/5K2/6Q1/8/8/8/8/8 b - - 0 20"), None)
    assert out["result"] == "Draw by stalemate" and out["white_win"] == 50


def test_preview_threefold_keeps_history():
    board = chess.Board()
    for uci in ["g1f3", "g8f6", "f3g1", "f6g8"] * 2:
        board.push_uci(uci)
    assert lines.preview(board, None)["result"] == "Draw by repetition"


def test_preview_stops_at_repetition_and_preserves_signed_mate():
    board = chess.Board()
    for uci in ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3"]:
        board.push_uci(uci)
    pv = [chess.Move.from_uci(u) for u in ["g8f6", "f3g1", "f6g8", "g1f3"]]
    out = lines.preview(board, lambda _: (chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE), pv))
    assert len(out["moves"]) == 3
    out = lines.preview(chess.Board(), lambda b: (chess.engine.PovScore(chess.engine.Mate(2), chess.BLACK), [next(iter(b.legal_moves))]))
    assert out["mate"] == -2 and out["white_win"] < 1
