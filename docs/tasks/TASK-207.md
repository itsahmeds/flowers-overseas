# TASK-207 — Spec 010 retention, records and docs: the `retention.sweep` handlers for `checkout_draft` and `demo_order_personal`, the three RoPA rows of §8, `docs/runbooks/checkout.md`, the `modules/checkout` row in `docs/architecture.md`, the codebase map

Row: `TASKS.md` → TASK-207. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-207`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 7. Owns **AC-35, AC-36 (RoPA and cookies-page half), AC-40**; tests **T-35, T-36 (RoPA half), T-40**.
- **Retention (§2, §5.1 A; the only copy of these two rules, specs 011 and 012 keep none):** `retention.sweep` handlers for `checkout_draft` (deleted 24 hours after the last activity, every environment) and `demo_order_personal` (`order.mode IN ('demo','test')` pseudonymised 24 hours after placement with the production seed and 7 days after placement with the staging seed: snapshots redacted, `customer` and `recipient` rows created only by such orders redacted, order, lines and events kept; a `live` order untouched; `--dry-run` writes nothing and reports the same counts).
- **Records:** the three RoPA rows of §8 (row 3 marked "starts with spec 013"); the cookies page lists `fo_checkout`; `docs/runbooks/checkout.md` (opening and closing the demo per country, the cap, retention per environment, what turning the guard off requires, the production insert-only seed before the first production demo order, the recorded VoiceOver pass); the `modules/checkout` row in `docs/architecture.md`; `QUOTE_SIGNING_SECRET` asserted in `.env.example` and `lib/env.ts`; `pnpm codebase:map --check`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): retention of personal data and compliance records. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §5.1 A (the two retention rows); §8; §12 "Rollback" and "Production data"; §9 AC-35, AC-36, AC-40.
- `docs/tasks/TASK-025.md` (the sweep); `docs/compliance/ropa.md`; `docs/runbooks/`; `docs/architecture.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** same backend agent as TASK-200, TASK-203 and TASK-205.
- **From `/plan-tasks` (b) (2026-10-22):** spec 010 §14 A-founder-2026-10-22 rewrites AC-35 (drafts kept 30 days, buyer, recipient and card cleared at 24 h, purchase kept on pseudonymisation) and adds AC-75 (RoPA row 1, `fo_checkout` 30 days and `fo_basket` in `src/config/cookies.ts` and the cookies page). The two retention rows are seeded by TASK-348's migration; this task owns the sweep handlers and records.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: on PR 400: `retention.sweep` handlers `checkout_draft_personal`, `checkout_draft`, `demo_order_personal` (5 integration cases in `checkout-place.test.ts`, mutations seen red: mode filter dropped, `<=` to `<`), RoPA rows 8 to 10, `docs/runbooks/checkout.md`, the architecture row, `tests/unit/checkout-records.test.ts`. **Not done: the cookie-register half of AC-36/AC-75** (`fo_checkout`, `fo_checkout_echo` rows, `fo_basket` set, `fo_csrf` removed): it needs purpose copy, and two more unreviewed counted keys push `en-gb` past the 5 % share and deindex it, so it waits for the founder's approval of that copy (the change was built and reverted; see PR 400). `consent.cookies.basket.purpose` still says "Not set yet" although `fo_basket` is set on main.

- 2026-10-24 (2): orchestrator ruling: the cookie-register rows stay out of this PR; their exact proposed text is in PR 400's "Copy for the founder" for the founder's approval and record run.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 400 (https://github.com/itsahmeds/flowers-overseas/pull/400). Retention handlers `checkout_draft_personal`, `checkout_draft`, `demo_order_personal` (5 integration cases), RoPA rows 8 to 10, `docs/runbooks/checkout.md`, the architecture row, `checkout-records.test.ts`. Handed on: the cookie-register half of AC-36 and AC-75 waits for the founder's approval of the purpose copy (PR 400 "Copy for the founder").
