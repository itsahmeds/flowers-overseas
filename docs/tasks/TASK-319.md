# TASK-319 — Spec 012b slice A.2 bulk upload, part 1: parse, template, preview

Row: `TASKS.md` → TASK-319. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §14 A-founder-2026-10-21b (bulk upload of a florist's bouquets and prices), approved 2026-10-21, founder "bulk defaults" (§13 Q17 to Q28 defaults, advisor fixes F1 to F5 applied). Spec §12 task 14a. Merges after PR 311 (the amendment).
- **ACs owned:** AC-40, AC-41, AC-42, AC-46; AC-15 (`copy.formula_lead` on every free-text field only; the rest of AC-15 is TASK-297's); AC-44 (parsing, currency, same-day, suggested price and warning parts, all at preview); AC-47 (logs, no stored file, the sweep, its routes). Tests T-42, T-43, T-44, T-48, and T-52, T-53 for the upload and preview states.
- Depends on slice A tasks 2, 5, 6 (TASK-293, TASK-297, TASK-298) and TASK-218. It adds no rule of its own: every check is a slice A function with its rule id, and Apply (TASK-320) uses slice A commands.
- **Review class: keeps the breaker** (money, a migration, security, a new dependency).
- **First step:** choose and pin the XLSX library, `pnpm audit` clean, DTD processing off, inflate counted in bytes actually inflated. If no maintained library passes, stop and report: the founder decides whether A.2 ships CSV-only. The npm `xlsx` 0.18.x package is excluded (see §14).
- `NNNN_catalogue_import` follows `NNNN_catalogue_cms`, with a `.down.sql` the round-trip test runs. Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL`.
- New admin strings in `messages/admin/en.json` only, `reviewed: false`. The import payload is held 24 hours, then purged.
- **Design:** the import pages are drawn in the design PR `docs/design-012b-bulk` (artboards `admin-catalogue-import`); `/implement` waits for it to merge.

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §14 (14.1 to 14.11), §12 task 14a, AC-40 to AC-42, AC-44, AC-46, AC-47, T-42 to T-44, T-48, T-52, T-53
- `docs/codebase-map.md`
- the slice A validators and commands (TASK-297), `parseMinorInput`, `supersedePrice`, `suggestedPrice` (TASK-298), `src/modules/admin/`, `docs/design/` import artboards once merged

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
