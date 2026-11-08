# TASK-484 — Referrals data and store credit: migration `NNNN_referrals` + guarded down, `src/config/referrals.ts`, settings, codes, the credit ledger, switch readiness, permissions, the `order.delivered` consumer, the card fingerprint check, `referrals.credit_expiry`, restore grants, the erasure hook, `FINGERPRINT_HMAC_KEY`, RoPA and cookie register rows

Row: `TASKS.md` → TASK-484. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-484`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 050 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_referrals` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-34, AC-35 (restore half), AC-36, AC-43, AC-46, AC-47.
- **Scope (§12 tasks 1 and 3).** Migration and down, `src/config/referrals.ts`, settings (GBP 500/3000, EUR 600/3500, PLN 2500/15000), codes (8 characters, Crockford base32, CSPRNG), the credit ledger (grants and movements, immutable), `referralSwitchReadiness`, permissions, then the `order.delivered` consumer through the outbox, the card fingerprint check after capture, `referrals.credit_expiry`, restore grants and the erasure hook.
- **One agent builds TASK-484 and TASK-485 as one feature** (shared `src/modules/referrals`); a PR closing both carries the first ID.
- **ADR-0009:** no `transition`, `appendEvent` or `order` update in `src/modules/referrals`; credit granted when the friend's first order reaches `delivered`, read from the outbox. No control mints credit. We never send anything to a friend; no mailer import in the module.
- **Flag** `referrals.enabled` global, high-risk, off; turning it on is refused with `REFERRALS_NOT_READY` until amounts, the `referral` legal document and the VAT answer exist (§13 Q19).
- **Migration** after spec 010's purchase migrations, spec 013's purchase payment, spec 018's buyer account and spec 047's reductions (§12); the down raises `REFERRALS_ROLLBACK_LIVE_ROWS` with live rows. `FINGERPRINT_HMAC_KEY` in `lib/env.ts` (at least 32 bytes in production) and `.env.example`.
- **Docs:** RoPA "Referral programme" row, cookie register (`fo_ref`, `fo_ref_n`), `docs/runbooks/referrals.md`. The flag stays off until about 20 real orders (header).

## Read

- `specs/050-referrals.md`: `## 0. Index` first, then §2.1, §2.5, §2.6; §5.1, §5.2; §8; §9 AC-1 to AC-4, AC-24 to AC-29, AC-34 to AC-36, AC-43, AC-46, AC-47; §12; §13
- `docs/codebase-map.md`: where everything lives
- `docs/design/flows/referral.dc.html`
- `src/modules/orders/outbox/dispatcher.ts`, `src/modules/payments/` (fingerprint from the provider), `src/modules/customers/`, spec 047's reduction code once merged

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
