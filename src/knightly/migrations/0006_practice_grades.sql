-- Cached move feedback inherits moves' user ownership, RLS and deletion cascade.
-- One replaceable, versioned cache per move; no shared/private-data lookup table.
ALTER TABLE moves ADD COLUMN practice_grades JSONB;
