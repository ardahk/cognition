# Request: Refunds dashboard (recorded)

- **How to send:** post a plain message in the Slack channel `#tool-requests`. The Tool Factory automation picks it up.
- **Posted as:** the support operations lead, played by Priya in the demo.

---

Hey team, support ops here. We need a refunds dashboard for the support team.

Agents should be able to find a payment by payment ID, customer email, or card last 4. Opening a payment should show its details, any refunds already issued, and the matching ledger entries. From there, an agent can issue a full or partial refund with a reason code and a short note.

Refunds over $250 need approval from an ops lead, and nobody can approve their own refund. Refunds have to be safe to retry: a double click or a timeout must never refund the customer twice or post to the ledger twice. Every refund needs its ledger entries.

At the top, show a quick summary: refunds issued today, refunds waiting for approval, and the total refunded today by reason. Compliance should be able to view everything but change nothing.
