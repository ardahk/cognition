# Key decisions (one page)

## What I built, and why this scope
An internal-tools platform like Power Apps sells two things. The first is a **builder**: drag-and-drop screens and formulas. The second is a **managed host with guardrails**: SSO and roles, connectors that hold the credentials, data-loss policies, approvals, audit, and environment promotion. Microsoft itself is commoditizing the builder. Code apps (React on the managed host) are generally available, generative pages emit React, and Microsoft's docs now recommend outside AI coding agents. So the prototype rebuilds **the guardrails, as a thin layer of code the customer owns** ("Toolyard"), and makes **Devin the builder and the maintainer**. Devin built the 3 apps the customer actually runs (KYC queue, refunds, feature flags) from Slack requests. I didn't invent the 10 future apps; instead I show that adding one is cheap and stays inside the guardrails.

## Decisions and tradeoffs
1. **Code over config.** A config-driven UI engine would mean rebuilding the platform we're replacing, and it breaks at the edge cases fintech tools hit (idempotent refunds, ledger invariants). The cost is that non-engineers don't drag and drop. They describe the tool in Slack and review a recording instead.
2. **One host app, one folder per tool.** Every tool shares one auth system, one audit log, one deploy, and one admin inventory. The risk is blast radius: one bad tool affects the host. Mitigations are per-tool error boundaries, connectors scoped to what each tool declares, and CI gates. Past roughly 50 tools, I'd split into one host per domain.
3. **Guardrails are mechanical, not trust-based.** AI-written code at volume needs layered enforcement:
   - permission types inferred from each tool's manifest;
   - runtime wrappers: `defineAction` and `moduleContext`;
   - connectors limited to the scopes a tool declares (the equivalent of data-loss policies);
   - an ESLint import allowlist;
   - conformance tests, plus a runtime check that every action rejects users without its permission;
   - CODEOWNERS on access grants;
   - `REVIEW.md` rules for Devin Review.

   Server Actions are public POST endpoints, so the wrapper is the only sanctioned way to write one.
4. **Money and side effects.** Each attempt is written to the audit log and committed *before* any vendor call, and the outcome is appended afterwards. Idempotency keys run end to end, and the ledger's `external_id` is the refund id, so retrying after a partial failure can't move money or post twice. Approvals are claimed atomically: no self-approval and no double execution. The cost is more audit rows, and unresolved attempts are surfaced on the audit page rather than reconciled automatically.
5. **Intake.**
   - A Slack channel automation, so requesters don't need Devin seats; the engineer path is the `!new-tool` macro.
   - Repo skills (`new-tool`, `change-tool`, `test-tool`) are agent instructions reviewed like code.
   - Devin's end-to-end test and recording run *after* the PR is open and CI is green.
6. **Honest mocks with real seams.**
   - SSO is mocked, but the session uses the shape of OIDC claims, with a mapping from identity-provider groups to roles.
   - Vendors are HTTP APIs with real auth, idempotency, and validation semantics, so moving to real vendors only touches the connectors.
7. **Prototype shortcuts:**
   - `drizzle push` instead of migrations;
   - a generated tool registry, so parallel Devin PRs never edit the same file;
   - local Docker instead of per-PR preview deployments.

## Deliberately not built
- real SSO/SCIM
- preview environments per PR
- a reconciliation job
- a Playwright suite (Devin's post-PR recordings cover end-to-end)
- Devin config managed with Terraform (no API key in this setup)
- Linear/Jira intake
- Devin Oncall

These are roadmap items, listed in the README.

## What I'd do next
1. Real OIDC.
2. Per-module migrations.
3. Preview deployments with a database branch per PR.
4. Devin Oncall wired to the app's logs.
5. A Dynamic Workflow that migrates the remaining legacy apps in parallel.
