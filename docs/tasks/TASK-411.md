# TASK-411 — Home and listing LCP back under 2000 ms on main: find what regressed between the last green main Lighthouse and f947e149a (LCP element, fonts, preloads, above-the-fold images, script on every document) and fix the cause, budget unchanged

Row: `TASKS.md` → TASK-411. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-411`; keep it current by editing this file, not the row.

## Binding

Spec 004 AC-24: the `lighthouse` job passes with LCP < 2000 ms on every URL in `lighthouserc.json`. The budget does not move. Main's run 40141773879 (head 0498c7e4) and f947e149a failed on home and listing LCP of 1991 to 2153 ms; find the regression and fix its cause, aiming for a CI median at or under 1850 ms. Report per-URL numbers from CI, not local.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, then AC-24 and §6 (CWV budget impact)
- `lighthouserc.json`, `tests/fixtures/seo/lighthouse-urls.json`
- `docs/codebase-map.md`; the `src/` commits between the last green main Lighthouse run and f947e149a

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-25, to the founder through the orchestrator: may the Lighthouse fixture encode documents at Brotli quality 4 instead of 11?** Spec 004 §14 A12 names the fixture "Brotli, quality 11", and A-founder-2026-10-15b clause 3 says the measurement basis does not change, so this needs the founder's word before PR merge. Evidence: (1) **nothing on the page regressed.** The last green main run (40090947768, c81edd9ed) measured `/en` at 2064 / 2108 / 1858 ms and passed only because LHCI's `optimistic` aggregation takes the fastest of three; f947e149a and 0498c7e4 show the same spread (1886 to 2087), with the same LCP element (the hero `img`, `fetchpriority=high`, preloaded, 31 904 B), the same 2 fonts, 2 stylesheets and the same request waterfall. The three commits between them (TASK-279, TASK-347, TASK-290) moved nothing on the critical path. (2) **About 200 ms of every document's simulated LCP is the fixture's own CPU.** Lighthouse reads server response time 225 ms on the homes and 290 ms on the listing; `brotliCompressSync` at quality 11 takes 183 ms on the 222 783 B `/en` and 232 ms on the 278 363 B `/en/poland/flowers` (measured locally on the live HTML), quality 4 takes about 1 ms. The figure grows with every byte of HTML, which is why the margin has been shrinking. (3) **Production serves documents at quality 4**: Cloudflare sends `/en` as 28 248 B (quality 4: 28 216 B; quality 11: 22 039 B) and `/en/poland/flowers` as 27 418 B (quality 4: 27 355 B). So quality 4 makes the fixture's documents match the deployment in bytes and in time. Scripts stay at quality 11, the encoding the 131 072 B budget is written in (§14 A1); see the separate finding below. Answer: `open`.
- **2026-10-25, finding for the orchestrator (no action in this task):** production also serves **scripts** at quality 4 (one chunk: 40 550 B served, quality 4 40 495 B, quality 11 35 158 B), so real phones download about 15 % more script than the 131 072 B budget measures. A spec 004 §14 A1 question for the founder, not part of this task.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: CI evidence read (runs 40090947768 green, 40119504842, 40141773879, 40146356373 red; LHR artifacts of the first and last). Cause found: fixture quality-11 CPU in TTFB on top of an HTTP/1.1 connection race, not a page regression. Fixture change + unit test pushed; escalation above; CI run on the PR to measure the effect.
- 2026-10-25: PR 420 run 40151179074 on 4c3798897: listings and corridor pages fixed (best of three 1743 to 1850, was 1841 to 2062), the four homes still fail (best of three 1953 to 2071, was 1882 to 2061). The fixture quality explains the listing pages, not the homes. Next (finisher): the home hero path. The LCP is the 31 904 B `home-hero/828.avif`; in Lantern its load time is 670 to 760 ms of the 2 s, and it shares the HTTP/1.1 burst with 2 stylesheets and 2 preloaded fonts. Candidates: a smaller hero for the 412 x 1.75 profile (a 750 w rung, or a lower AVIF quality on that rung), or the TASK-235 rule check that no async chunk now finishes before the hero paints. The finding that a faster origin can make the homes slower (spec 004 A-founder-2026-10-15b "Measured") may apply here.

## Result

**Partial (time limit), PR 420, head 4c3798897, CI run 40151179074: every job green except `lighthouse`.** Documents go through the fixture at Brotli quality 4, the quality production serves them at; assets stay at 11. This needs the founder's answer (Escalations). Tests: 1 unit case in `tests/unit/brotli-origin.test.ts`, red under both mutations. LCP best of three / median, before (main 40146356373) -> after (PR): `/en` 1885/2049 -> 2071/2102; `/en-gb` 1881/2059 -> 1970/2002; `/de` 2046/2064 -> 1974/2087; `/pl` 1983/2079 -> 1953/2062; `/en/poland/flowers` 1862/2063 -> 1847/1852; `/en-gb/poland/flowers` 1848/1943 -> 1743/1837; corridor and occasion pages 1459 to 1868, all passing. The homes are still red, and the next step is in Progress.
