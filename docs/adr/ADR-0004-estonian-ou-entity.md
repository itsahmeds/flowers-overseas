# ADR-0004 — Operating entity is an Estonian OÜ via e-Residency

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/06-payments-and-ops.md, plan/09-roadmap.md |

## Context
Founder is Pakistan-resident with no EEA-resident co-director. A cross-border gifting merchant needs an entity that processors accept, that can hold EUR/GBP accounts, and that keeps EU VAT (OSS) available.

## Options considered
1. **Estonian OÜ (e-Residency)** — fully remote; EU entity; Stripe/Mollie/Adyen eligible; OSS available; banking via Wise/Revolut Business (domestic Estonian banks are hard without local ties); ~€265 state fee + provider fees.
2. **UK Ltd** — fastest and cheapest; smooth Stripe UK; not an EU entity (no OSS; per-country EU VAT questions).
3. **Dutch BV** — best for iDEAL/Mollie; notary, Dutch bank, €2–5k, substance expectations.
4. **Irish Ltd** — needs EEA-resident director or ~€25k bond.
5. **US LLC via Stripe Atlas** — poor for EU local methods and OSS.

## Decision
Option 1: Estonian OÜ. Accepted recommended default. e-Residency application is a week-1 roadmap task.

## Consequences and the trade-off accepted
Easier: EU-native payments and VAT tooling. Harder: e-Residency card issuance (3–8 weeks) gates company formation and processor onboarding, so MVP-with-real-payments is pinned to mid-Jan 2027 committed, Dec 2026 stretch. Banking is fintech-only at first. Tax residency of a Pakistan-managed Estonian company needs accountant advice.
