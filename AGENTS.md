# Working on Knightly

Read `docs/agent-setup.md` for shared tools, provider skills, authentication and
connection checks. When the checkout includes the mobile migration, read
`mobile/AGENTS.md` before changing the Expo app.

## Architecture

- `src/knightly/`: Python CLI, FastAPI backend, chess analysis and practice logic.
- `src/knightly/migrations/`: the backend's versioned SQL migrations.
- `web/`: existing React web app.
- `mobile/` (mobile migration): Expo / React Native app, with Expo Router routes
  in `src/app/`. Its implementation is maintained separately from this tool setup.
- `docs/deploy.md`: current hosting, database project IDs and deployment process.
- The mobile app uses the existing HTTPS backend and Clerk identity. Preserve
  server-side practice grading and user isolation when changing either client.

## Design

Before changing UI in `web/` or `mobile/`, read [`docs/design.md`](docs/design.md) (tokens,
components, the board, lessons, motion) and the screen's spec in
[`docs/screens/`](docs/screens/README.md) (what each screen holds, its states, the decisions
behind it, and a picture of the design). Colors come only from tokens; in `web/`, `pnpm lint`
fails on raw colors. When a screen's design changes, update its spec and picture in the same
change.

## Tools and skills

- Use the official Expo skills for native UI, data fetching, SDK upgrades and
  deployment when relevant. Verify APIs against the project's installed SDK.
- Use the official Supabase and Postgres skills for database work. Knightly uses
  Clerk authentication; do not introduce Supabase Auth just because a skill's
  examples use it.
- The shared MCP names are `expo`, `supabase-staging` and `supabase-prod`.
  Both database connections are project-scoped and read-only. Use staging for
  development evidence and production only when the task needs it. Keep reads
  limited to the schema or data necessary for the task.
- Missing tools do not justify inventing results. Use official docs and existing
  CLIs for independent work, and report which authentication or tool check is
  still needed. Installed skills and authenticated MCP tools are separate checks.
- Schema changes follow the existing backend migration process. These read-only
  MCP connections do not grant permission or a mechanism to alter databases.

## Verification

Run checks appropriate to the changed area; explain any checks that could not run.

- Mobile (from `mobile/`): `pnpm lint`, `pnpm typecheck`, `pnpm test`.
  For native dependency/config changes, also run `pnpm dlx expo-doctor` and an
  iOS export. Bundling does not prove installation or physical-device behavior.
- Web (from `web/`): `pnpm lint`, `pnpm test`, `pnpm build`.
- Backend: `uv run pytest`; database tests need a dedicated test database, never
  a hosted production database. Consult the tests' configuration before running.
- Agent declarations: parse TOML and JSON, compare endpoint names and URLs, and
  verify that a trusted Codex checkout loads the three named servers.

## Local state

Keep OAuth sessions, passwords, access tokens, signing credentials, private
environment files and machine-specific paths out of shared agent configuration.
Preserve existing uncommitted work. Do not deploy or start a new paid build merely
to verify an MCP connection; use documentation or metadata reads.
