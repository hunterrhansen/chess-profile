#!/usr/bin/env bash
# Install provider skills and authenticate the repo-declared Codex MCP servers.
set -euo pipefail

task_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_repo_root"
command -v codex >/dev/null || { echo 'Install Codex CLI before running this script.' >&2; exit 1; }

echo 'Review .codex/config.toml and trust this checkout in Codex before continuing.'
echo 'Provider plugins are installed locally; browser sign-in is required per connection.'
codex plugin add expo@openai-curated
codex plugin add supabase@openai-curated-remote
codex mcp login expo
codex mcp login supabase-staging
codex mcp login supabase-prod
echo 'Reload Codex, then run the connection checks in docs/agent-setup.md.'
