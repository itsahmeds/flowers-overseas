# Runbook — Payment webhook down or failing

| Field | Value |
|---|---|
| Severity | P1 |
| Detect | Alert: webhook error rate >2%/10 min, or no Stripe/Mollie webhook for 24 h while orders exist |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Orders stuck in `placed`/`authorised`; buyers charged with no confirmation; `webhook_inbox` empty or full of failures.

## Immediate actions (first 15 minutes)
1. Check Stripe/Mollie dashboard → Developers → Webhooks for delivery failures and the endpoint status. 2. Check Sentry for the handler error. 3. If our endpoint is down, roll back the last deploy (`rollback.md`).

## Diagnosis
Signature mismatch (rotated secret / wrong env), schema change in a payload (zod failure), DB down, timeout (processing inline instead of via job).

## Fix / recovery
Fix env or code; then **replay** missed events: Stripe dashboard → resend, or `pnpm jobs:replay-webhooks --since <ts>`. Verify every `authorised` order progressed; capture or void manually via admin where needed.

## Communication
If buyers were affected >30 min: proactive email to affected buyers (template T1 resend). Florists: none unless routing was delayed past SLA.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.
