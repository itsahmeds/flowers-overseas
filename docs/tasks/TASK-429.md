# TASK-429 — Page weight before first paint, for the LCP margin: carried from TASK-427 (its fixture lever 2 approved; homes measure 1899 to 1965 ms, the page is now the limit), cut the work before first paint (the 222 KB raw document, the 105 KB raw stylesheet that holds every route's utilities, the script chunks and fonts that land in that window) so every Lighthouse-measured page is at or under 1800 ms on two CI runs, budget unchanged, no visible design change

Row: `TASKS.md` → TASK-429. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-429`; keep it current by editing this file, not the row.

## Binding

- Spec 004 AC-24: the LCP budget is 2000 ms on every page Lighthouse CI measures. The budget is not raised and no assertion is loosened: no `aggregationMethod` change, no URL removed, no fixture change that hides real cost.
- **Target, carried from TASK-427 (PR 436, its `## Result`):** every measured page at or under 1800 ms on the fastest of three, on **two** CI runs on the PR's head. Report each URL's number from both runs in the PR body, with the run ids.
- **Where the time is** (TASK-427, 2026-11-01): with the fixture's encode queue gone (lever 2, approved by the orchestrator 2026-11-01 under the founder's delegation), homes land at 1899 to 1965 ms, `/poland/flowers` at 1865 and 1867, corridors up to about 1837. The observed first paint (the hero is the LCP) comes about 145 ms of main-thread work after the stylesheet; in that window the small script chunks and the Fraunces files land and enter Lantern's LCP graph. The document is 222 KB raw and the stylesheet 105 KB raw (every route's utilities in one sheet), both uncompressed in the measurement's byte count.
- **Levers, shared causes first:** less document (duplicated flight payload, inlined data the first paint does not need), a smaller or split stylesheet (per-route CSS, unused utilities), fewer or later script chunks before first paint, font loading that stays out of the LCP window. A hero-only change does not close this task: home v3 (TASK-386, PR 425) may replace the hero.
- **Keep:** TASK-411's AVIF q40 phone crop and stylesheet order; TASK-427's thread-pool encode. Spec 004 A1's client script budget (`budget:client-js`) still holds.
- **No visible design change:** every page matches its `docs/design/` artboard; the visual job stays green with no new baselines, unless a change is invisible and the refresh says so in the PR.
- **Gates:** `pnpm gates:cheap` block in the PR. Lighthouse is CI's; take the build slot only for a deliberate local measurement and report the load average beside it (DoD §2, §3). Review-only (performance), so `## Self-review` names the mutation for each byte or budget assertion it adds.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then AC-24
- `docs/tasks/TASK-427.md` (PR 436 branch until it merges): Progress, Escalations and Result; `docs/tasks/TASK-411.md`
- `lighthouserc.*` and the Lighthouse job in `.github/workflows/ci.yml`; `scripts/seo/brotli-origin.ts`
- `app/[locale]/layout.tsx`, the global stylesheet and the Tailwind config; `docs/codebase-map.md`

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
