-- knightly schema, v1
--
-- Design rules:
--   * Every row keeps the untouched source payload (`pgn` and/or `raw`), so new
--     columns can always be back-filled by re-parsing without re-downloading.
--   * (source, source_id) is the natural key; importers are idempotent and
--     safe to re-run.
--   * Columns are "from the profile owner's point of view" where that matters
--     (user_color, user_outcome, user_rating ...), which is what analysis needs.

CREATE TABLE IF NOT EXISTS accounts (
    source      TEXT NOT NULL,          -- chesscom | lichess | otb
    handle      TEXT NOT NULL,          -- username, or name as written in OTB PGNs
    added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (source, handle)
);

CREATE TABLE IF NOT EXISTS games (
    id              INTEGER PRIMARY KEY,
    source          TEXT NOT NULL,      -- chesscom | lichess | otb (or any label passed to import-pgn)
    source_id       TEXT NOT NULL,      -- platform game id; content hash for PGN imports
    account         TEXT,               -- which of the owner's handles played this game
    url             TEXT,
    played_at       TEXT,               -- ISO-8601 UTC start time when known, else date
    variant         TEXT,               -- standard, chess960, ...
    speed           TEXT,               -- bullet | blitz | rapid | classical | daily | correspondence | otb
    time_control    TEXT,               -- e.g. "300+3", "1/259200"
    rated           INTEGER,
    white           TEXT,
    black           TEXT,
    white_elo       INTEGER,
    black_elo       INTEGER,
    result          TEXT,               -- 1-0 | 0-1 | 1/2-1/2 | *
    termination     TEXT,
    user_color      TEXT,               -- white | black | NULL if owner not identified
    user_outcome    TEXT,               -- win | loss | draw
    user_rating     INTEGER,
    opponent        TEXT,
    opponent_rating INTEGER,
    user_accuracy   REAL,
    opponent_accuracy REAL,
    eco             TEXT,
    opening         TEXT,
    start_fen       TEXT,               -- NULL for the standard start position
    ply_count       INTEGER,
    moves_san       TEXT,               -- space-separated SAN, main line only
    pgn             TEXT NOT NULL,      -- full PGN incl. clocks/evals/comments
    raw             TEXT,               -- source JSON payload, if any
    imported_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS games_played_at ON games (played_at);
CREATE INDEX IF NOT EXISTS games_opening   ON games (eco, user_color);
CREATE INDEX IF NOT EXISTS games_outcome   ON games (user_outcome);

-- One row per puzzle *attempt* (the same puzzle can be attempted more than once).
CREATE TABLE IF NOT EXISTS puzzle_attempts (
    id              INTEGER PRIMARY KEY,
    source          TEXT NOT NULL,
    puzzle_id       TEXT NOT NULL,
    account         TEXT,
    attempted_at    TEXT NOT NULL,      -- ISO-8601 UTC
    success         INTEGER,            -- 1 solved, 0 failed
    fen             TEXT,               -- position *before* last_move (Lichess convention)
    last_move       TEXT,               -- UCI move that leads to the puzzle position
    solution        TEXT,               -- space-separated UCI
    themes          TEXT,               -- JSON array, query with json_each()
    puzzle_rating   INTEGER,
    plays           INTEGER,
    url             TEXT,
    raw             TEXT,
    imported_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (source, puzzle_id, attempted_at)
);
CREATE INDEX IF NOT EXISTS puzzle_attempts_at ON puzzle_attempts (attempted_at);

-- Puzzles picked from the Lichess puzzle database (puzzles.py) for the themes your mistakes
-- are tagged with. Replaced wholesale by each `knightly puzzles import`.
CREATE TABLE IF NOT EXISTS lichess_puzzles (
    puzzle_id   TEXT PRIMARY KEY,
    fen         TEXT NOT NULL,          -- before moves[0], the opponent's setting-up move
    moves       TEXT NOT NULL,          -- space-separated UCI; yours at odd indexes
    rating      INTEGER NOT NULL,
    popularity  INTEGER,
    plays       INTEGER,
    themes      TEXT NOT NULL,          -- space-separated Lichess themes
    url         TEXT
);
CREATE INDEX IF NOT EXISTS lichess_puzzles_rating ON lichess_puzzles (rating);

-- Point-in-time copies of profile/stats endpoints (ratings, tactics rating, records...).
-- Chess.com does not expose puzzle history, so this is where its tactics rating lives.
CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY,
    source      TEXT NOT NULL,
    account     TEXT NOT NULL,
    kind        TEXT NOT NULL,          -- stats | profile
    taken_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    data        TEXT NOT NULL           -- JSON
);

-- Free-form learnings, optionally pinned to a game and/or position.
CREATE TABLE IF NOT EXISTS notes (
    id          INTEGER PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    body        TEXT NOT NULL,
    tags        TEXT,                   -- JSON array
    game_id     INTEGER REFERENCES games(id),
    fen         TEXT,                   -- the position the note is about
    ply         INTEGER                 -- where in game_id that position is, for linking back
);

-- Incremental-sync cursors.
CREATE TABLE IF NOT EXISTS sync_state (
    source      TEXT NOT NULL,
    account     TEXT NOT NULL,
    kind        TEXT NOT NULL,          -- games | puzzles
    cursor      TEXT,
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (source, account, kind)
);

-- Engine analysis (filled by `knightly analyze`). One row per analysed game; a game
-- with no row here hasn't been analysed yet. Re-analysing replaces the game's rows.
CREATE TABLE IF NOT EXISTS game_analysis (
    game_id             INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    engine              TEXT NOT NULL,      -- e.g. "Stockfish 19"
    depth               INTEGER NOT NULL,
    analyzed_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    user_acpl           REAL,               -- average centipawn loss (evals clamped to +/-1000)
    opponent_acpl       REAL,
    user_accuracy       REAL,               -- mean per-move accuracy, Lichess formula; close to but
    opponent_accuracy   REAL,               --   not identical to the platforms' own numbers
    user_inaccuracies   INTEGER,
    user_mistakes       INTEGER,
    user_blunders       INTEGER,
    opponent_blunders   INTEGER
);

-- One row per half-move of an analysed game. Evals are from WHITE's point of view, like
-- every engine/GUI shows them; win_pct_* and cp_loss are from the MOVER's point of view.
CREATE TABLE IF NOT EXISTS moves (
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply             INTEGER NOT NULL,       -- 1 = White's first move
    move_number     INTEGER NOT NULL,       -- 1, 1, 2, 2, ...
    color           TEXT NOT NULL,          -- white | black (who moved)
    is_user         INTEGER,                -- 1 if the profile owner made this move, NULL if owner unknown
    phase           TEXT NOT NULL,          -- opening | middlegame | endgame
    fen_before      TEXT NOT NULL,          -- position the move was played from
    san             TEXT NOT NULL,
    uci             TEXT NOT NULL,
    best_san        TEXT,                   -- engine's choice in fen_before
    best_uci        TEXT,
    eval_before     INTEGER,                -- centipawns, White POV; mates as +/-(10000 - plies to mate)
    eval_after      INTEGER,
    mate_before     INTEGER,                -- mate-in-N, White POV (negative = Black mates), else NULL
    mate_after      INTEGER,
    cp_loss         INTEGER,                -- >= 0, mover POV, evals clamped to +/-1000
    win_pct_before  REAL,                   -- 0-100, mover POV (Lichess win% curve)
    win_pct_after   REAL,
    accuracy        REAL,                   -- 0-100, Lichess per-move accuracy formula
    classification  TEXT,                   -- brilliant | great | best | excellent | good | inaccuracy | mistake | blunder | miss
    clock_left      REAL,                   -- seconds on mover's clock after the move, if recorded
    time_spent      REAL,                   -- seconds spent on this move (increment-adjusted)
    eval_second     INTEGER,                -- eval of the engine's 2nd choice in fen_before, White POV; NULL if one legal move
    pattern         TEXT,                   -- your mistakes only: the tactic behind it (patterns.py), a Lichess theme or "other"
    PRIMARY KEY (game_id, ply)
);
CREATE INDEX IF NOT EXISTS moves_user_class ON moves (is_user, classification);

-- One row per `knightly update` (the scheduled sync -> analyse -> backup pipeline).
CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY,
    started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    finished_at     TEXT,
    status          TEXT NOT NULL,          -- running | ok | partial (some step failed) | failed
    trigger         TEXT,                   -- manual | schedule
    new_games       INTEGER,
    new_puzzles     INTEGER,
    games_analysed  INTEGER,
    backup_path     TEXT,
    errors          TEXT,                   -- JSON array of messages, NULL if none
    progress        TEXT                    -- JSON, live while running: {"plan": [step keys],
                                            --   "current": key, "detail": "3 of 5 games",
                                            --   "done": [{"key", "summary", "error"}]}
);

-- App settings changed from the web app's Settings page (or by hand), as key -> JSON value.
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Engine lines for game review's "Why" / "Best line" buttons, computed on first request
-- and kept. kind: best (from the position before the move) | why (from the one after it).
CREATE TABLE IF NOT EXISTS engine_lines (
    game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply         INTEGER NOT NULL,
    depth       INTEGER NOT NULL,
    data        TEXT NOT NULL,          -- JSON: {"best": {...}, "why": {...}} (see lines.py)
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (game_id, ply, depth)
);

-- The review deck (deck.py): one card per position where you went wrong and one move was
-- clearly better. Keyed like `moves` but not tied to its rows, so re-analysing a game keeps
-- the card's history.
CREATE TABLE IF NOT EXISTS cards (
    game_id           INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply               INTEGER NOT NULL,
    added_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    step              INTEGER NOT NULL DEFAULT 0,  -- right answers in a row; 4 = mastered
    due               TEXT,                        -- YYYY-MM-DD (local) of the next review; NULL = new, or mastered
    reviews           INTEGER NOT NULL DEFAULT 0,
    lapses            INTEGER NOT NULL DEFAULT 0,  -- wrong answers
    last_reviewed_at  TEXT,
    PRIMARY KEY (game_id, ply)
);

-- Games you've walked through on the review page and finished ("Finish review"). Kept apart
-- from `games` so re-importing a game never forgets it was reviewed.
CREATE TABLE IF NOT EXISTS game_reviews (
    game_id      INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    reviewed_at  TEXT NOT NULL              -- ISO-8601 UTC, the latest time it was finished
);

-- Every graded answer (a card's first of the day), for history and the daily count.
CREATE TABLE IF NOT EXISTS card_reviews (
    id           INTEGER PRIMARY KEY,
    game_id      INTEGER NOT NULL,
    ply          INTEGER NOT NULL,
    reviewed_at  TEXT NOT NULL,             -- ISO-8601 UTC
    answer_uci   TEXT NOT NULL,
    correct      INTEGER NOT NULL,
    FOREIGN KEY (game_id, ply) REFERENCES cards(game_id, ply) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS card_reviews_at ON card_reviews (reviewed_at);
