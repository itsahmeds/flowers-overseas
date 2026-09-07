# ADR-0005 — Stripe primary processor, Mollie fallback

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/06-payments-and-ops.md, plan/04-ux-conversion-spec.md |

## Context
Cross-border, card-not-present, recipient ≠ cardholder, perishable goods: a moderately high-risk profile. No prior processor history. Europe needs local payment methods beyond cards.

## Options considered
1. **Stripe primary + Mollie fallback** — Stripe: multi-currency presentment, 3DS2, Radar, Apple/Google Pay, PayPal, Klarna, iDEAL, Bancontact, P24/BLIK, Link. Mollie: EU-native, strong local-method coverage, tolerant onboarding, no monthly fee.
2. **Mollie primary** — broadest EU local methods; weaker fraud tooling and multi-currency presentment than Stripe.
3. **Adyen** — best-in-class but volume expectations far above ours.
4. **PayPal only** — high acceptance but poor checkout UX and no cards-first flow.

## Decision
Option 1: Stripe primary, Mollie as fallback and as the path to any local method Stripe lacks in a market.

## Consequences and the trade-off accepted
Easier: one integration for cards, wallets and most local methods; liability shift via 3DS2. Harder: two processor abstractions must exist behind one payment interface from day one so a Stripe rejection or reserve does not stall launch; apply to both in week 1.
