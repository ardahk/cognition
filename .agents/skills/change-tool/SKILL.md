---
name: change-tool
description: Change or fix an existing Toolyard tool from a plain-English request, scoped to that tool's folder; open a PR, then test it end to end with a recording once CI is green.
argument-hint: <the change request>
---

# Change an existing Toolyard tool

Request: $ARGUMENTS

Read `AGENTS.md` first.

## 1. Find the tool and confirm the change

1. Find the tool by matching the request against `app/tools/*/manifest.ts` (`name`, `description`).
2. If the request doesn't clearly point to one tool, ask which tool before doing anything else.
3. Reply in the thread with:
   - the tool you'll change and what will change;
   - any change to permissions, approval rules, or connector scopes;
   - your assumptions.
4. Ask at most 3 questions, and only if a wrong guess would be expensive.

## 2. Implement within the tool's folder

- Change only files under `app/tools/<id>/`. Follow the tool contract and golden rules in `AGENTS.md`.
- If the change needs new permissions or a wider connector scope, update `manifest.ts` and `access.ts`, and justify the change in the PR. Security reviews these files.
- Never edit `platform/` or another tool. If the platform is missing something, stop and explain in the thread.

## 3. Test

- Update or add tests for the changed behavior.
- Keep the existing business-rule tests passing; don't delete them to make the suite pass.

## 4. Check, then open the PR

1. Run `npm run check`; it must pass.
2. Open a PR using the template.
3. Post the PR link in the thread.

## 5. After the PR is open

1. Wait for CI to pass, then address the Devin Review findings.
2. Test end to end with `@skills:test-tool`, focusing on the changed behavior.

## Never

- Merge the PR.
- Weaken a guardrail.
- Widen access beyond what the request needs.
