# Request: Feature flag admin

- **How it's sent:** in Slack, using the `!new-tool` macro (the engineer path).
- **Posted as:** an engineer.

---

@Devin !new-tool Feature flag admin panel for engineering.

List every flag from our flag service. For each flag, show its state in development, staging, and production (on/off and rollout %), plus owner, tags, and last change. Make the list searchable by key or tag.

Engineers can change development and staging right away. Production changes need approval from an eng lead, and the approver can't be the person who asked.

On-call engineers get a kill switch that turns a flag off in production immediately, without waiting. An eng lead has to review it afterwards.

Each flag needs a change history.
