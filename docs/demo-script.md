# Demo script: Refunds tool, built from a Slack request

**Goal:** show that a non-engineer can get a money-moving tool built from a Slack message, that the paved road keeps it safe, and that an engineer approves it before it ships.

**Format:** a screen recording. Speed up the Devin session parts and cut the waiting.

## Before recording

- KYC review and Feature flags are merged and visible in Toolyard.
- Run `npm run setup` for a fresh seed, then `npm run dev`.
- Open three windows: Slack `#tool-requests`, Toolyard (http://localhost:3000), and GitHub (`ardahk/cognition`).
- The Devin automations are on: Tool Factory, weekly deps, and CI fix. Devin Review auto-review is on.

## 1. Pre-roll (about 30s)

1. Sign in as **priya** (Ops Lead). The catalog shows KYC review and Feature flags.
2. Open `/admin`. Each tool lists its owner, risk tier, connector scopes, and who can do what.
3. Open `/approvals`. It's empty for now.

Line: "Two of our three apps already run on Toolyard. Let's ask for the third the way an ops lead would."

## 2. The request (about 30s)

1. In Slack `#tool-requests`, Priya posts the message from `devin/requests/refunds.md` as-is. It's plain English, with no `@Devin` and no syntax.
2. Devin replies in the thread with its plan:
   - tool id `refunds`
   - roles: support agent requests, ops lead approves, compliance views
   - approval above $250, connector scopes `payments: read, refund` and `ledger: read, post`, risk tier critical
3. If Devin asks a question, Priya answers it in the thread.

Line: "Priya doesn't need a Devin seat or any syntax. Anyone in the workspace can reply in this thread."

## 3. Devin builds it (sped up)

Show the Devin session at fast speed:
1. Skill `new-tool` → `npm run tool:new -- refunds "Refunds"`.
2. Pages read through `moduleContext`. Actions use `defineAction` with an approval rule.
3. The money-movement recipe: the idempotency key, then `ctx.record`, then the ledger post with `externalId = refund.id`.
4. Business-rule tests, then `npm run check` passes.
5. The PR is opened, and its link shows up in the Slack thread.

## 4. The PR gates (about 45s)

1. The PR template is filled in: risk tier, scopes, role grants with reasons, approval rules.
2. **CI** passes: typecheck, lint (which bans imports that would bypass the paved road), conformance, and tests.
3. **Devin Review** shows its summary and bug-catcher results, following the rules in `REVIEW.md`.
4. **CODEOWNERS:** `access.ts` and `manifest.ts` require a security review.

## 5. Devin tests the PR (sped up)

1. CI is green, so Devin starts testing: it runs the app, refunds as Alex, approves as Priya, and opens the audit log.
2. The recording and the preview link land in the Slack thread and on the PR.

Line: "Priya can watch the recording or try the preview before anything merges."

## 6. Engineer approves and merges (about 15s)

As the code owner, approve the PR on GitHub, then merge it.

## 7. Use it (about 60s)

1. Restart the dev server if needed. Sign in as **alex** (Support Agent).
2. Refunds → search a customer email → open the payment → refund **$80**. Result: "Done". The payment shows the refund, and the ledger entry carries `external_id = re_…`.
3. Refund **$600** on another payment. Result: "Sent for approval".
4. Switch to **priya** → `/approvals` → approve it. The refund executes and the ledger entry appears.
5. As Priya, request a $400 refund. It doesn't appear in her own "Needs my approval" queue. It sits under "My requests", waiting for a different ops lead. The server refuses self-approval with `SELF_APPROVAL` even if someone crafts the request by hand (covered by tests).
6. Switch to **morgan** (Compliance) → `/audit`, filtered to `refunds`. The trail reads `pending_approval → approved → attempted → succeeded`, with the same idempotency key on each row.

Line: "Every vendor call is written to the audit log before it happens. Retries reuse the key, so a refund can never happen twice."

## 8. Change request (sped up, about 30s)

1. In `#tool-requests`, post the message from `devin/requests/refunds-csv-export.md`.
2. Devin classifies it as a change to `refunds`. It opens a PR that touches only `app/tools/refunds/` and adds an audited export action.

## 9. The agents that keep it running (about 30s)

- Devin → Automations: Tool Factory intake, weekly dependency update, CI auto-fix.
- Settings → Review: auto-review is on for the repo.
- Security → the Security Swarm scan and its findings, plus any fix PR.

Close: "Anyone can build. Engineers approve. Devin keeps it running."
