# ADR-0010 — Buy the CRM, build the vendor portal

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/11-platform-roadmap.md |

## Context
Founder uses HubSpot at work. The vendor portal (accept/decline, photo upload, payouts) has no off-the-shelf equivalent.

## Options considered
1. **Build both** — months of work on a commodity CRM.
2. **Buy CRM (HubSpot free tier first; Attio/Brevo compared in 11), build vendor portal; sync via order_events → CRM webhooks** — swapping CRM is a config change.

## Decision
Option 2.

## Consequences and the trade-off accepted
Easier: marketing automation arrives with the CRM. Harder: customer and recipient entities and the events table must exist from Phase 1 so the later sync is additive.
