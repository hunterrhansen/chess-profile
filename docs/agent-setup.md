# Shared agent setup

Knightly declares its development tools in the repository. A fresh checkout gets
the same server names, endpoints and database scopes. Each developer installs the
provider skills locally and authenticates with their own authorized accounts.
Cloning the repository does not install plugins or grant access to hosted data.

## Files and scope

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Architecture, skill usage and verification instructions |
| `mobile/AGENTS.md` (when the mobile migration is included) | Expo-specific conventions and SDK documentation |
| `.codex/config.toml` | Codex project-scoped MCP declarations |
| `.mcp.json` | Equivalent declarations for Claude Code and compatible clients |
| `scripts/setup-agent-tools.sh` | Local Codex plugin installation and OAuth setup |

Codex loads project configuration only for trusted checkouts. Other clients must
support the format or import its equivalent; `.mcp.json` is not a universal
agent configuration standard. The declarations contain public project IDs and
URLs, not credentials. Keep both configuration files aligned when editing them.

| MCP name | Target | Configuration |
| --- | --- | --- |
| `expo` | Expo account; Knightly project `aed64483-1b28-4038-bc55-766c0f64be9b` | Remote Expo MCP; choose this project in requests |
| `supabase-staging` | `knightly-staging`, `mwkkgxrkhhvvagouvtmo` | Project-scoped, read-only; database, debugging, docs |
| `supabase-prod` | `knightly-prod`, `duvdkqvszkmljwwrhhfk` | Project-scoped, read-only; database, debugging, docs |

Expo's connection is account-level; the project ID above is request context,
not an enforced server restriction. Supabase project scope and read-only mode
are enforced by its server configuration. These declarations support inspection;
database development writes require a separate, intentionally configured workflow.

## Set up Codex on a new computer

1. Install Codex CLI and clone Knightly. Review the shared configuration, open the
   repository in Codex and trust this checkout. Trust is local to the new path.
2. From the repository root, run:

   ```sh
   bash scripts/setup-agent-tools.sh
   ```

   This installs the official provider plugins locally, then starts browser OAuth
   for each server. Choose the Expo account with access to Knightly Preview and
   the Supabase organization containing Knightly staging and production.
3. Reload Codex so it discovers the installed skills and MCP tools.
4. Run the verification below. Missing account access must be granted by the
   project owner; repository configuration cannot supply it.

The equivalent individual commands are:

```sh
codex plugin add expo@openai-curated
codex plugin add supabase@openai-curated-remote
codex mcp login expo
codex mcp login supabase-staging
codex mcp login supabase-prod
```

Use the repository declarations rather than adding duplicate global MCP servers.
Existing global entries with these names can remain; the trusted project layer
overrides their shared settings. OAuth sessions remain local. If a future provider
plugin supplies the same MCP connection, check its endpoint and scope before
removing duplicates; never replace a scoped connection with broad account access.

## Provider skills

Reviewed locally October 9, 2026: Expo plugin `1.0.2`, Supabase plugin `1.0.0`.
The marketplace installers resolve their currently available versions; this is
an installation declaration, not a version lock. Review upgrades when behavior
changes. If a marketplace is unavailable, use the official provider installation
guide rather than an unrelated third-party skill bundle.

Expo provides native UI, data fetching, dev-client, SDK upgrade and deployment
skills. Supabase provides Supabase development and Postgres best-practice skills.
Agents discover installed skills; `AGENTS.md` gives usage guidance, not installation.
Machine-specific plugin cache paths are deliberately absent from this repository.

For another agent client, configure the same remote endpoints, complete its own
OAuth flow, and install official provider skills using that client's supported
installer. Custom Knightly skills, when needed, belong in `.agents/skills/`; do
not duplicate the provider plugins there.

## Verify the connection

From a trusted checkout run `codex mcp list` and confirm `expo`,
`supabase-staging` and `supabase-prod` are enabled with OAuth authentication.
Check the skill list separately for the installed Expo and Supabase skills.
Then ask the agent to perform these reads using MCP:

1. Fetch an official Expo documentation page and read the Knightly Preview project
   metadata or latest build status.
2. List public table names in staging, without fetching user rows.
3. List public table names in production, without fetching user rows.

A successful login confirms authentication, not that all three reads succeeded.
Report each result independently. Do not test write restrictions by attempting a
database mutation. Local Expo simulator automation requires additional local
configuration and a running simulator; remote MCP setup alone does not enable it.

## Credentials and publishing

Store account sessions in the client's local credential store. CI credentials
belong in the CI secret store. Never commit OAuth tokens, service-role keys,
database passwords, signing files or private `.env` files. Supabase's OAuth consent
can request broad permissions even though these MCP URLs enforce read-only
database access and restrict the exposed feature groups.

Commit and push the shared files to make them available to another checkout.
Agent tooling is separate from Knightly's runtime. Mobile build configuration
should exclude agent settings and credentials from EAS uploads; that configuration
is maintained with the mobile migration rather than this tool setup.

## Official references

- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex project trust and configuration](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Expo plugin setup](https://docs.expo.dev/agents/codex/)
- [Supabase MCP configuration](https://supabase.com/docs/guides/ai-tools/mcp)
