---
name: test-tool
description: End-to-end test a Toolyard tool after its PR is open and CI is green. Run the app, walk the main flow as the right personas (including the approval path), record a video, and post it to the thread and the PR.
---

# Test a Toolyard tool end to end

Run this only after the PR is open and CI is green.

## Setup

1. Run `cp -n .env.example .env && docker compose up -d db && npm install && npm run setup`. This resets and seeds the dev database.
2. Run `npm run dev` and wait until http://localhost:3000 responds.

## Plan (send this before recording)

- Pick the most important flow from the request and its approval path, if it has one.
- Name the personas you'll use: a requester, plus a different approver if needed. See the persona table in `AGENTS.md`.
- Keep the plan short and concrete, e.g. "sign in as alex, open payment X, refund $80".

## Record

1. Sign in at `/login` as the requester persona and perform the main flow.
2. If an action needs approval:
   1. Confirm it shows as pending.
   2. Switch persona (persona switcher, top right) to an approver.
   3. Approve it in `/approvals`.
   4. Confirm the result in the tool.
3. If the request involves approvals, show that self-approval is blocked.
4. Show that a persona without access can't see the tool or run the action.
5. Open `/audit` and show the trail for what you just did.

## Report

1. Post the recording and the preview link in the request thread and as a PR comment, with a one-line result for each step.
2. If a step fails, fix it on the PR branch, re-run `npm run check`, push, and test again.
