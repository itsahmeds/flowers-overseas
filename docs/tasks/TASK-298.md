# TASK-298 — Spec 012b prices and margin

Row: `TASKS.md` → TASK-298. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 6. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-18, AC-19, AC-20, AC-21; tests T-18 to T-21 and T-39's AC-20 rows.
- Money is integer minor units plus an ISO currency: `parseMinorInput` has no `parseFloat`, no `Number(` on input text, no float literal (AC-18).
- `lowestPriceInLast30Days` includes the superseded amount; the visible price, JSON-LD `Offer.price` and `quote()` stay the same integer (AC-19).
- Add this task's commands to T-09's table (TASK-296).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): money and the Omnibus lowest price.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/catalog` price providers, `admin-price-change-*`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

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
