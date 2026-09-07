# Runbook — Personal data breach

| Field | Value |
|---|---|
| Severity | P1 |
| Detect | Sentry/logs show exposure; processor notifies us; partner reports lost phone with order data |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Recipient/buyer data accessed or exposed.

## Immediate actions (first 15 minutes)
1. Contain: rotate keys, revoke tokens, disable the affected endpoint/partner access. 2. Preserve evidence. 3. Start the 72-hour clock (GDPR Art. 33) — record time of awareness.

## Diagnosis
Scope: which tables/rows, which subjects, which processors.

## Fix / recovery
Notify the Estonian DPA (AKI) within 72 h if risk to individuals; notify affected individuals if high risk (Art. 34); notify UK ICO for UK subjects. Template in `docs/compliance/breach-notice-template.md`.

## Communication
Legal review before external comms.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
