# ADR-0002 — First live corridor is UK → Poland

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/06-payments-and-ops.md, plan/07-compliance.md, plan/09-roadmap.md |

## Context
Phase 1 must produce one real paid, delivered order with minimal ops surface. Candidates were UK→PL, DE→PL/TR, one buyer market → 3–4 destinations, and domestic-first.

## Options considered
1. **UK → Poland** — largest diaspora corridor in Europe; English UI is already x-default; UK buyers pay by card/Apple Pay/Google Pay/PayPal; easiest processor approval. Adds UK consumer law and a non-EU buyer to an EU-entity model.
2. **DE → PL/TR** — larger AOV, EU-to-EU VAT/OSS simplicity; requires Sofort/Klarna/PayPal and native German copy on day one.
3. **One buyer market → 3–4 destinations** — better relay proof; needs florists in four countries before one order.
4. **Domestic first** — simplest ops; tests none of the cross-border thesis.

## Decision
Option 1: UK → Poland, locales en-GB and pl.

## Consequences and the trade-off accepted
Easier: demand and payment methods are already in place. Harder: three legal regimes (UK consumer law for the buyer, Polish VAT for the supply, Estonian entity) must be handled in 06/07 before the first order, with accountant sign-off as a Phase 1 gate.
