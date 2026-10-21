## Request
<!-- Link to the Slack thread or ticket -->

## What this does
<!-- 2-3 bullets in plain language -->

## Risk and access
- Tool folder: `app/tools/<id>/`
- Risk tier: low / sensitive / critical
- Connector scopes:
- Role grants (`access.ts`), with the reason each one is needed:
- Approval rules (who approves what, and above which threshold):

## Test evidence
- [ ] `npm run check` passes
- [ ] Business-rule tests (list them):
- [ ] End-to-end recording, posted as a PR comment after CI is green

## Paved-road checklist
- [ ] Changes are confined to `app/tools/<id>/` (or this is a platform PR, reviewed by the platform team)
- [ ] Reads go through `moduleContext`; writes go through `defineAction`
- [ ] Every state-changing connector call uses `ctx.idempotencyKey`, and the ledger `externalId` is the source object's id
- [ ] No connector calls inside DB transactions
- [ ] PII stays masked; no secrets on the client
- [ ] No new dependencies, or each one is justified here
