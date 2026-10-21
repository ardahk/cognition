# Security profile: `tool-factory`

Configure it in Devin → Settings → Customization → Security profiles, and set it as the **Automations default**. Enforcement: Recommended.

| Restriction | Setting | Why |
|---|---|---|
| Git access | Full | Devin has to push a branch and open a PR. Branch protection keeps merging with humans. |
| GitHub CLI token | Removed | Devin's built-in git integration already opens PRs and reads CI status, so it doesn't need raw GitHub API access. |
| Devin MCP | Read-only | A tool request can't spawn more sessions or edit org knowledge, playbooks, or automations. |
| MCP servers | None allowed | Tools only reach vendors through the app's connectors. |
| Network allowlist | `registry.npmjs.org`, `*.npmjs.org`, `github.com`, `*.github.com`, `*.githubusercontent.com`, `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`, `nodejs.org` | Covers installing packages, pulling Postgres, and reaching GitHub. Everything else is blocked. |

Devin never gets production credentials. The app runs against mock vendors using the dev-only keys in `.env.example`.

If a session gets blocked by the allowlist, Devin asks for access. Approve the request only for package or tooling hosts, and add them here.
