# TASK-280 — The language popup opens only when it can offer another language

Row: `TASKS.md` → TASK-280. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 003 §14 A-founder-2026-10-19d (founder "yes yes", 2026-10-19), **Owner**: "`languageOffer`, the decision's third
condition, the conditional server half and gate attribute, the restated tests and the runbook §10 guard." Same
feature PR as spec 004's 19d (TASK-279).

- **ACs owned (as amended):** AC-3 (barrel gains `languageOffer`), AC-12, AC-25, AC-27, AC-28 (a) to (f) and (h)'s repo
  checks, AC-30, AC-46, AC-49 (popup half by unit). Tests T-03, T-12, T-25, T-28 (every red case in the amendment's
  table), T-30, T-46, T-49.
- On today's registry (`en`, `en-gb` shown) the popup never opens: no element, no chunk request, no
  `data-fo-locale-gate`, no `fo_locale` write. Browser language only: no country input anywhere.
- **Reading 1** (one primary language means an empty offer) stands unless the founder overrules it.
- **Not here:** the slim bar (clause 4) is built by the task that shows `de` or `pl` again; its lead-in needs founder
  copy. AC-28 (g) moves to that task.
- Runbook `docs/runbooks/i18n-translations.md` §10 gains the third guard: "the slim bar is built".
- **Review class: keeps the breaker** (with TASK-279's PR).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/003-i18n-foundation.md` `## 0. Index`, then §14 A16, A-founder-2026-10-19c (pointer), A-founder-2026-10-19d
- `docs/codebase-map.md` (`src/modules/i18n` routing barrel, the popup island and loader, the locale layout)
- `tests/unit/locale-gate.test.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** built by TASK-279's agent in TASK-279's PR; after TASK-244 (PR 253).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-23 (implementer, to the orchestrator): T-28 (c) and (d) ask for component tests of the island under the fixture "jsdom, `fetch` spied". The repository has no DOM test environment (no `jsdom` or `happy-dom` in `package.json`; the unit project is `environment: "node"`), and the browser e2e that covered closing and choosing cannot reach the dialog any more because the committed registry never opens it. Adding `jsdom` is a dependency decision. Until then (c) and (d) stand on the pure pieces (`decideLanguagePopup`, `serialiseLocaleCookie`, `linkedCandidates`, `PopupBody`'s anchors, the source pin that the island has no `fetch`); the slim bar's task replaces the dialog and owns its browser cases. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-23: worktree `../fo-wt-280`, branch `task/TASK-280-language-popup`, **stacked on PR 352** (TASK-279's branch): both rewrite the same consent and popup suites, so a branch from `origin/main` would conflict file by file. `languageOffer()` in the barrel, the decision's third condition, the conditional server half and gate attribute, the unit matrix and offer tests, the e2e restatement (AC-28 (a)), popup baselines and a11y case deleted, runbook §10 guard. Next: gates, a local run of the e2e, PR.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
