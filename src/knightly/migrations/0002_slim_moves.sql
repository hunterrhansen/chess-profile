-- 0002: a slimmer `moves` table (Phase 1b), about 30% less per row, so more people fit in
-- the database:
--   * fen_before is gone: positions are rebuilt from the game's moves (positions.py). It
--     was a quarter of every row.
--   * Small numbers are smallint (2 bytes, not 4): plies, move numbers, evals (mate is
--     stored as +/-(10000 - plies), well inside +/-32767), centipawn loss.
--   * color, phase and classification are enums (4 bytes) instead of text. They read and
--     compare like the text they replace: classification = 'blunder' still works.

CREATE TYPE side AS ENUM ('white', 'black');
CREATE TYPE move_phase AS ENUM ('opening', 'middlegame', 'endgame');
CREATE TYPE move_class AS ENUM (
    'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'miss');

ALTER TABLE moves
    DROP COLUMN fen_before,
    ALTER COLUMN ply TYPE smallint,
    ALTER COLUMN move_number TYPE smallint,
    ALTER COLUMN color TYPE side USING color::side,
    ALTER COLUMN is_user TYPE smallint,
    ALTER COLUMN phase TYPE move_phase USING phase::move_phase,
    ALTER COLUMN eval_before TYPE smallint,
    ALTER COLUMN eval_after TYPE smallint,
    ALTER COLUMN mate_before TYPE smallint,
    ALTER COLUMN mate_after TYPE smallint,
    ALTER COLUMN cp_loss TYPE smallint,
    ALTER COLUMN classification TYPE move_class USING classification::move_class,
    ALTER COLUMN eval_second TYPE smallint;

