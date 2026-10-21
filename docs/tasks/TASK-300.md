# TASK-300 — Spec 012b go-live

Row: `TASKS.md` → TASK-300. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 8. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-25 (as amended by §14 A-orchestrator-2026-10-20a), AC-39 (preflight half); tests T-25, T-41 (preflight half).
- After TASK-294 and TASK-295, and PR 298 (the amendment) merged.
- `setGoLiveFiscalFields` sets `vat_rate_bp` (integer 0 to 10 000) or `supply_model` (`principal` or `agent`) only while the stored value is null, only with `country.status` and a non-empty reason, through `withAdminContext({ action: 'country.fiscal.set' })`; it raises `FISCAL_FIELD_ALREADY_SET` otherwise and writes no other column.
- AC-24's slice A clause holds here: `/admin/countries/[iso2]` renders operations and corridor flags with no edit control (AC-24 itself is TASK-305's).
- The flip goes only through `setCountryStatus` (spec 012's `status_flip_guard()`); go-live stays a data flip in admin, never a code change.
- Add this task's commands to T-09's table (TASK-296).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): country go-live, the VAT rate and indexability.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/geo`, `admin-countries-*`, `admin-country-detail-*`, `flows/admin-go-live.dc.html`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b design review (PR 296) found the go-live screen drawing "Supply model: Not set" read-only. Build from the artboard only once it draws the two fiscal inputs in the preflight's missing state (absent once both are set); that redraw is in progress on PR 296.

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
