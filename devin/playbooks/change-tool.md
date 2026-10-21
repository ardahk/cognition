# Playbook: change tool

- **Macro:** `!change-tool`
- **Where to configure:** Devin → Settings → Playbooks → Create playbook. Paste the body below.
- **Usage in Slack:** `@Devin !change-tool <which tool and what to change>`

## Body

Change the existing Toolyard tool described in this message, in the `ardahk/cognition` repository.

Follow @skills:change-tool exactly:
1. Identify the tool and confirm the change before writing code.
2. Change only files in that tool's folder.
3. Make sure `npm run check` passes, then open the PR.
4. Once the PR is open and CI is green, test end to end with @skills:test-tool.
5. Never merge.
