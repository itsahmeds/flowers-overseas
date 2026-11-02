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

- **2026-11-01, to the orchestrator: keep lever 2 (fixture encodes on the thread pool) or revert it?** It changes no byte, quality or per-request encode, and removes a queue no server has; with it the homes' spread falls from up to 350 ms to under 60 and the fastest of three sits at 1899 to 1965, but corridors rise to about 1830 and no page reaches 1800. What is left once the queue is gone is the page: the observed first paint (the hero is the LCP) comes about 145 ms of main-thread work after the stylesheet, and in that window the small script chunks and the Fraunces files land and enter Lantern's LCP graph. Reaching 1800 needs less work before first paint (document 222 KB raw, stylesheet 105 KB raw, the whole app's utilities in one sheet), a task larger than S. **Answer (orchestrator, 2026-11-01, under the founder's blanket delegation of 2026-10-31; the orchestrator's ruling, not the founder's words): approved.** Encoding on the thread pool with the same bytes and quality is closer to production than one-thread encoding and loosens no assertion; the 2000 ms budget is unchanged. The 1800 ms target and the page-side work become a carry-forward (see Result); the orchestrator writes the new row.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: main run 40176953074 (scheduled, 7bb748089) read from its LHR artifact. Fastest of three: homes 1849 to 1982, both `/poland/flowers` listings 1914, roses and occasion pages 1851 to 1953, corridors and indexes 1522 to 1681. The LCP graph of `/en` is the document, the two preloaded fonts, the hero, the two stylesheets and two small scripts; no page part regressed. What moves run to run is Lighthouse's estimated **server latency of the origin** (`network-server-latency`, 113 to 249 ms), which its simulation charges to every request of the origin: on `/en` 129 ms gives 1909, 208 gives 1975, 212 gives 1988, and the same order holds on every home. Cause: `scripts/seo/brotli-origin.ts` encodes every response at quality 11 on one thread, per request, with no store, so the stylesheet, the fonts and the hero queue behind 250 KB chunks being re-encoded. Tried first and dropped: one copy of the wordmark path instead of three in the flight (39 KB of the 222 KB `/en`) saves 174 B of Brotli and no encoding time. Lever 1 (commit `perf(seo)`): the fixture encodes an `immutable` response once and serves the stored bytes, keyed by the body's SHA-256; documents are still encoded per request at quality 11. Bytes, encoding and quality unchanged. Next: the CI number of this commit.
- 2026-10-25 (stopped: laptop off): lever 1 pushed on PR 436. CI run 40192419412 ran on 299ae0b32 (same tree as the head after a commit-message-only reword that fixed commitlint's upper-case subject); its Lighthouse job had not finished when work stopped. Left: (1) read that run's Lighthouse per-URL table, or re-fire CI on the head by toggling `ci:full`, and put each page's fastest-of-three in the PR body; (2) a second CI run for the two-run target; (3) if any page is above 1800 ms, the next shared lever (document bytes, the 1.2 KB font sheet as a separate request); (4) `## Self-review` and `## Result`, row to `in_review`. The fixture change is a measurement-fixture change (documents untouched): flag it to the orchestrator before merge.
- 2026-10-31: lever 1 measured worse (run 40192419412, 299ae0b32): homes 2286 to 2759, corridors 2130 and up. Read from the LHRs: the origin's estimated server latency fell from about 229 ms to 13, but all ten script chunks (124 KB) now finished before the observed LCP, so Lantern put their download and evaluation in the LCP graph (main: 10 KB of script before LCP). Reverted (`revert(seo)`). Evidence from main's runs 40855026754 (green) and 41189981985 (red), same commit c0d6b6f2c: no page byte changed; the home's LCP tracks the origin latency at about 3.3 ms per ms (lat 105 gives 1859, 147 gives 1793, 229 gives 2072). The latency is the fixture's synchronous quality-11 encode: the hero image (no encode) finishes at 464 ms observed because it waits behind the 105 KB stylesheet's encode. Lever 2 (`perf(seo)`): encode on libuv's thread pool; same bytes, same quality, still per request. Next: its CI number.
- 2026-11-01: lever 2 run 41230467577 (f0171568d), every job green. Origin latency 22 to 56 ms (main 105 to 283). Fastest of three: `/en` 1941, `/en-gb` 1953, `/de` 1965, `/pl` 1899, `/en/poland/flowers` 1867, `/en-gb/poland/flowers` 1865, roses 1852 to 1889, occasions 1827 to 1964, corridors 1455 to 1837; spread within a URL 3 to 60 ms (main up to 350). Homes better than main's red runs, worse than its green one; corridors worse (main 1446 to 1700). Not at 1800. Second run re-fired; it was still queued at the stop (GitHub API rate limit hit while watching). Left: the second run's numbers, the orchestrator's ruling on lever 2 (escalation below), and a page-side lever for the work before first paint.

## Result

PR 436. The Lighthouse fixture `scripts/seo/brotli-origin.ts` encodes on libuv's thread pool instead of its one thread (same bytes, quality 11, every response still encoded per request); lever 1 (encode an immutable asset once) was measured worse and reverted. Tests: 2 unit cases in `tests/unit/brotli-origin.test.ts` (byte identity with the synchronous quality-11 encoder; an event-loop turn runs before an encode ends), each red under its mutation. Numbers: run 41230467577 fastest of three, homes 1899 to 1965, `/poland/flowers` 1865 and 1867, every page under the 2000 ms budget with a within-URL spread of 3 to 60 ms (main: up to 350); second run in the PR body. Budget and assertions unchanged.

**Carry-forward (orchestrator writes the row):** the 1800 ms margin target is not met. With the fixture queue gone, the limit is the page: the observed first paint (the hero is the LCP) comes about 145 ms of main-thread work after the stylesheet, and in that window the small script chunks and the Fraunces files land and enter Lantern's LCP graph. Reaching 1800 needs less work before first paint: the 222 KB raw document and the 105 KB raw stylesheet (every route's utilities in one sheet).
