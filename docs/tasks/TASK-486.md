# TASK-486 — Referral buyer surfaces: `/{locale}/invite/{code}` and its two cookies, the saved-offer note island, the ShareBlock (confirmation, account, B1 for consenting buyers), `/{locale}/account/credit`, the basket and step 4 lines, `formatMoney` `wholeAmount: 'short'`, robots disallow, keys in four locales

Row: `TASKS.md` → TASK-486. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-486`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 050 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-5, AC-6, AC-7, AC-8, AC-9, AC-11, AC-12, AC-40 (route half), AC-41, AC-42, AC-45.
- **§14 A-orchestrator-2026-10-25 item 3 is binding:** promotional sentences render whole amounts via `formatMoney(..., { wholeAmount: 'short' })` (`trailingZeroDisplay: 'stripIfInteger'`); transaction amounts keep their minor digits.
- **Invite route** `GET /{locale}/invite/{code}`: 302 to `/{locale}` always; cookies only for an active code with the programme on (`fo_ref` HttpOnly, `fo_ref_n` readable, 30 days, Lax, Secure); `no-store, private`, `noindex, nofollow`, `Referrer-Policy: no-referrer`; logged path `/{locale}/invite/[redacted]`. `robots.txt` gets `Disallow: /*/invite/`.
- **Public cached pages stay byte-identical** with and without the cookies; the saved-offer note is a post-paint island (at most 512 B Brotli, no request, no layout shift). The ShareBlock island at most 1 024 B Brotli; JS off shows the read-only link and the WhatsApp link.
- **ShareBlock** on the paid confirmation states (after the account nudge, before the quiet cancel line, which stays last), the account, and B1 **only** for buyers with marketing consent (§13 Q10). No field for a friend's email or phone anywhere.
- **Account:** credit per currency on `/{locale}/account`, grants table on `/{locale}/account/credit`, no friend data.
- Keys in en, en-gb, de, pl with `reviewed: false`; `pl` plurals; `/ar-XB` logical properties only; axe at 390 and 1440 px.

## Read

- `specs/050-referrals.md`: `## 0. Index` first, then §2.2, §2.3; §5.3; §6; §7; §8 "Cookie basis"; §9 AC-5 to AC-12, AC-40 to AC-42, AC-45; §14; Appendix A
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/confirmation-*`, `account-credit-*`, `basket-*`, `checkout-*`, `email-buyer-*` (PR 426), `docs/design/flows/referral.dc.html`
- `src/config/cookies.ts`, `src/app/robots.ts`, spec 013's confirmation and spec 018's account pages

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
