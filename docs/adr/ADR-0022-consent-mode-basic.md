# ADR-0022: Consent Mode basic

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-11-08 |
| Deciders | founder (delegated to the orchestrator under the blanket approval of 2026-10-31) |
| Supersedes | the advanced-mode choice in plan/04 §11 and plan/09 Phase 0 AC 7 (plan text, not an ADR) |
| Related | specs/023-analytics-ga4.md §5.0, §13 Q1 and Q2; specs/004 A-founder-2026-10-19d; plan/07 §5; ADR-0006 |

## Context
Spec 023 builds GA4 (TASK-491 server side, TASK-492 client). The plan chose Consent Mode advanced:
the tag loads with denied defaults and sends cookieless pings before a decision. Spec 004
A-founder-2026-10-19d already records that those pings fall inside ePrivacy Art. 5(3) (EDPB
Guidelines 2/2023 v2.0 cover pixel and URL tracking, not only cookies). The UK's new PECR analytics
exception excludes attribution and advertising measurement, so GA4 ecommerce is not a clean fit there
either. One rule for every market is simpler for a solo operator.

## Options considered
1. **Advanced mode** (the plan): behavioural modelling of refusing visitors; a Google request on every
   page view before consent, which our own spec 004 reading says needs consent.
2. **Basic mode**: no request to Google before an analytics grant; GA4 loses modelling of refusing
   visitors; Ads falls back to the general conversion model.
3. **Basic mode plus server-side `purchase` for every buyer with random ids** `[agent-inferred]`:
   fuller revenue in GA4, but data about a buyer who said no still goes to Google.

## Decision
Option 2, the spec's recommended default (§13 Q1 yes, Q2 no): no request to Google before an analytics
grant, in every market; the server sends `purchase` and `refund` by Measurement Protocol only for
buyers who had granted analytics when they placed the order.

## Consequences and the trade-off accepted
- GA4 sees only consenting visitors and buyers; order truth stays in our database (spec 039 reports it).
- No consent-state modelling; marketing numbers in GA4 undercount, and that is accepted.
- The banner, `consent_log` and footer withdrawal stay spec 004's; spec 004 L94 and AC-21 (tag loads
  before a decision) are amended per spec 023 §12.
- `CONSENT_POLICY_VERSION` is bumped in the activation PR so earlier decisions are asked again.
- Activation (setting the measurement id) waits for Google's data processing terms to be accepted by
  the registered company and filed in `docs/compliance/`, and for the lawyer's notice wording.
