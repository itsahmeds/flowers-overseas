# TASK-244 — Non-critical client chunks wait for the LCP paint

Row: `TASKS.md` → TASK-244. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

On 2026-10-15 the founder answered TASK-235 escalation E1 with "go with option a". The founder
approved the amendment the same day ("specs ok (237 and 240)"). Until PR 237 merges, read it with
`git show origin/docs/spec-emdash-titles:specs/004-design-system-layout.md`. The class is **keeps
the breaker**: it touches CWV, the LCP assertion and the CI budget (`CLAUDE.md` DoD §4).

- **Spec 004 §14 A-founder-2026-10-15b. Owned: AC-55 (T-60). Re-verified: §9 AC-24.**
  - **Clause 1.** A client chunk that is not needed to paint the LCP element is neither requested
    nor finished before that paint. It loads after the paint, on idle, or on the first interaction
    with its control. You choose the mechanism; record it here under `## Result`.
  - **Clause 2.** The deferred set is declared once in `src/modules/ui`, and a unit test reads it.
    It holds at least the motions, the first-visit language popup and the header and phone Menu
    enhancements. It also holds every other island that is not on the first screen's paint path.
    The consent banner is **not** deferred. If its chunk turns out to be part of the race, escalate
    instead of delaying it.
  - **Clause 3. Nothing else changes:**
    - the measurement basis (A12, A18, the URL set, `numberOfRuns`, throttling, aggregation);
    - the visual baselines taken at first paint;
    - no indexable content moves to the client;
    - the 131,072 B Brotli JS budget and CLS < 0.05;
    - every control that works without JavaScript keeps working, and a tap before the chunk has
      loaded still works.
- **How this relates to other tasks.**
  - **TASK-235 (PR 231)** holds the warm-up and the evidence (C1 to C3, E1). It merges first. Its
    warm-up stays.
  - **TASK-194 (PR 221, the motions)** has to build to clause 1 before it merges (clause 4). Its own
    motion module loads after the LCP paint. This task then adds that module to the declared set.
    This task starts after TASK-194 merges, because the set must name the motions. Never run it
    beside TASK-194: both live in `src/modules/ui`.
  - **The language popup.** TASK-119 shipped it and is merged (PR 205), so making it lazy is this
    task's job. T-60's red case is the popup module imported eagerly again. TASK-237 (in TASK-233's
    feature, PR 229) changes the popup and the phone Menu. This task starts after PR 229 merges.
  - **TASK-103 (median)** does not change this rule (clause 3).
  - **Every later island** follows clause 1. A merged island that breaks it gets a new task row.
- **Test and evidence (AC-55, T-60).**
  - Unit: the set contents.
  - E2e on every URL in `tests/fixtures/seo/lighthouse-urls.json`: `PerformanceObserver` for LCP,
    plus resource timing. Every deferred chunk starts after the LCP render time. A tap on Menu and
    on the language control before idle still opens it.
  - Lighthouse LCP under 2,000 ms on every audited URL, on the head and in three `ci:full` runs.
    Record the per-URL numbers in `## Result`.
  - The JavaScript-off e2e cases of the home, the Menu and the language links pass unchanged.
- **Watched red:** the popup imported eagerly; a Menu enhancement imported eagerly; the set emptied.
- **Gates:** run `pnpm gates:cheap` and paste the block. CI must be green on the head with
  `ci:full`; CI is the gate of record for LCP. Report any local number with the load average. Then
  `/review` and `/break`.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then §9 AC-24, §14 A1, A12, A18, A23 clause
  11, A24, A-founder-2026-10-15b
- `docs/tasks/TASK-235.md` on branch `task/TASK-235-lighthouse-warmup` (`## Result` C1 to C3,
  `## Escalations` E1)
- `docs/codebase-map.md`
- `src/modules/i18n/ui/LanguagePopupLoader.tsx`, `LanguagePopupIsland.tsx`,
  `src/modules/ui/consent/ConsentBannerLoader.tsx` (the loader pattern to compare),
  `src/modules/ui/index.ts`, `tests/e2e/lcp.spec.ts`, `lighthouserc.json`, `scripts/client-js-budget.ts`

## Carry-forwards

_None yet._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
