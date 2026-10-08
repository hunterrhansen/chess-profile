-- 0005: games are analysed with a budget of positions per move (Stockfish "nodes", 500k by
-- default) instead of a fixed depth (Phase 3c): every move costs about the same, so a game's
-- cost is predictable, and it's cheaper than depth 18 for much the same labels (`knightly
-- bench`). game_analysis records which was used: `depth` for games analysed before, `nodes`
-- from now on.

ALTER TABLE game_analysis ALTER COLUMN depth DROP NOT NULL, ADD COLUMN nodes INTEGER;
