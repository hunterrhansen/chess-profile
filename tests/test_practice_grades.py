import chess
import chess.engine
import pytest
from knightly import practice_grades as grades

class Engine:
    id = {'name': 'Testfish 1'}
    def analyse(self, board, limit):
        return {'score': chess.engine.PovScore(chess.engine.Cp(30), chess.WHITE), 'depth': 14}


def test_preparation_keeps_alternative_good_moves():
    result = grades.compute(chess.STARTING_FEN, 'e2e4', 30, Engine())
    assert result['grades']['e2e4'] == 'best'
    assert result['grades']['d2d4'] == 'excellent'
    assert len(result['grades']) == 20


def test_incomplete_search_never_marks_a_move_wrong():
    class Shallow(Engine):
        def analyse(self, board, limit):
            return {'score': chess.engine.PovScore(chess.engine.Cp(-1000), chess.WHITE), 'depth': 3}
    result = grades.compute(chess.STARTING_FEN, 'e2e4', 30, Shallow())
    assert result['grades'] == {'e2e4': 'best'}
    assert result['complete'] is False


def test_required_underpromotion_and_legal_mate():
    fen = '8/6P1/5KBk/8/8/8/8/8 w - - 0 1'
    result = grades.compute(fen, 'g7g8n', 10000, Engine())
    assert result['grades']['g7g8n'] == 'best'
    assert result['grades']['g7g8q'] == 'wrong'


def test_fingerprint_invalidates_changes_to_position_reference_engine_or_policy(monkeypatch):
    key = grades.fingerprint(chess.STARTING_FEN, 'e2e4', 30, 'Testfish 1')
    assert key != grades.fingerprint(chess.STARTING_FEN, 'd2d4', 30, 'Testfish 1')
    assert key != grades.fingerprint(chess.STARTING_FEN, 'e2e4', 50, 'Testfish 1')
    assert key != grades.fingerprint(chess.STARTING_FEN, 'e2e4', 30, 'Testfish 2')
    monkeypatch.setattr(grades, 'VERSION', grades.VERSION + 1)
    assert key != grades.fingerprint(chess.STARTING_FEN, 'e2e4', 30, 'Testfish 1')


def add_card(conn, source_id="grade-test"):
    from knightly import deck
    gid = conn.execute("INSERT INTO games (source, source_id, moves_san, pgn, played_at) VALUES ('otb', ?, 'e4 e5', '', '2026-10-09') RETURNING id", (source_id,)).fetchone()[0]
    conn.execute("""INSERT INTO moves (game_id, ply, move_number, color, is_user, phase, san, uci,
                  best_uci, best_san, eval_before, eval_second, classification)
                  VALUES (?, 1, 1, 'white', 1, 'opening', 'd4', 'd2d4', 'e2e4', 'e4', 30, -300, 'blunder')""", (gid,))
    deck.sync(conn)
    return gid


def test_prepared_answer_skips_engine_and_preserves_first_grade(db_url, monkeypatch):
    from knightly import db, deck
    conn = db.connect(db_url)
    gid = add_card(conn)
    monkeypatch.setattr(grades, 'engine_revision', lambda: 'Testfish 1')
    value = grades.compute(chess.STARTING_FEN, 'e2e4', 30, Engine())
    import json
    conn.execute('UPDATE moves SET practice_grades = ?::jsonb WHERE game_id = ?', (json.dumps(value), gid))
    monkeypatch.setattr(deck, 'judge', lambda *args: pytest.fail('prepared answer must not search'))
    result = deck.answer(conn, gid, 1, 'd2d4', seconds=12)
    assert result['quality'] == 'excellent' and result['rating'] == 'good'
    assert deck.answer(conn, gid, 1, 'd2d4')['rating'] is None
    assert conn.execute('SELECT count(*) FROM card_reviews').fetchone()[0] == 1
    conn.close()


def test_cache_reference_change_uses_live_grader(db_url, monkeypatch):
    from knightly import db, deck
    import json
    conn = db.connect(db_url)
    gid = add_card(conn)
    monkeypatch.setattr(grades, 'engine_revision', lambda: 'Testfish 1')
    value = grades.compute(chess.STARTING_FEN, 'e2e4', 30, Engine())
    conn.execute('UPDATE moves SET practice_grades = ?::jsonb, eval_before = 500 WHERE game_id = ?', (json.dumps(value), gid))
    monkeypatch.setattr(deck, 'judge', lambda *args: 'wrong')
    assert deck.answer(conn, gid, 1, 'd2d4')['quality'] == 'wrong'
    conn.close()


def test_worker_batches_cards_outside_transactions_and_api_queues_once(db_url, monkeypatch):
    from knightly import db, api, jobs
    from fastapi.testclient import TestClient
    conn = db.connect(db_url)
    gid = add_card(conn)
    monkeypatch.setattr(grades, 'engine_revision', lambda: 'Testfish 1')
    client = TestClient(api.create_app(database_url=db_url))
    assert client.get('/api/deck').json()['card']['feedback'] is None
    client.get('/api/deck')
    assert jobs.pending(conn) == ['practice']
    class WorkingEngine(Engine):
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def configure(self, config): pass
        def analyse(self, board, limit):
            assert not conn._transactions
            return super().analyse(board, limit)
    monkeypatch.setattr(chess.engine.SimpleEngine, 'popen_uci', lambda _: WorkingEngine())
    assert jobs.work(db_url, scheduler=False, once=True, log=lambda _: None) == 1
    feedback = client.get('/api/deck').json()['card']['feedback']
    assert feedback['grades']['d2d4'] == 'excellent'
    assert grades.prepare_due(conn) is False
    conn.close()


def test_cache_and_feedback_endpoint_keep_user_isolation(db_url, monkeypatch):
    from knightly import db, users, api
    from fastapi.testclient import TestClient
    conn = db.connect(db_url)
    gid = add_card(conn)
    conn.execute("UPDATE moves SET practice_grades = '{\"private\":true}'::jsonb WHERE game_id = ?", (gid,))
    owner = db.connect(db_url)
    other_id = users.ensure(owner, 'user_other')
    other = db.connect(db_url, migrate=False, user_id=other_id)
    assert other.execute('SELECT practice_grades FROM moves WHERE game_id = ?', (gid,)).fetchall() == []
    assert other.execute('UPDATE moves SET practice_grades = NULL WHERE game_id = ?', (gid,)).rowcount == 0
    assert TestClient(api.create_app(database_url=db_url)).get('/api/deck/feedback/9999/1').status_code == 404
    other.close(); owner.close(); conn.close()


def test_engine_failure_does_not_record_a_wrong_grade(db_url, monkeypatch):
    from knightly import db, api
    from fastapi.testclient import TestClient
    conn = db.connect(db_url)
    gid = add_card(conn)
    def unavailable(*args): raise OSError('engine unavailable')
    monkeypatch.setattr(chess.engine.SimpleEngine, 'popen_uci', unavailable)
    response = TestClient(api.create_app(database_url=db_url)).post('/api/deck/answer', json={'game_id':gid,'ply':1,'uci':'d2d4'})
    assert response.status_code == 503
    assert conn.execute('SELECT count(*) FROM card_reviews').fetchone()[0] == 0
    conn.close()


def test_partial_cache_missing_move_falls_back_to_server(db_url, monkeypatch):
    from knightly import db, deck
    import json
    conn = db.connect(db_url)
    gid = add_card(conn)
    monkeypatch.setattr(grades, 'engine_revision', lambda: 'Testfish 1')
    value = grades.compute(chess.STARTING_FEN, 'e2e4', 30, Engine())
    value['grades'] = {'e2e4':'best'}
    value['complete'] = False
    conn.execute('UPDATE moves SET practice_grades = ?::jsonb WHERE game_id = ?', (json.dumps(value),gid))
    monkeypatch.setattr(deck, 'judge', lambda *args: 'excellent')
    assert deck.answer(conn,gid,1,'d2d4')['quality'] == 'excellent'
    conn.close()


def test_preparation_bounds_each_job_and_continues_remaining_cards(db_url, monkeypatch):
    from knightly import db
    conn = db.connect(db_url)
    for i in range(3): add_card(conn, f'card-{i}')
    monkeypatch.setattr(grades, 'engine_revision', lambda: 'Testfish 1')
    class WorkingEngine(Engine):
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def configure(self, config): pass
    monkeypatch.setattr(chess.engine.SimpleEngine,'popen_uci',lambda _:WorkingEngine())
    assert grades.prepare_due(conn) is True
    assert conn.execute('SELECT count(*) FROM moves WHERE practice_grades IS NOT NULL').fetchone()[0] == 2
    assert grades.prepare_due(conn) is False
    assert conn.execute('SELECT count(*) FROM moves WHERE practice_grades IS NOT NULL').fetchone()[0] == 3
    conn.close()
