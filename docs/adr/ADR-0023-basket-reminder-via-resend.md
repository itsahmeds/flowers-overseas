# ADR-0023: The one consented basket reminder goes through Resend until the CRM exists

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-11-09 |
| Deciders | founder (delegated to the orchestrator under the blanket approval of 2026-10-31) |
| Supersedes | none; narrows ADR-0013 for one message |
| Related | ADR-0013; specs/034-abandoned-checkout.md §13 Q8; spec 032 (CRM, Phase 3) |

## Context
ADR-0013 puts transactional email on Resend and marketing automation in the CRM, which arrives with
spec 032 in Phase 3. Spec 034 (merged in PR 523, flag `marketing.basket_reminder` off) sends one
reminder email to a buyer who ticked an unticked consent box at checkout. That email is marketing by
its legal basis, so ADR-0013 alone would hold it until the CRM exists.

## Options considered
1. **Wait for the CRM**: no reminder until Phase 3; a second messaging system before revenue.
2. **Send this one email through Resend from the app**, on its own marketing subdomain and stream,
   until spec 032 lands, then move it to the CRM.

## Decision
Option 2, spec 034's recommended default: this single consented reminder is sent through Resend from
the app on a separate marketing subdomain and the `marketing` stream; no other marketing email may use
this exception, and the reminder moves to the CRM when spec 032 lands.

## Consequences and the trade-off accepted
- The reminder can ship before the CRM; the boundary of ADR-0013 holds for everything else.
- Its own subdomain (SPF, DKIM, DMARC; open and click tracking off) keeps transactional reputation
  apart from marketing reputation.
- One-click unsubscribe (RFC 8058) and the suppression list live in our database until the move; the
  move to the CRM must carry the suppression list across.
- Turning it on in production still needs the runbook checklist of spec 034 §12: Railway keys
  `CONTACT_HMAC_SECRET` and `MARKETING_MAIL_FROM`, the verified marketing domain, the Resend DPA
  filed, spec 041's privacy paragraph live, and the lawyer's read before `de`.
