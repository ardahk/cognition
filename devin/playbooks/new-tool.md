# Playbook: new tool

- **Macro:** `!new-tool`
- **Where it's configured:** Devin → Settings → Playbooks → Create playbook. Paste the body below.
- **Usage in Slack:** `@Devin !new-tool <plain-English request>`

## Body

Build the Toolyard internal tool described in this message, in the `ardahk/cognition` repository.

Follow @skills:new-tool exactly:
1. Reply with your plan and assumptions before you write any code.
2. Work only inside `app/tools/<id>/`. Never edit `platform/` or any shared file.
3. Run `npm run check`. It must pass before you open the PR.
4. After the PR is open and CI is green, test end to end with @skills:test-tool. Post the recording in the thread and on the PR.
5. Never merge.
