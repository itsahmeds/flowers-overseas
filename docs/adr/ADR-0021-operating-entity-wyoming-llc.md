# ADR-0021 — Operating entity is a Wyoming LLC, and only a US company

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-23 |
| Deciders | Ahmed |
| Supersedes | ADR-0004 |
| Related | plan/06-payments-and-ops.md, plan/07-compliance.md, plan/09-roadmap.md, specs/004-design-system-layout.md (company identity), specs/041-trust-help-legal-pages.md, specs/013-payments-order-state-machine.md, specs/030a-florist-payouts.md |

## Context
ADR-0004 chose an Estonian OÜ via e-Residency. On 2026-10-23 the founder reported "our company is registered now" and supplied the Wyoming Secretary of State Articles of Organization and Certificate of Organization: **Flowers Overseas LLC**, Original ID **2026-002113883**, filed 23 October 2026, registered agent and principal office Register Agents Inc, 30 N Gould St Ste R, Sheridan, WY 82801, USA; organizer Tahoor Hameed. Asked whether an Estonian company would still follow, the founder answered, verbatim: "bro we will only register in us".

The plan's VAT, payment-provider, imprint and GDPR choices assumed an EU entity, so they change with this decision.

## Options considered
1. **Wyoming LLC only** (what exists): registered, low cost, fully remote · not an EU or UK entity, so no EU One-Stop-Shop as an EU business and no UK establishment; EU and UK VAT duties for a non-established seller to be confirmed by the accountant; GDPR Art. 27 EU representative and UK GDPR Art. 27 representative expected; Stripe through a US account (EIN expected); Mollie onboarding expected to be unavailable to a US entity [agent-inferred].
2. **Wyoming LLC plus an Estonian OÜ later**: restores EU tooling · a second entity, cost and accounts. Rejected by the founder.
3. **Estonian OÜ only (ADR-0004)**: superseded.

## Decision
Option 1: the operating entity and seller of record is Flowers Overseas LLC (Wyoming), and no EU company is planned.

## Consequences and the trade-off accepted
Easier: the company exists now; Stripe and Wise applications can start in the company's name.
Harder, each an open item before the first real paid order:
- **VAT (accountant):** the supply model (plan/06), whether the LLC must register for VAT in Poland, Germany and other destinations and in the UK, and what invoices must show. No real charge until this is answered in `docs/compliance/vat-signoff.md`.
- **GDPR (lawyer):** appoint an EU Art. 27 representative and a UK Art. 27 representative; update the privacy notice and RoPA controller identity.
- **Payments:** a Stripe US account (needs the EIN); confirm whether Mollie (spec 014) can onboard a US entity, else choose another fallback.
- **Imprint and footer:** `src/config/company.ts` requires a `vatId` when `registered: true`; a US LLC has none, so that rule becomes "VAT id where issued" by a spec amendment (spec 004/041), never an invented number (plan/07 §6).
- **Florist statements and invoices:** the legal identity slots (spec 030a, spec 018) take the LLC's name, registry and address.
The trade-off accepted, in the founder's words: "bro we will only register in us".

## Rules
- Accepted ADRs are never edited. The only legal touch is flipping Status to `superseded-by`.
