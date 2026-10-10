"""Prepare practice feedback in the worker, never search in a deck GET.

A partial map is useful; missing moves always fall back to authoritative grading.
Cache identity includes the engine binary and every input to the grading policy.
"""
import hashlib
import json
import time
from functools import lru_cache
from pathlib import Path

import chess
import chess.engine

from . import positions
from .analyze import find_engine

VERSION = 1
MOVE_TIME = 2.0
CARD_TIME = 30.0
BATCH = 2
PRIORITY = 1
QUALITIES = {'best', 'excellent', 'good', 'wrong'}


@lru_cache(maxsize=4)
def _binary_revision(path, size, modified):
    with open(path, 'rb') as binary:
        return hashlib.file_digest(binary, 'sha256').hexdigest()


def engine_revision():
    try:
        path = Path(find_engine(None)).resolve()
        stat = path.stat()
        return _binary_revision(str(path), stat.st_size, stat.st_mtime_ns)
    except (SystemExit, OSError):
        return None


def fingerprint(fen, best_uci, eval_best, engine):
    from . import deck
    value = [VERSION, fen, best_uci, eval_best, engine, deck.JUDGE_DEPTH,
             deck.GOOD_DROP, deck.HARD_DROP, MOVE_TIME, CARD_TIME]
    return hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()


def compute(fen, best_uci, eval_best, engine, revision=None):
    from . import deck
    board = chess.Board(fen)
    grades = {}
    legal = list(board.legal_moves)
    began = time.monotonic()
    # The known best is available even if the rest exceeds the batch's CPU budget.
    if chess.Move.from_uci(best_uci) in legal:
        grades[best_uci] = 'best'
    for move in legal:
        uci = move.uci()
        if uci in grades:
            continue
        after = board.copy()
        after.push(move)
        if after.is_checkmate():
            grades[uci] = 'best'
        elif after.is_game_over():
            grades[uci] = deck.quality_from_score(board.turn, eval_best, 0) if eval_best is not None else 'wrong'
        elif eval_best is not None and time.monotonic() - began < CARD_TIME:
            info = engine.analyse(after, chess.engine.Limit(depth=deck.JUDGE_DEPTH, time=MOVE_TIME))
            # A capped shallow search is uncertainty, not evidence of a bad move.
            if info.get('depth', 0) >= deck.JUDGE_DEPTH and 'score' in info:
                score = info['score'].white().score(mate_score=10000)
                if score is not None:
                    grades[uci] = deck.quality_from_score(board.turn, eval_best, score)
    return {'version': VERSION, 'key': fingerprint(fen, best_uci, eval_best, revision or engine.id['name']),
            'fen': fen, 'grades': grades, 'complete': len(grades) == len(legal)}


def cached(row, fen):
    value = row['practice_grades']
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    if not isinstance(value, dict):
        return None
    revision = engine_revision()
    if not revision:
        return None
    if value.get('version') != VERSION or value.get('key') != fingerprint(fen, row['best_uci'], row['eval_before'], revision):
        return None
    grades = value.get('grades')
    if not isinstance(grades, dict) or any(not isinstance(q, str) or q not in QUALITIES for q in grades.values()):
        return None
    legal = {move.uci() for move in chess.Board(fen).legal_moves}
    if value.get('fen') != fen or not set(grades).issubset(legal):
        return None
    return value


def load(conn, game_id, ply):
    row = conn.execute('SELECT best_uci, eval_before, practice_grades FROM moves WHERE game_id = ? AND ply = ?',
                       (game_id, ply)).fetchone()
    return row, positions.fen_before(conn, game_id, ply) if row else None


def candidates(conn, first=None):
    from . import deck
    ids = ([(first['game_id'], first['ply'])] if first else [])
    ids += [(r['game_id'], r['ply']) for r in deck.queue(conn)]
    ids += [(r['game_id'], r['ply']) for r in deck.today_results(conn)]
    pending = []
    for game_id, ply in dict.fromkeys(ids):
        row, fen = load(conn, game_id, ply)
        if row and fen and row['best_uci'] and not cached(row, fen):
            pending.append((game_id, ply, row, fen))
    return pending


def prepare_due(conn, first=None):
    todo = candidates(conn, first)
    if not todo:
        return False
    revision = engine_revision()
    if revision is None:
        raise RuntimeError('Stockfish unavailable for practice preparation')
    # The worker already has bounded CPU; one engine is shared serially per batch.
    with chess.engine.SimpleEngine.popen_uci(find_engine(None)) as engine:
        engine.configure({'Threads': 1, 'Hash': 32})
        for game_id, ply, row, fen in todo[:BATCH]:
            value = compute(fen, row['best_uci'], row['eval_before'], engine, revision)
            # No transaction is held during engine work. Reject a changed reference.
            conn.execute('''UPDATE moves SET practice_grades = ?::jsonb
                            WHERE game_id = ? AND ply = ? AND best_uci = ?
                              AND eval_before IS NOT DISTINCT FROM ?''',
                         (json.dumps(value), game_id, ply, row['best_uci'], row['eval_before']))
    return bool(candidates(conn, first))
