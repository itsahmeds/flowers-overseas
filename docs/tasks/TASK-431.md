# TASK-431 — The destinations hub's country count from the data: `destinationsHub.seoDescription`, `.intro` and `.phoneIntro` lose "Seven countries in Europe" for an ICU plural fed by the number of destinations `hubView()` lists, in the page and its metadata, in `en`, `en-gb` and the `de`/`pl` drafts, so adding a destination changes the number with no code or copy change

Row: `TASKS.md` → TASK-431. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-431`; keep it current by editing this file, not the row.

## Binding

- **Owned: spec 007 §14 A-orchestrator-2026-11-01b, AC-37 (T-38).**
- **The keys:** `destinationsHub.seoDescription`, `destinationsHub.intro`, `destinationsHub.phoneIntro`. Today each opens with "Seven countries in Europe" in `en` (`en-gb` inherits); `de` has "Sieben Länder" in `intro` and English text in the other two, `pl` has "Siedem krajów" in `intro` and English in the other two.
- **The rule:** each takes `{count}` in an ICU `plural` (`one`/`other` in `en` and `de`; `one`/`few`/`many`/`other` in `pl`). The route passes the number of destinations `hubView(locale)` lists, the same view the page renders, in `DestinationsHubPage` and in `generateMetadata` (`src/app/[locale]/[segment]/page.tsx`). No number word or numeral for countries, and no "in Europe", stays in any of the three values. The rest of each sentence keeps its words; list every changed `en` value old and new in the PR body.
- **Freshness:** read the count from the same cached view and tags as the list, so the data flip that adds a hub row changes the number in the same revalidation. Do not add a constant or a second registry read.
- **Copy approval** (spec 003 A-founder-2026-10-31a): write `.claude/state/record-approval-431.py` with `--check`, printing the three new `en` values. The orchestrator reads it and runs it. Never set `reviewed: true` yourself. `de`/`pl` are machine drafts of the new English, `reviewed: false`.
- **`seoDescription` is a head key** (spec 003 A-founder-2026-10-15a clause 4): no em dash and no spaced dash. ICU arguments must agree across the four catalogues (`i18n:check` check 4).
- **Never in flight beside TASK-291** (spec 043 §7 also edits `destinationsHub.intro`). If TASK-291 is in flight, stop and report.
- **Gates:** `pnpm gates:cheap` block; CI green on the head with `ci:full` (the hub's visual baselines may move by the changed words: refresh only those and say so). Review-only. `## Self-review` names T-38's two mutations (the count written back into the `en` value; the count read from a constant) and their red runs.

## Read

- `specs/007-corridor-pages.md`: `## 0. Index`, then §14 A-orchestrator-2026-11-01b and A12 (the hub's layout)
- `specs/043-site-clarity.md` §7 (its `destinationsHub.intro` edit)
- `src/app/[locale]/[segment]/page.tsx` (the hub branch and `generateMetadata`), `hubView()` and `DestinationsHubPage` (see `docs/codebase-map.md`)
- `messages/{en,de,pl}.json` `destinationsHub.*` and their `.meta.json` rows

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
