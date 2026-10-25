# TASK-416: Account emails and sign-in methods: "Your emails" on `account/details` (the sign-in address, up to three added ones, Remove), `addEmail` and `buyer_email_claim` with T19, the confirm page (`GET` consumes nothing, `POST` single use for one hour, `taken`), the orders of every linked customer in the list and detail, the relay card on the account home, "How you sign in" with Disconnect, their keys

Row: `TASKS.md` → TASK-416. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-416`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth, personal data, order ownership. Awkward cases at least: a token replayed or used after an hour, a `POST` from another user's session, an address already linked to another user, a redacted customer, the fourth address, special characters and an RTL address in the masked display.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **AC-68 (T-68).** `addEmail({ email })` (Zod, session re-checked) refuses the sign-in address, an address already added, a fourth one and one under `invalid`, each with its visible message and no claim or mail; otherwise one `buyer_email_claim` and one T19 whose link `/{locale}/account/emails/confirm?t=` carries only the token, and the form shows `account.emails.sent`. `GET` consumes nothing: with the requester's session it renders "Add this email to your account?" with both addresses masked and one button; with no session or another user's, `account.emails.confirmSignIn` and a link to `/{locale}/account`, the token still valid. `POST` (that session only, single use, one hour, one transaction): links an unlinked non-redacted guest customer, or creates one with only `email_normalised` and `user_id`, or renders `account.emails.taken` and changes nothing. "Remove" sets that customer's `user_id` to null and nothing else.
- **AC-69 (T-69), C.4 as amended by S.4.** One primary `customer` per user (its email equals `users.email`) and at most three added. The order list and detail read every live order of every non-redacted customer whose `user_id` is the session's user, newest first; under the `customer` role another user reads none. Details, saved recipients, reminders and `buyerCheckoutProfile` stay on the primary. The relay card (`account.emails.relayCard`) renders at the top of the account home only for a relay account (`is_private_email`, or `privaterelay.appleid.com`) with no live order.
- **Explicit scope with no AC id (S.3 item 9, S.10).** "How you sign in" on `account/details`: the email link, each linked provider with its date, and a "Disconnect" submit per provider that deletes that `accounts` row; the email link always remains. Logs `account.email.claim_sent`, `added`, `refused`, `removed` and `account.provider.disconnected`, with no email in any line.
- **T19.** The add-email template under `emails/` with `emails.account.addEmail.subject`, `.body`, `.button`, reusing `emails.account.signIn.ignore`, sent through the core's mailer and limits.
- **AC-74, key set of this PR.** The `account.emails.*`, `account.signInMethods.*` and `emails.account.addEmail.*` keys of S.9 in four locales, `reviewed: false`. Axe and baselines are TASK-424's; export and erasure of added addresses are TASK-417's.
- **Design.** Match `account-details-*` ("Your emails", "How you sign in", the confirm page with and without the session, and the small states) and `account-orders-*` (the relay card above the empty state) pixel for pixel at 1440, 1280 and 390 px.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.3 item 9, S.4, S.9, S.10; C.4, C.7, C.11
- `docs/codebase-map.md`
- `docs/design/wireframes/account-details-desktop.dc.html`, `account-details-mobile.dc.html`, `account-orders-desktop.dc.html`, `account-orders-mobile.dc.html`
- the account pages and `buyerCheckoutProfile` from TASK-344 and TASK-352

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Copy slots (design PR 417, 2026-10-25).** S.9 has no key for: the "Linked {date}" and "Added {date}" lines, the line under "How you sign in", the refusals for the sign-in address and for an address already added, "Disconnected", the labels of the two masked addresses, and the heading and link of the confirm page without a session. Default as drawn: `[slot]`s. Add each as a key `reviewed: false` with a proposed English line listed in the PR for the founder's copy batch. Open with the founder.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
