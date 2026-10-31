# TASK-430 — No em dash in user-facing text: the nine `en` body keys with no owner (corridor facts, steps and calendar, occasion hub and occasions index lines) and their `de`/`pl` drafts, the seed copy descriptions in four locales and the Poland guide's four body dashes rewritten with a colon, full stop, commas or brackets, `reviewed: false`, plus the `i18n:check` and unit check that refuse U+2014 in every catalogue, seed copy and `content/` file

Row: `TASKS.md` → TASK-430. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-430`; keep it current by editing this file, not the row.

## Binding

- **Owned: spec 004 §14 A-orchestrator-2026-11-01a, AC-117 (T-123).** The rule is clause 1, the replacement clause 2, the check clauses 4 and 5.
- **The nine `en` keys** (clause "Trigger"): `corridor.facts.orderBy.value`, `corridor.facts.deliveryDays.none`, `corridor.facts.soonest.none`, `corridor.facts.cities.none`, `corridor.facts.prices.none`, `corridor.steps.guide.oneBody`, `corridor.calendar.intro`, `occasionHub.dateUnknown`, `occasionsIndex.undatedNote`. `en-gb` inherits them (no override today). The same keys in `de` and `pl`, plus `pl` `shop.category.lede`, are redrafted from the new English: `source: machine`, `reviewed: false`.
- **Seed copy:** every `descriptionMd` with a dash in `seed/data/copy/{en,en-gb,de,pl}/*.json` (14, 2, 5 and 5 rows on `fc74ec5d3`); regenerate the seed snapshot with the seed tooling, never by hand. A changed row's review triple goes `reviewed: false` (spec 006).
- **Content:** the four body dashes of `content/corridors/en/pl-guide.md` (lines 91, 98, 99, 111 on `fc74ec5d3`). `en-gb/pl-guide.md` has none today.
- **Replacement** (clause 2): colon or full stop for one dash; commas or brackets for a pair around an aside; an opening dash dropped and the value capitalised. Keep the words. `corridor.facts.orderBy.value` keeps `{time}`, `{zone}` and "the recipient's own time, not yours". List every changed `en` value old and new in the PR body.
- **Copy approval** (spec 003 A-founder-2026-10-31a): write `.claude/state/record-approval-430.py` with `--check`, which prints every changed `en` value and seed row it records. The orchestrator reads it and runs it. Never set `reviewed: true` and never write `reviewedBy` yourself.
- **The check** (clauses 4 and 5): `i18n:check` gains the body check over every catalogue key; one unit test scans seed copy, `content/` and `error-copy.data.ts`; both share one pattern extending `head-punctuation.ts`. `PENDING_DASH_KEYS` holds only TASK-251's four consent keys with that id and fails on an entry that no longer holds a dash.
- **Depends on TASK-428** (the support line). If TASK-428 has not merged when you start, stop and report.
- **Gates:** `pnpm gates:cheap` block; `seed:check` and `corridor:check` green if they exist for the touched files; CI green on the head with `ci:full`. Review-only (copy and a check). `## Self-review` names the T-123 mutations (U+2014 removed from the pattern; `content/` dropped from the scan) and their red runs.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then §14 A-orchestrator-2026-11-01a
- `specs/003-*.md` §14 A-founder-2026-10-15a (clauses 1, 2 and 4: the head rule this extends) and A-founder-2026-10-31a (copy approval)
- `src/modules/i18n/head-punctuation.ts`, `scripts/i18n-check.ts`, `tests/unit/head-punctuation.test.ts`; `docs/codebase-map.md`
- One earlier `.claude/state/record-approval-*.py` (for example `record-approval-428.py` if it exists, else `record-approval-386.py`) for the script's shape

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-11-01):** open PR 293 (TASK-239) adds five em dashes to copy. Whichever of the two merges second removes them on its rebase; if TASK-430 is second, the check catches them.

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
