# Runbook: the Phase 1 WhatsApp procedure (florists who chose WhatsApp)

| Field | Value |
|---|---|
| Severity | P2 (a late paste never blocks an offer: the florist has the email already) |
| Detect | A founder email with the subject "WhatsApp: new order for {code} · answer by {time}" or "WhatsApp: stop message for {code}" |
| Owner | founder |
| Spec | `specs/016-routing-notifications.md` §5.2 "W", §5.3 "WhatsApp procedure (Phase 1, manual)"; AC-36 |
| Last tested | not yet (fill at the Phase 1 gate) |

## What it is
Some florists answer WhatsApp faster than email. For a florist whose `notification_channel` is
`whatsapp`, every **offer** (V1) and every **stop message** (V4: a timeout or a withdrawal) also
sends the founder an email holding the florist's message, in the florist's language, ready to
paste. Reminders (V2) and photo reminders (V5) are email only; there is no WhatsApp copy for them.
The florist's own email is sent every time, in parallel, so WhatsApp is a nudge, never the only
channel.

## Set up once
1. The company WhatsApp number and the device it runs on (`plan/13` B10): WhatsApp Business app,
   signed in on the founder's phone only.
2. Save each WhatsApp florist as a contact labelled **florist**, under the shop's name and code
   (the code is what the email prints, for example `pl-waw-02`).

## When a W email arrives
1. Open the email. The facts at the top name the shop (name and code), the language and, for an
   offer, the time to paste before (the answer-by time, in the destination's zone).
2. Copy the block (in the plain-text part it sits between `----- copy from here -----` and
   `----- to here -----`) and paste it into that florist's chat. Do not edit it.
3. An offer carries the order's inbox address with **no sign-in link**: the florist opens it and
   signs in with their own email link. Never forward a sign-in email, and never paste a link that
   contains `?t=`.
4. A stop message carries no link and no reason. Paste it as it is.

## Never
- Never accept or decline an offer for a florist, and never tell them what to answer. Ask them to
  open the order.
- Never put a recipient's name, address, phone or card message into WhatsApp. The W email holds
  none; the florist sees them in the order after accepting.
- Never paste into a chat that is not saved as **florist**.

## If something goes wrong
- The florist says the link does not work: ask them to open the order from the latest email, or to
  ask for a new sign-in link on the sign-in page.
- The florist does not answer on WhatsApp: nothing to do; the offer times out on its own and moves
  to the next florist, and they receive the stop message.
- Anything else, or a florist who is upset or confused: phone them.
