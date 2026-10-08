import shutil

import chess
import pytest

from knightly import analyze, db

# Scholar's mate: White's 3.Bc4 and 4.Qxf7# are fine, Black's 3...Nf6?? is the blunder.
SCHOLARS_MATE = """[Event "test"]
[White "me"]
[Black "them"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Qh5 {[%clk 0:02:55]} 2... Nc6 {[%clk 0:02:50]}
3. Bc4 {[%clk 0:02:52]} 3... Nf6 {[%clk 0:02:40]} 4. Qxf7# {[%clk 0:02:51]} 1-0
"""


def test_win_pct_and_accuracy():
    assert analyze.win_pct(0) == 50
    assert analyze.win_pct(5000) == analyze.win_pct(1000) > 95  # clamped
    assert analyze.win_pct(-300) == pytest.approx(100 - analyze.win_pct(300))
    assert analyze.move_accuracy(60, 60) == pytest.approx(100, abs=0.01)
    assert analyze.move_accuracy(60, 70) == analyze.move_accuracy(60, 60)  # gaining win% is never penalised
    assert analyze.move_accuracy(80, 20) < 10


def test_classify():
    assert analyze.classify(50, 10, is_best=True) == "best"
    assert analyze.classify(50, 49, is_best=False) == "excellent"
    assert analyze.classify(50, 47, is_best=False) == "good"
    assert analyze.classify(50, 44, is_best=False) == "inaccuracy"
    assert analyze.classify(50, 39, is_best=False) == "mistake"
    assert analyze.classify(50, 35, is_best=False) == "mistake"  # 15 points: a blunder before
    assert analyze.classify(50, 30, is_best=False) == "blunder"


def test_classify_miss():
    # Opponent just lost 50 points; giving 75 of them back is a miss, not a blunder.
    assert analyze.classify(93, 18, is_best=False, opponent_drop=50) == "miss"
    # A small slip after their blunder is still just an inaccuracy...
    assert analyze.classify(93, 86, is_best=False, opponent_drop=50) == "inaccuracy"
    # ...and a blunder after an ordinary move is a blunder.
    assert analyze.classify(50, 25, is_best=False, opponent_drop=3) == "blunder"


def test_classify_special_moves_win():
    assert analyze.classify(50, 50, is_best=True, special="great") == "great"
    assert analyze.classify(50, 50, is_best=True, special="brilliant") == "brilliant"
    assert analyze.classify(50, 50, is_best=True) == "best"


def test_phase_and_time_control():
    assert analyze.phase(chess.Board(), 1) == "opening"
    assert analyze.phase(chess.Board(), 25) == "middlegame"
    assert analyze.phase(chess.Board("4k3/8/8/8/8/8/8/R3K3 w - - 0 40"), 40) == "endgame"
    assert analyze.parse_time_control("600+5") == (600, 5)
    assert analyze.parse_time_control("180") == (180, 0)
    assert analyze.parse_time_control("1/259200") == (None, 0)
    assert analyze.parse_time_control(None) == (None, 0)


@pytest.mark.skipif(not shutil.which("stockfish"), reason="stockfish not installed")
def test_analyze_game_end_to_end(db_url, tmp_path):
    conn = db.connect(db_url)
    conn.execute("INSERT INTO games (source, source_id, pgn, user_color, time_control, variant) "
                 "VALUES ('otb', 'x', ?, 'white', '180+2', 'standard')", (SCHOLARS_MATE,))
    assert analyze.run(conn, depth=10, workers=1, log=lambda _: None) == 1
    assert analyze.run(conn, depth=10, workers=1, log=lambda _: None) == 0  # already done

    moves = conn.execute("SELECT * FROM moves ORDER BY ply").fetchall()
    assert [m["san"] for m in moves] == ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]
    assert [m["is_user"] for m in moves] == [1, 0, 1, 0, 1, 0, 1]
    nf6 = moves[5]
    assert nf6["classification"] == "blunder" and nf6["color"] == "black"
    assert nf6["eval_after"] > 9000 and nf6["mate_after"] == 1  # White mates in 1
    assert moves[6]["classification"] == "best" and moves[6]["eval_after"] == analyze.MATE_CP
    # Clocks: Black went 2:50 -> 2:40 with a 2s increment = 12s spent on Nf6.
    assert nf6["clock_left"] == 160 and nf6["time_spent"] == 12
    assert moves[0]["time_spent"] == 2  # first move: 3:00 base -> 3:00 + 2s increment

    summary = conn.execute("SELECT * FROM game_analysis").fetchone()
    assert summary["engine"].startswith("Stockfish")
    assert summary["user_blunders"] == 0 and summary["opponent_blunders"] >= 1
    assert summary["user_accuracy"] > summary["opponent_accuracy"]
