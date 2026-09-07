# Runbook — Vendor SLA breach (single order)

| Field | Value |
|---|---|
| Severity | P3 |
| Detect | Alert: assignment timeout; photo missing >2 h after delivery |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
One order stuck at a partner.

## Immediate actions (first 15 minutes)
Message partner on WhatsApp; if no answer in 15 min, call; re-offer to next partner via admin.

## Diagnosis
Partner busy/closed; wrong contact; magic link expired.

## Fix / recovery
Re-route or accept late; record in partner rating; if delivery missed, refund policy per guarantee page.

## Communication
Buyer updated via tracking page + T4/T12 as appropriate.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
