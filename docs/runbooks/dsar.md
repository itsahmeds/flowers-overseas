# Runbook — Data subject request (access / erasure / objection)

| Field | Value |
|---|---|
| Severity | P3 |
| Detect | Email to privacy@, account self-service, recipient landing page form |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Request received.

## Immediate actions (first 15 minutes)
Log in `docs/compliance/dsar-log.md` (date, type, subject, channel). Verify identity: buyer via order email link; recipient via order code + phone.

## Diagnosis
Locate all data: `customer`, `recipient`, `order` snapshots, media, Resend logs, CRM, Trustpilot invitation.

## Fix / recovery
Access: export JSON via admin. Erasure: pseudonymise personal fields, delete media, propagate to CRM (unsubscribe + delete) and processors where applicable; keep invoices (legal obligation) flagged `redacted`. Respond within 30 days.

## Communication
Plain-language reply; template in `docs/compliance/dsar-templates.md`.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
