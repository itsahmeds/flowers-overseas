# TASK-487 — Referral admin, terms and edge: `/admin/referrals` (settings, readiness, metrics per currency, list, void, disable code), spec 030b's finance lines, `content/legal/{en,en-gb,de,pl}/referral.md`, the cookies page rows and privacy section, the Cloudflare invite rate limit and cache bypass

Row: `TASKS.md` → TASK-487. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-487`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 050 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-10, AC-37, AC-38, AC-39, AC-40 (page half), AC-44.
- **Admin** `/admin/referrals` (admin only): settings, switch readiness with the count of delivered live orders, metrics per currency for a date range (no figure adds two currencies; at most 6 queries), the referral list with signals, void a pending referral (reason of at least 10 characters), disable a code. No control creates a grant.
- **Spec 030b's finance view** gains the reduction lines, referral cost, margin per referred order and store credit outstanding (AC-39). Spec 030b is approved with no row on main; if its finance view is not merged when this task starts, ship the rest and leave AC-39 as a carry-forward in this brief.
- **Terms page** `content/legal/{en,en-gb,de,pl}/referral.md` under spec 041's `LegalDocumentSchema` with the sections AC-44 lists, `noindex, follow`, self-canonical, no hreflang, amounts table read from `referral_setting`. Cookies page rows and the privacy section.
- **Edge (AC-10):** the Cloudflare rate limit (30 per 10 minutes per IP on `/*/invite/*`) and cache bypass are set by the founder in the dashboard (or in the founder's Chrome); write the exact rule in `docs/runbooks/referrals.md` and verify on staging.

## Read

- `specs/050-referrals.md`: `## 0. Index` first, then §2.7; §5.3; §6; §8; §9 AC-10, AC-37 to AC-40, AC-44; §12 task 5 and 6
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/admin-referrals-{desktop,mobile}.dc.html`
- `specs/030b-admin-finance-crm.md` (finance view), spec 041's legal document loader, `src/app/admin/`

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
