# Build vs. buy: internal tools at Fernpay

**To:** VP Engineering and the exec team. **Re:** replacing the internal-tools platform (~$250K/yr) with Devin plus a thin paved road we own.

> Draft. Values marked `[[measured]]` are filled in from the prototype's Devin sessions and PRs. Values marked *assumption* are estimates; the reasoning for each is shown.

## Recommendation

**Replace the platform.** Run internal tools on Toolyard: a small paved road we own (SSO/roles, audit, approvals, idempotent connectors, CI guardrails). Devin builds tools from plain-English Slack requests and maintains them. Engineers approve every change.

Migrate the 3 existing apps one at a time, each with a two-week parallel run. Build every new tool on Toolyard. Cancel the license at renewal.

This recommendation holds only if:
1. a named platform owner is accountable for Toolyard (*assumption*: about 0.25 FTE);
2. every merge needs a human approval and green CI;
3. Devin runs under the restricted security profile, with no production credentials.

## What we're paying for today, and what replaces it

The platform sells two things: a **builder** and a **managed host with guardrails**. The builder is being commoditized by the vendor itself. Power Apps now hosts React "code apps", generates React for model-driven pages, and recommends outside AI coding agents. The guardrails are the part worth paying for, and they're a small amount of code to own.

| What we pay for | How Toolyard replaces it |
|---|---|
| Drag-and-drop builder, Copilot | Devin from a Slack request, using a repo skill and a scaffold template |
| Dataverse | Postgres; tools own namespaced tables |
| Connectors with managed credentials | Typed server-side connectors (payments, KYC, ledger, flags). Keys never reach the browser. |
| Data-loss-prevention policies | Each tool declares connector scopes and gets a risk tier. Undeclared calls fail at runtime and in CI. |
| Entra ID roles, sharing | IdP group → role mapping. Per-tool `access.ts` changes require security review (CODEOWNERS). |
| Field-level security | PII masked by default. Reveals need a reason and are audited. |
| Auditing | Append-only audit. Each attempt is logged *before* the vendor call, and its outcome after. |
| Power Automate approvals | One approvals primitive: maker-checker, break-glass with post-hoc review, no self-approval |
| Environments, solutions | Git, PRs, CI, code owners, branch protection |
| Admin center | `/admin` inventory: owners, risk tiers, scopes, who can do what |
| Vendor patching | Devin automations: weekly dependency PRs, CI auto-fix, Security Swarm scans. A human merges each one. |

## Evaluation

### 1. Build cost
- **Paved road (one-time).** The prototype's platform layer is about 2,400 lines of TypeScript, including the UI kit, plus about 950 lines of tests. On top of that, about 1,300 lines simulate the vendors. Devin built it, and humans reviewed it. Making it production-ready needs real Okta OIDC, per-module migrations, a deploy target with preview environments, backups, observability, and a pen test. *Assumption:* 3–5 engineer-weeks with Devin doing most of the implementation.
- **Per tool**, measured on the three builds:

| Tool | Intake | Request → PR | Devin usage | CI first pass | Review findings | Human review time | Files outside the tool folder |
|---|---|---|---|---|---|---|---|
| KYC review queue | Slack channel | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` |
| Feature flag admin | `!new-tool` macro | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` |
| Refunds dashboard | Slack channel | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` | `[[measured]]` |

On the platform today, the same tools still need engineers. Internal payments and ledger services need custom connectors. Complex rules mean writing Power Fx. Large datasets hit delegation limits, where non-delegable queries silently truncate at 500–2,000 rows, a correctness risk for reconciliation work.

### 2. Maintenance burden
- **What we take on:** hosting (a small app plus managed Postgres), framework upgrades, dependency CVEs, uptime for internal tools (a lower SLO than production), backups, and quarterly access reviews.
- **What Devin absorbs:**
  - weekly dependency PRs, grouped by risk;
  - fixes for failing CI on any branch;
  - change requests from Slack, scoped to one tool folder;
  - scheduled Security Swarm scans with fix PRs.
- **What stays human:** reviewing and merging Devin's PRs (`[[measured: minutes per PR]]`), platform-layer changes, incident response, and access reviews.
- **Key-person risk:** the paved road is a single place to understand. It's small and documented (`AGENTS.md`, DeepWiki), and Devin can explain or change it. The platform owner is still a real role.

### 3. Security
- **Better than today:**
  - Every change is code-reviewed, CI-gated, and attributable.
  - Segregation of duties is enforced in code, not by convention.
  - Each tool gets least-privilege connector scopes.
  - Data and vendor credentials stay inside our infrastructure.
  - Money movement is idempotent end to end.
  - Change-management evidence for SOC 2 is simply the PR history.
- **Worse, or new:**
  - We own the application's vulnerabilities and its uptime.
  - Toolyard enters SOC 2 scope.
  - A high volume of AI-written code risks review fatigue.
  - Devin becomes a privileged contributor.
- **Controls on Devin:**
  - It runs under a security profile: network allowlist, no GitHub CLI token, read-only Devin MCP, no MCP servers.
  - It never holds production credentials.
  - It is PR-only, with branch protection and code owners.
  - Automations have rate and usage caps.
  - Slack requests (a prompt-injection surface) come only from workspace members, and nothing they ask for can merge without review.

### 4. Opportunity cost of engineering time
- **Engineer time per tool shifts** from building to reviewing: `[[measured]]` review minutes per tool, plus about 1 change request per tool per month (*assumption*).
- **The platform owner's time** is the main recurring cost (*assumption*: about 0.25 FTE). It replaces the time engineers already spend on the platform's custom connectors and workarounds.
- **The comparison that matters:** the platform license doesn't remove engineering time for complex fintech tools. Toolyard doesn't remove engineering judgment. It removes the typing.

### 5. Cost model (order of magnitude, not a quote)
- **Annual Toolyard cost** = Devin usage + engineer time + hosting.
  - Devin usage covers builds, changes, maintenance automations, and reviews.
  - Engineer time = platform-owner fraction + review hours.
- **Devin pricing** (Teams): $40 per month per full seat. Automations and Devin Review draw from shared usage credits. Requesters going through the Slack automation need no seat.
- **Worked example:** `[[measured + assumptions]]`. Inputs: 13 tools in year one, about 12 changes per tool per year, weekly maintenance automations, auto-review on every PR, and the measured usage per tool.
- **Platform cost** = $250K license + the engineer time still spent on custom connectors and complex logic.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A bad tool takes down the host | Per-tool error boundaries, CI gates, scoped connectors. Split hosts by domain past ~50 tools. |
| Review fatigue lets risky code through | Mechanical guardrails (lint allowlist, conformance, permission tests), Devin Review rules, and a risk tier on every PR. Critical-tier tools get a second reviewer. |
| A double refund or double ledger posting | Idempotency keys end to end, `external_id` = refund id, atomic approval claims, write-ahead audit. A test proves exactly-once behavior on retry. |
| Unresolved attempts after a crash | Surfaced on `/audit`. Retrying with the same key is safe. A reconciler job is on the roadmap. |
| The platform owner leaves | Small codebase, `AGENTS.md`, DeepWiki docs, and Devin can explain any part of it |
| Devin usage spikes | ACU caps per automation, rate limits, and spend dashboards |
| A compliance team wants vendor attestations | Toolyard inherits our cloud's controls. Map them in the SOC 2 narrative, and pen-test before cutover. |

## When buying wins instead
- Only a handful of apps, mostly simple forms, built and changed daily by non-engineers who need instant edits.
- A Microsoft-centric estate (Entra, Teams, SharePoint, Dataverse) that already holds the data.
- Nobody can own a platform, even part-time.
- Compliance can't absorb a new in-house system into scope.

None of these describe Fernpay today: a 60-engineer, API-first fintech whose tools touch money and PII.

## Rollout
1. **Weeks 0–2.** Productionize the paved road (Okta OIDC, deploy, migrations, backups, logs). Run a security review. Name the platform owner.
2. **Weeks 2–6.** Migrate feature flags first (lowest risk), then the KYC queue. Run each in parallel with the old app for two weeks.
3. **Weeks 6–10.** Migrate refunds, in parallel with the old app and reconciled against the ledger. Open `#tool-requests` to everyone.
4. **At renewal.** Cancel the license if the success metrics hold.

**Success metrics:**
- lead time from request to production;
- engineer review minutes per tool;
- incidents caused by tools;
- unresolved audit attempts (target: 0);
- Devin spend per tool;
- requester satisfaction.
