# Runbook — Florist declines or goes silent on a peak day

| Field | Value |
|---|---|
| Severity | P1 |
| Detect | Alert: assignment cascade exhausted (`no_partner_available`) or SLA timeouts spike |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Orders for Valentine's/Women's Day sitting in `routed`; capacity dashboard red for a city.

## Immediate actions (first 15 minutes)
1. Open admin capacity board for the city/date. 2. Call the partners on the phone list (`docs/ops/partner-contacts.md`, private). 3. Manually re-route accepted capacity; for the rest, pull the date forward/back with buyer consent.

## Diagnosis
Capacity cap set too high; partner blackout not recorded; WhatsApp not reaching them (number changed).

## Fix / recovery
Re-route via admin; if impossible: cancel + auto-refund + apology voucher (T11 + voucher). Update capacity caps for the remaining peak days.

## Communication
Buyers: WhatsApp/SMS + email with options (T12). Founder posts status in the diaspora group only if widespread.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
