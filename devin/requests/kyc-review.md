# Request: KYC review queue

- **Path:** Slack `#tool-requests`, as a plain message. No `@Devin` needed; the Tool Factory automation picks it up.
- **Posted as:** compliance lead.

---

Hi! Compliance here. We need a KYC review queue to replace our Power App.

Analysts should see every KYC case waiting for review, oldest first. For each case, show the applicant's name, country, risk score, and how long until (or since) the 24-hour SLA. Add filters for status, risk level, and "assigned to me".

Opening a case should show the applicant, the document and selfie check results, the device signals, and any watchlist or PEP hits. Personal data (date of birth, SSN last 4, address, document number, email, phone) stays masked by default. Compliance officers can reveal one field at a time, but they have to give a reason, and every reveal must be logged.

Analysts can assign a case to themselves, add notes, approve, decline (with a reason code), request more info, or escalate. If the risk score is 70 or higher, or there's any watchlist hit, approving needs sign-off from a compliance officer. Nobody can sign off on their own decision. Support agents shouldn't see this tool at all.
