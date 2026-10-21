# Toolyard: agent guide

Toolyard is Fernpay's internal-tools platform. It is one Next.js host app, and each tool is a folder under `app/tools/<id>/` built on a thin "paved road" of platform primitives. People request tools in Slack, Devin builds them, and engineers approve the PRs.

## Commands

| Task | Command |
|---|---|
| First-time setup | `cp -n .env.example .env && docker compose up -d db && npm install && npm run setup` |
| Dev server | `npm run dev` → http://localhost:3000; sign in at `/login` as a persona |
| All checks (run before every PR) | `npm run check` (registry + typecheck + lint + tests) |
| Production build | `npm run build` |
| Reset and reseed the dev DB | `npm run db:reset` |
| Scaffold a new tool | `npm run tool:new -- <id> "<Name>"` |

Tests run against a separate database, `toolyard_test`, which the test setup resets automatically.

## Layout

- `app/tools/<id>/`: one tool. Everything for a tool lives in its folder.
- `platform/`: the paved road (auth, actions, approvals, audit, connectors, UI kit). Owned by the platform team.
- `mock-vendors/` + `app/api/mock/`: simulated vendor APIs (payments, KYC, ledger, flags). Treat them as external services.
- `templates/tool/`: the scaffold used by `tool:new`.
- `devin/`: Devin playbooks, automation specs, and example requests.

## Tool contract

| File | Purpose |
|---|---|
| `manifest.ts` | `defineModule({ id, name, description, owner, risk, connectors, permissions, viewPermission, nav })` from `@/platform/define` |
| `access.ts` | `defineAccess(manifest, { <role>: [<permissions>] })`. Security reviews every change (CODEOWNERS). Grant least privilege. |
| `page.tsx` and nested routes | Server components. Read data only via `const ctx = await moduleContext(manifest)`. |
| `actions.ts` | `'use server'`. Every export is `defineAction(manifest, {...})` from `@/platform/module`. |
| `*.test.ts` | Tests for the tool's business rules, kept next to the code. |
| optional | `schema.ts` (table names prefixed with the tool id using underscores, e.g. `kyc_review_`), `seed.ts`, `error.tsx`, components |

- Permissions are named `<id>.<verb>`, e.g. `refunds.approve`.
- Roles: `support_agent`, `ops_lead`, `kyc_analyst`, `compliance_officer`, `engineer`, `oncall`, `eng_lead`, `platform_admin`.
- `connectors` declares connector scopes, e.g. `{ payments: ['read', 'refund'], ledger: ['read', 'post'] }`. A tool can only call methods in the scopes it declares.
- `risk` must equal the highest tier among the declared scopes (CI enforces this):

| Connector | Scope → tier |
|---|---|
| payments | `read` sensitive, `refund` critical |
| kyc | `read` sensitive, `pii` sensitive, `decide` critical |
| ledger | `read` low, `post` critical |
| flags | `read` low, `write` critical |

## Golden rules (CI and review enforce these)

1. Reads go through `moduleContext()`. Writes go through `defineAction()`. From the platform, a tool imports only `@/platform/define`, `@/platform/module`, and `@/platform/ui`, plus `@/components/ui/*` for UI. Inside a tool, use relative imports. A tool must never import another tool's folder, and must never use `fetch` or `process.env`.
2. Server Actions are public POST endpoints. `defineAction` is the only sanctioned way to write one: it authenticates, authorizes, validates, and audits. Tools have no route handlers.
3. If a tool needs something the platform doesn't provide, stop and explain it in the PR or thread. Do not edit `platform/`.
4. Sensitive or irreversible actions get an approval rule (maker-checker). The platform blocks self-approval.
5. Never call a connector inside a DB transaction, because vendor calls can't be rolled back. `ctx.db.transaction` is only for the tool's own tables.
6. Every state-changing connector call passes `ctx.idempotencyKey`. For the ledger, `externalId` is the idempotency key, and it must be the source object's id.
7. PII stays masked. The KYC connector returns masked values. Raw values come only from an audited action that requires a reason.
8. Money is always integer minor units (cents). Display it with `<Money>`. Parse dollar input with the `money` zod helper.

## Actions

```ts
'use server';
import { z } from 'zod';
import { defineAction } from '@/platform/module';
import manifest from './manifest';

export const setRollout = defineAction(manifest, {
  name: 'flag.set-rollout',                       // audited as `<tool id>.flag.set-rollout`
  permission: 'flags.edit',
  input: z.object({ key: z.string(), env: z.enum(['development', 'staging', 'production']), rollout: z.coerce.number().int().min(0).max(100) }),
  target: (i) => ({ type: 'flag', id: i.key }),
  approval: (i) => (i.env === 'production' ? { permission: 'flags.approve', reason: 'Production change' } : null),
  handler: async ({ input, ctx }) =>
    ctx.connectors.flags.setEnvironment(input.key, input.env, {
      rolloutPercentage: input.rollout,
      actor: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    }),
});
```

The platform runs this lifecycle; do not reimplement any of it:
1. Check the session, then the permission. Denials are audited.
2. Validate the input with zod.
3. Resolve the idempotency key.
4. Apply the approval rule. If approval is needed, a request is created and the handler is not called.
5. Commit a write-ahead `attempted` audit row.
6. Run the handler.
7. Append a `succeeded` or `failed` audit row.

Details:
- `ctx.record({ ... })` is the only way to put data in the audit log. Record the ids you need for reconciliation, such as a refund id, before a later step can fail. The handler's return value goes back to the caller and is never persisted, so a reveal action can return a raw value without it reaching the audit log. Never record PII or secrets.
- Approval modes:
  - `pre` (default): the action waits for an approver. On approval, the platform runs the handler with the stored input and the original idempotency key.
  - `post-hoc` (break-glass): the action runs immediately and opens a review item for someone else.
- Action results:
  - `{ ok: true, status: 'succeeded', data }`
  - `{ ok: true, status: 'pending_approval', approvalId }`
  - `{ ok: false, error, message }`
- Inputs must be JSON-serializable. Use `z.coerce` for numbers and booleans that come from forms.

## Money-movement recipe (refunds)

```ts
const refund = await ctx.connectors.payments.createRefund({
  paymentId: input.paymentId, amount: input.amount, reason: input.reason, idempotencyKey: ctx.idempotencyKey,
});
ctx.record({ refundId: refund.id });
const { transaction } = await ctx.connectors.ledger.postTransaction({
  externalId: refund.id,
  description: `Refund ${refund.id} for ${input.paymentId}`,
  entries: [
    { account: 'merchant_payables', direction: 'debit', amount: refund.amount },
    { account: 'processor_receivable', direction: 'credit', amount: refund.amount },
  ],
});
ctx.record({ ledgerTransactionId: transaction.id });
```

If the ledger call fails after the refund succeeded, the attempt is recorded as `failed` along with the refund id. A retry with the same idempotency key gets the same refund back, and the ledger dedupes on the refund id. Money can never move or post twice.

## Domain notes

- **Ledger accounts:** `processor_receivable` (debit-normal), `merchant_payables` (credit), `fee_revenue` (credit), `cash_operating` (debit).
  - A payment posts Dr `processor_receivable` / Cr `merchant_payables` (net of fee) + Cr `fee_revenue`.
  - A refund posts Dr `merchant_payables` / Cr `processor_receivable`.
- **`externalId` / `external_id`** is the source object id: `pay_…`, `re_…`, or `stl_YYYYMMDD` for settlements.
- **Vendor responses** keep the vendor's native snake_case shapes. Method arguments are camelCase.
- **KYC:**
  - `risk_level` is high at a score of 70 or more.
  - The SLA is 24h (`sla_due_at`).
  - Masked PII fields are `dob`, `ssn_last4`, `document_number`, `address_line1`, `postal_code`, `email`, `phone`. Use `ctx.connectors.kyc.getPii(caseId, field)` (the `pii` scope) only inside a reveal action.
- **Flags:** environments are `development`, `staging`, `production`.
- **History:** `ctx.auditTrail({ type, id })` returns this tool's audit history for a target, e.g. a flag's change history. `ctx.pendingApprovals(target?)` lists this tool's pending approval requests.

## UI kit

| Import | Contents |
|---|---|
| `@/platform/ui` | `PageHeader`, `DataTable`, `SearchForm`, `CursorPager`, `Money`, `StatusBadge`, `RelativeTime`, `Masked`, `ActionForm`, `ActionButton` |
| `@/components/ui` | shadcn components (button, input, select, table, badge, card, tabs, textarea, …) |

- Trigger actions with `ActionForm` (forms) or `ActionButton` (one click). Both mint the idempotency key and keep it across retries until a success. They also show toasts and refresh the page.
- `Masked` renders a masked value, plus an optional reveal button that asks for a reason and calls your reveal action. The reveal action takes `{ ...args, reason }` and returns `{ value: string | null }`.

## Testing

- Unit tests sit next to the code and run with Vitest against the test database.
- Helpers in `@/tests/helpers`:
  - `signInAs('<persona>')` and `signOut()`.
  - `decideAs('<persona>', approvalId, 'approve' | 'reject')` decides an approval request as that persona, who stays signed in. Use it to test approve → execute, blocked self-approval (`SELF_APPROVAL`), and post-hoc reviews.
  - `useInProcessVendors()` routes connector calls to the mock vendors in-process.
- `platform/money-movement.test.ts` shows how to prove exactly-once behavior on retry.
- Every tool needs real tests for its business rules: permission boundaries, approval thresholds, and blocked self-approval.

Personas (dev sign-in at `/login`):

| Persona | Roles |
|---|---|
| `alex`, Alex Rivera | support_agent |
| `priya`, Priya Shah | ops_lead |
| `sam`, Sam Lee | kyc_analyst |
| `morgan`, Morgan Diaz | compliance_officer |
| `jordan`, Jordan Park | engineer, oncall |
| `taylor`, Taylor Wong | engineer, eng_lead, platform_admin |

## Code style

- Keep it lean. Build what the request needs and nothing speculative.
- Use small files, infer types from zod and drizzle, and use shadcn + Tailwind for UI.
- Don't add a dependency without stating the reason in the PR. Avoid comment noise.

## Pull requests

- Fill in `.github/pull_request_template.md`. Never merge.
- Devin follows `@skills:new-tool` or `@skills:change-tool`. End-to-end testing (`@skills:test-tool`) happens after the PR is open and CI is green.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
