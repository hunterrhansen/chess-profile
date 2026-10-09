# Knightly

## Web UI

Follow [docs/design.md](docs/design.md) for any change under `web/`. In short: colors only
from tokens (`web/src/styles/tokens.css`), bright fills take their `on-*` text color, use the
existing components before building new ones, and check new UI on `/styleguide` in light and
dark. `pnpm lint` (in `web/`) fails on raw colors.

Each screen's layout, states and decisions are in [docs/screens/](docs/screens/README.md),
with pictures from the design canvas. New screens are drawn on the canvas first; once one is
decided, write or update its spec and pictures here in the same change, so Codex and other
tools see the same design.

## Deploying

[docs/deploy.md](docs/deploy.md) is the runbook. Its "Where we are" checklist is the current state
of the first deploy: start at the first open box, and tick boxes off as they're done. The
architecture and the phase tracker are in the "Knightly Architecture" Claude Doc. The Oracle
machine is OpenTofu in `infra/oracle`. Secrets never go in the repo or the chat: the owner
pastes them over SSH.
