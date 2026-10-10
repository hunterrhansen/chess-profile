import pytest
from knightly import timing


def test_request_timing_collects_nested_phases_and_resets_on_failure():
    with timing.collect() as sample:
        assert timing.call('position', lambda: 42) == 42
        with pytest.raises(ValueError):
            timing.call('engine_search', lambda: (_ for _ in ()).throw(ValueError()))
    assert sample['position'] >= 0
    assert sample['engine_search'] >= 0
    timing.call('outside', lambda: 42)
    assert 'outside' not in sample


def test_nested_collectors_do_not_mix_request_samples():
    with timing.collect() as outer:
        timing.call('load', lambda: None)
        with timing.collect() as inner:
            timing.call('search', lambda: None)
        timing.call('save', lambda: None)
    assert set(outer) == {'load', 'save'}
    assert set(inner) == {'search'}


def test_best_answer_keeps_fast_path_without_engine_timings():
    import chess
    from knightly import deck
    with timing.collect() as sample:
        assert timing.call('grade', deck.judge, chess.STARTING_FEN, 'e2e4', 'e2e4', 30) == 'best'
    assert set(sample) == {'grade'}


def test_alternative_answer_records_engine_cost_without_changing_quality(monkeypatch):
    import chess
    import chess.engine
    from knightly import deck

    class Engine:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def analyse(self, board, limit):
            return {'score': chess.engine.PovScore(chess.engine.Cp(30), chess.WHITE)}

    monkeypatch.setattr(deck, 'find_engine', lambda _: 'test-engine')
    monkeypatch.setattr(chess.engine.SimpleEngine, 'popen_uci', lambda _: Engine())
    with timing.collect() as sample:
        assert deck.judge(chess.STARTING_FEN, 'd2d4', 'e2e4', 30) == 'excellent'
    assert set(sample) == {'engine_startup', 'engine_search'}
    assert all(value >= 0 for value in sample.values())
