# Basket reminder emails (spec 034)

One consented email to a buyer who ticked the box at checkout step 2 and left a `live` basket
for 2 to 20 hours. Code: `src/modules/checkout/reminders/`, jobs `basket-reminders.scan` (every
10 minutes from the tick) and `basket-reminders.send`, admin page `/admin/basket-reminders`.

## Before turning it on in production (founder checklist)

1. Spec 013 `live` mode exists (only `live` drafts are ever reminded).
2. Resend marketing domain verified with SPF, DKIM and DMARC; open and click tracking **off**
   (spec 034 §13 Q7).
3. Railway env: `CONTACT_HMAC_SECRET` (base64, at least 32 bytes: `openssl rand -base64 32`)
   and `MARKETING_MAIL_FROM` (for example `Flowers Overseas <hello@mail.flowersoverseas.com>`).
   Without both, the box is not shown and every send skips `flag_off`.
4. Resend DPA filed in `docs/compliance/`.
5. Spec 041's privacy paragraph "Basket reminder" is live.
6. Founder approves Appendix A (`record-approval-449.py`); per locale, the native reviewer marks
   the box and email keys reviewed. The box shows in a locale only when its keys are reviewed.
7. The new ADR (Resend for this one marketing email until the CRM, §13 Q8) is accepted.
8. Turn on `marketing.basket_reminder` in `/admin/flags`.

## Automatic pause

After at least 50 sends in 7 days, a complaint rate of 0.3% or a hard-bounce rate of 4% turns the
flag off, recorded in the audit log as `system:basket_reminders.auto_pause`, and raises an alert.
The admin page shows the date. Find the cause (a list problem, a domain problem, wording), fix it,
then turn the flag back on in `/admin/flags`.

## A buyer asks to stop

The email's footer link and the one-click `List-Unsubscribe` header both suppress the address at
once. By hand: the address's keyed hash goes into `email_suppression` with reason `unsubscribed`
(`unsubscribeBasketReminders`); never store the address itself.

## Rotating `CONTACT_HMAC_SECRET`

A new secret makes old hashes unmatchable: suppressions and consent proofs stop matching. Do not
rotate unless the secret leaked; if it did, record it in `docs/runbooks/data-breach.md`'s log.
