# Knightly

## Web UI

Follow [docs/design.md](docs/design.md) for any change under `web/`. In short: colors only
from tokens (`web/src/styles/tokens.css`), bright fills take their `on-*` text color, use the
existing components before building new ones, and check new UI on `/styleguide` in light and
dark. `pnpm lint` (in `web/`) fails on raw colors.
