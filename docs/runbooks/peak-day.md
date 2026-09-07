# Runbook — Peak-day operations (Valentine's, Women's Day, Mother's Days)

| Field | Value |
|---|---|
| Severity | P2 |
| Detect | Calendar |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Prepare and run a peak.

## Immediate actions (first 15 minutes)
T-14 d: capacity caps per partner/day confirmed; surcharge dates set; second partner per city; freeze window announced. T-3 d: load test checkout at 10× (k6); alerts tested; partner phone list current. Day: founder on-call; capacity board open; hourly check of `routed` age; photo reminders on.

## Diagnosis
—

## Fix / recovery
T+1 d: refunds/vouchers processed; partner debrief; rating updates.

## Communication
Diaspora groups: proactive 'order by' cutoff post T-3 d.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
