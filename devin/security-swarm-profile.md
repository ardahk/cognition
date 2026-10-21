# Security Swarm profile: Toolyard internal tools

Set this up in Devin → Security → Profiles → Create manually. It applies to the repository `ardahk/cognition`.

## Name
Toolyard: authorization, approvals, and money movement

## Description
Find vulnerabilities in Toolyard, Fernpay's internal-tools platform (Next.js Server Actions + Postgres). Focus on authorization, approval bypass, PII exposure, idempotency, and audit integrity.

## Threat model

**Attackers:**
1. An authenticated employee in a low-privilege role (for example `support_agent`) trying to act beyond their permissions.
2. Someone using a compromised employee account.
3. Anyone who can send HTTP requests to the app. Server Actions are public POST endpoints.

**Assets:**
- Money movement: refunds and ledger postings.
- KYC personal data.
- Production feature-flag state.
- Integrity of the audit log and approval records.
- Vendor API keys.

**Trust boundaries:**
- Browser → Server Actions (`defineAction`, `platform/approvals/actions.ts`, `platform/auth/actions.ts`).
- Server → vendor APIs (connectors with bearer keys).
- Maker-checker approvals.
- The HMAC-signed session cookie.

**Entry points:**
- Every export of `app/tools/*/actions.ts`.
- `platform/approvals/actions.ts` and `platform/auth/actions.ts`.
- Pages under `app/`.
- `app/api/mock/*`.

**Out of scope:**
- The internals of `mock-vendors/`, which simulate third parties.
- Mock sign-in being available when `AUTH_MODE=mock` during local development.
- `scripts/` and test files.

**Prioritize:**
- Authorization bypass.
- Self-approval, or replaying an approval.
- An approved action executing twice.
- Duplicate refunds or ledger postings.
- Unmasked PII reaching the client or the logs.
- Audit rows that can be skipped, forged, or modified.
- Session forgery.
- SSRF through connector inputs.

## Investigation guidance
- Trace each Server Action from its export through `defineAction` to the connector calls. Along the way the action passes the session check, the permission check, zod validation, the approval rule, the write-ahead audit row, and then the handler.
- Confirm that the permission checked matches the operation.
- Confirm that crafted inputs can't skip an approval rule, for example by splitting amounts or changing the target, and that a stored approval input can't be altered before it executes.
- Check that idempotency keys are honored end to end and that the ledger `externalId` equals the source object's id.
- Check that every page reads data through `moduleContext`, and that masked PII is only unmasked inside the audited reveal action.
- Don't report a theoretical issue when an existing control blocks the path. Cite files and lines.

## Triage guidance

| Severity | What qualifies |
|---|---|
| Critical | Anyone can move money, approve their own request, execute an approval twice, or forge a session. |
| High | PII can be accessed across roles; audit rows can be skipped or modified; refunds or postings can duplicate. |
| Medium | Information disclosure without PII; missing limits on sensitive actions. |
| Low | Defense-in-depth suggestions. |

Group findings that share a root cause.

## Sandbox validation
1. Run `cp -n .env.example .env && docker compose up -d db && npm install && npm run setup && npm run dev`.
2. Sign in at `/login` as `alex` (`support_agent`, low privilege) and as `priya` (`ops_lead`, approver).
3. Demonstrate a finding in one of two ways: perform the forbidden operation as the low-privilege persona, or replay a captured Server Action request.
