# TASK-495 — Risk after routing and records: early fraud warnings by order state, the `risk` outbox target, fraud-dispute blocklisting, `buildEvidencePack` (PDF), `docs/runbooks/fraud-review.md` with Radar rules R1 to R10 and the rule test, the LIA, RoPA rows, the privacy-page requirement, the no-PII log suite

Row: `TASKS.md` → TASK-495. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-495`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 021 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-26, AC-27, AC-28, AC-32, AC-34, AC-37.
- **After routing:** early fraud warnings handled by order state per §5.2's table (`routed` cancels with `fraud_confirmed`; `accepted` retries once `paid`; `paid` opens a `post_routing` review); the `risk` outbox target; a `fraudulent` dispute blocklists the email and card hashes (`source = 'dispute'`) and supersedes open reviews; `product_not_received` writes nothing.
- **Evidence pack** `buildEvidencePack`: A4 PDF on spec 018's renderer (TASK-342), at most 4.5 MB and 19 pages, from immutable records, for the founder to upload in Stripe by hand (§13 Q8).
- **Records (§12 task 5):** `docs/runbooks/fraud-review.md` with Radar rules R1 to R10 verbatim between the markers AC-37's test reads (only spec 013's six metadata keys; no `Block` rule on card country, IP country or a country list), `docs/compliance/lia-fraud-prevention.md`, the RoPA rows of §8, the spec 041 privacy-page requirement, `.env.example` (`RISK_HASH_KEY`), the no-PII log suite over every path, codebase map.
- The founder enters the Radar rules once the Stripe account exists (§12 founder actions).

## Read

- `specs/021-fraud-prechecks.md`: `## 0. Index` first, then §2 E, F, G; §5.2; §8; §9 AC-26 to AC-28, AC-32, AC-34, AC-37; §11; §12
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/disputes.ts`, `src/modules/payments/webhooks.ts`, `src/modules/invoices/` (PDF renderer)
- `docs/compliance/ropa.md`

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

- 2026-11-11: `admin-scans` green again (3 reds on main): `partnerContractsHref` in `src/modules/admin/partners.ts` replaces the literal in `src/jobs/handlers.ts`; `src/jobs/basket-reminders.ts` allowed as an admin importer (worker only); 168 `admin.orderActions.*` meta rows added `reviewed: false` (TASK-361 shipped none), 2 obsolete rows dropped; the format scan gains the 32 missing values. Next: EFW handling.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
