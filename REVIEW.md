# Review rules for Toolyard

You are reviewing changes to Fernpay's internal-tools platform. These tools move money, expose personal data, and change production configuration. Review for correctness and security first and style last. `AGENTS.md` describes the architecture and the tool contract.

## Critical: block the PR if a change

1. **Writes data or calls a vendor outside `defineAction`.** Examples: a plain exported async function in a `'use server'` file, a route handler inside `app/tools/`, or a vendor call from client code.
2. **Reads tool data outside `moduleContext()`**, or checks a weaker permission than the operation needs.
3. **Imports forbidden modules into `app/tools/**`.** That means any platform module other than `@/platform/define`, `@/platform/module`, or `@/platform/ui`; or `postgres`, `@/mock-vendors`, or another tool's folder. Using `fetch` or `process.env` in a tool counts too.
4. **Moves money or changes production behavior without the approval rule the request asked for**, or lets anyone approve or review their own request.
5. **Calls a connector inside a DB transaction**, or makes a state-changing connector call without `ctx.idempotencyKey`.
6. **Posts to the ledger with an `externalId` other than the source object's id** (for refunds, the refund id), or does anything else that lets a retry post twice.
7. **Mishandles PII:** sends unmasked PII to the client, logs it, passes it to `ctx.record` (which writes to the append-only audit log), or reveals it without an audited action that requires a reason.
8. **Exposes secrets or vendor keys to the client**, or puts anything sensitive in a `NEXT_PUBLIC_` variable.
9. **Edits shared code in a single-tool PR.** A PR meant to build or change one tool must not touch `platform/`, `mock-vendors/`, `templates/`, `.github/`, `.agents/`, `AGENTS.md`, or `REVIEW.md`.
10. **Weakens a guardrail to get CI passing:** lint rules, conformance checks, tests, or the audit trigger.

## Warning: flag it if

- `access.ts` grants more than the request needs, or the PR description doesn't justify a grant.
- `manifest.risk` or the connector scopes are wider than the tool uses.
- Tests don't cover the request's business rules: who can do what, approval thresholds, and exactly-once behavior on retry for money movement. Tests that only re-prove platform guarantees, such as self-approval blocking, don't count.
- Money is handled as floats or formatted by hand instead of with `<Money>` and the `money` helper.
- The change adds new dependencies, speculative abstractions, dead code, or a copy of something the platform already provides.

## Intentional, not bugs

- The mock vendors (`mock-vendors/`, `app/api/mock/`) and mock sign-in (`AUTH_MODE=mock`) exist for local development and demos.
- Schema changes go through `drizzle-kit push`, not migrations. That is deliberate in this prototype.
- An `attempted` audit row with no outcome row means a request crashed in the middle of a vendor call. It shows up as "unresolved" on `/audit`, and retrying with the same idempotency key is safe.
