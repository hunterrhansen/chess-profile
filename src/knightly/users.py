"""The people Knightly serves, each known by their Clerk user id ("user_2abc...").

"local" is the one person a Mac install serves without signing in. Everything from before
Knightly had users belongs to them; `knightly users link local <clerk id>` hands it to their
Clerk account. These run on the owner's connection: `users` isn't visible to user ones.
"""

LOCAL = "local"


def ensure(conn, clerk_id: str) -> int:
    """The user's id, adding them the first time they're seen (signing in creates no other
    record of them)."""
    found = find(conn, clerk_id)  # first, so seen users don't use up ids
    if found is None:
        conn.execute("INSERT INTO users (clerk_id) VALUES (?) ON CONFLICT (clerk_id) DO NOTHING", (clerk_id,))
        found = find(conn, clerk_id)
    return found


def find(conn, clerk_id: str) -> int | None:
    row = conn.execute("SELECT id FROM users WHERE clerk_id = ?", (clerk_id,)).fetchone()
    return row[0] if row else None


def listing(conn) -> list:
    return conn.execute(
        """SELECT u.id, u.clerk_id, u.created_at,
                  (SELECT count(*) FROM games g WHERE g.user_id = u.id) AS games,
                  (SELECT string_agg(a.source || ':' || a.handle, ', ') FROM accounts a
                   WHERE a.user_id = u.id) AS accounts
           FROM users u ORDER BY u.id""").fetchall()


def link(conn, old: str, new: str) -> None:
    """Give user `old`'s data to Clerk id `new`. If `new` has signed in already, its (empty)
    account is replaced; one that has games is refused, rather than mixing two histories."""
    if find(conn, old) is None:
        raise SystemExit(f"No user {old!r}.")
    taken = find(conn, new)
    with conn:
        if taken is not None:
            if conn.execute("SELECT 1 FROM games WHERE user_id = ?", (taken,)).fetchone():
                raise SystemExit(f"{new} already has games of its own; not merging two histories.")
            conn.execute("DELETE FROM users WHERE id = ?", (taken,))
        conn.execute("UPDATE users SET clerk_id = ? WHERE clerk_id = ?", (new, old))


def delete(conn, clerk_id: str) -> bool:
    """Delete the user and, through ON DELETE CASCADE, everything of theirs."""
    return conn.execute("DELETE FROM users WHERE clerk_id = ?", (clerk_id,)).rowcount == 1
