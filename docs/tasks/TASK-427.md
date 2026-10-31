# TASK-427 — Home and listing LCP margin: the homes and `/pl` listings still land at 1990 to 2030 ms on CI's fastest of three runs after TASK-411, so code PRs fail Lighthouse outside their diff (320, 402, 405 on 2026-10-25); find the next shared cause on the LCP path (document size, stylesheet order and size, fonts, script on every document, the fixture) and bring every measured page to 1800 ms or less, budget unchanged

Row: `TASKS.md` → TASK-427. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-427`; keep it current by editing this file, not the row.

## Binding

- Spec 004 AC-24: the LCP budget is 2000 ms on every page Lighthouse CI measures. The budget is not raised and the assertion is not loosened (no `aggregationMethod` change, no URL removed, no fixture change that hides real cost; spec 040 TASK-103's `median` ruling is a separate task).
- Target: every measured page at 1800 ms or less on the fastest of three, on two CI runs, so a code PR no longer needs a Lighthouse rerun outside its diff. Report each page's number from both runs.
- Shared causes first (document bytes, stylesheet order and size, font loading, script on every document, preloads). The home hero may be replaced by home v3 (TASK-386, PR 425), so a hero-only change does not close this task. TASK-411's AVIF q40 phone crop and stylesheet order stay.
- No design change: every page matches its `docs/design/` artboard; the visual job stays green with no new baselines unless a change is invisible and the refresh says so.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then AC-24
- `docs/tasks/TASK-411.md` and PR 420's body: what was measured and fixed
- `lighthouserc.*` and the Lighthouse job in `.github/workflows/ci.yml`; `app/[locale]/layout.tsx`; `docs/codebase-map.md`

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

- 2026-10-25: main run 40176953074 (scheduled, 7bb748089) read from its LHR artifact. Fastest of three: homes 1849 to 1982, both `/poland/flowers` listings 1914, roses and occasion pages 1851 to 1953, corridors and indexes 1522 to 1681. The LCP graph of `/en` is the document, the two preloaded fonts, the hero, the two stylesheets and two small scripts; no page part regressed. What moves run to run is Lighthouse's estimated **server latency of the origin** (`network-server-latency`, 113 to 249 ms), which its simulation charges to every request of the origin: on `/en` 129 ms gives 1909, 208 gives 1975, 212 gives 1988, and the same order holds on every home. Cause: `scripts/seo/brotli-origin.ts` encodes every response at quality 11 on one thread, per request, with no store, so the stylesheet, the fonts and the hero queue behind 250 KB chunks being re-encoded. Tried first and dropped: one copy of the wordmark path instead of three in the flight (39 KB of the 222 KB `/en`) saves 174 B of Brotli and no encoding time. Lever 1 (commit `perf(seo)`): the fixture encodes an `immutable` response once and serves the stored bytes, keyed by the body's SHA-256; documents are still encoded per request at quality 11. Bytes, encoding and quality unchanged. Next: the CI number of this commit.
- 2026-10-25 (stopped: laptop off): lever 1 pushed on PR 436. CI run 40192419412 ran on 299ae0b32 (same tree as the head after a commit-message-only reword that fixed commitlint's upper-case subject); its Lighthouse job had not finished when work stopped. Left: (1) read that run's Lighthouse per-URL table, or re-fire CI on the head by toggling `ci:full`, and put each page's fastest-of-three in the PR body; (2) a second CI run for the two-run target; (3) if any page is above 1800 ms, the next shared lever (document bytes, the 1.2 KB font sheet as a separate request); (4) `## Self-review` and `## Result`, row to `in_review`. The fixture change is a measurement-fixture change (documents untouched): flag it to the orchestrator before merge.
- 2026-10-31: lever 1 measured worse (run 40192419412, 299ae0b32): homes 2286 to 2759, corridors 2130 and up. Read from the LHRs: the origin's estimated server latency fell from about 229 ms to 13, but all ten script chunks (124 KB) now finished before the observed LCP, so Lantern put their download and evaluation in the LCP graph (main: 10 KB of script before LCP). Reverted (`revert(seo)`). Evidence from main's runs 40855026754 (green) and 41189981985 (red), same commit c0d6b6f2c: no page byte changed; the home's LCP tracks the origin latency at about 3.3 ms per ms (lat 105 gives 1859, 147 gives 1793, 229 gives 2072). The latency is the fixture's synchronous quality-11 encode: the hero image (no encode) finishes at 464 ms observed because it waits behind the 105 KB stylesheet's encode. Lever 2 (`perf(seo)`): encode on libuv's thread pool; same bytes, same quality, still per request. Next: its CI number.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
