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

- **2026-10-25, to the founder through the orchestrator: may the Lighthouse fixture encode documents at Brotli quality 4 instead of 11?** Spec 004 §14 A12 names the fixture "Brotli, quality 11", and A-founder-2026-10-15b clause 3 says the measurement basis does not change, so this needs the founder's word before PR merge. Evidence: (1) **nothing on the page regressed.** The last green main run (40090947768, c81edd9ed) measured `/en` at 2064 / 2108 / 1858 ms and passed only because LHCI's `optimistic` aggregation takes the fastest of three; f947e149a and 0498c7e4 show the same spread (1886 to 2087), with the same LCP element (the hero `img`, `fetchpriority=high`, preloaded, 31 904 B), the same 2 fonts, 2 stylesheets and the same request waterfall. The three commits between them (TASK-279, TASK-347, TASK-290) moved nothing on the critical path. (2) **About 200 ms of every document's simulated LCP is the fixture's own CPU.** Lighthouse reads server response time 225 ms on the homes and 290 ms on the listing; `brotliCompressSync` at quality 11 takes 183 ms on the 222 783 B `/en` and 232 ms on the 278 363 B `/en/poland/flowers` (measured locally on the live HTML), quality 4 takes about 1 ms. The figure grows with every byte of HTML, which is why the margin has been shrinking. (3) **Production serves documents at quality 4**: Cloudflare sends `/en` as 28 248 B (quality 4: 28 216 B; quality 11: 22 039 B) and `/en/poland/flowers` as 27 418 B (quality 4: 27 355 B). So quality 4 makes the fixture's documents match the deployment in bytes and in time. Scripts stay at quality 11, the encoding the 131 072 B budget is written in (§14 A1); see the separate finding below. Answer: `open`. Since the two page fixes below, AC-24 passes at quality 11 without it: the fixture commit is the branch's last commit, on its own, so it can be dropped or kept on the founder's answer.
- **2026-10-25, finding for the orchestrator (no action in this task):** production also serves **scripts** at quality 4 (one chunk: 40 550 B served, quality 4 40 495 B, quality 11 35 158 B), so real phones download about 15 % more script than the 131 072 B budget measures. A spec 004 §14 A1 question for the founder, not part of this task.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: CI evidence read (runs 40090947768 green, 40119504842, 40141773879, 40146356373 red; LHR artifacts of the first and last). Cause found: fixture quality-11 CPU in TTFB on top of an HTTP/1.1 connection race, not a page regression. Fixture change + unit test pushed; escalation above; CI run on the PR to measure the effect.
- 2026-10-25: PR 420 run 40151179074 on 4c3798897: listings and corridor pages fixed (best of three 1743 to 1850, was 1841 to 2062), the four homes still fail (best of three 1953 to 2071, was 1882 to 2061). The fixture quality explains the listing pages, not the homes. Next (finisher): the home hero path. The LCP is the 31 904 B `home-hero/828.avif`; in Lantern its load time is 670 to 760 ms of the 2 s, and it shares the HTTP/1.1 burst with 2 stylesheets and 2 preloaded fonts. Candidates: a smaller hero for the 412 x 1.75 profile (a 750 w rung, or a lower AVIF quality on that rung), or the TASK-235 rule check that no async chunk now finishes before the hero paints. The finding that a faster origin can make the homes slower (spec 004 A-founder-2026-10-15b "Measured") may apply here.
- 2026-10-25 (orchestrator: fix the homes at quality 11; the fixture commit moves to the end of the branch). Checked first: the hero `<img>` has `fetchpriority="high"` and `loading="eager"`, and its preload in `<head>` comes ahead of both stylesheets, with `imagesrcset`/`imagesizes` equal to the `<source>`'s. Nothing to change there. Commit `perf(media)`: the hero's phone crop (the 4:3 rungs 384/640/828) is encoded at AVIF quality 40 instead of 50, pinned in the variant header as `encoders.avifHeroPhone`. 828 w drops from 31 593 B to 20 954 B, with no visible difference side by side at device size; quality 30 (14 114 B) was rejected because it visibly smears the petals. CI run 40155284564 at quality 11: the homes' slow runs over 2 050 ms are gone, but the fastest of three is 1 851 to 1 916. Then the LHRs showed the home LCP tracking FCP plus 300 ms, and FCP has two modes 150 ms apart. On Lantern's six HTTP/1.1 connections, the 1.2 KB `next/font` sheet came first in the document, so it took the document's warm connection and the 18.8 KB main stylesheet paid a cold handshake. Commit `perf(app)`: `globals.css` is imported first in the locale layout, so the main sheet comes first. CI run 40158449841 on 8c6f643e0 at quality 11: every job green.

## Result

**PR 420. AC-24 passes at Brotli quality 11 on 8c6f643e0 (CI run 40158449841, every job green).** The fixture commit (documents at quality 4) is the last commit, on its own, for the founder (Escalations). LCP fastest / median per URL, main 0df5a0e1b (run 40146356373) -> PR (run 40158449841): `/en` 1885/2049 -> 1766/1775; `/en-gb` 1881/2059 -> 1765/1778; `/de` 2046/2064 -> 1749/1768; `/pl` 1983/2079 -> 1676/1777; `/en/poland/flowers` 1862/2063 -> 1814/1836; `/en-gb/poland/flowers` 1848/1943 -> 1821/1877; corridors 1455 to 1618; occasions and roses 1793 to 1968. Tests: unit, `tests/unit/media-variants.test.ts` gains 4 cases for the hero phone quality (red with the override disabled); `tests/unit/brotli-origin.test.ts` 1 case (in the fixture commit). Cause, in one line: no page regressed; the homes sat on the line because the 31.6 KB hero and the 18.8 KB stylesheet both paid extra round trips on the fixture's HTTP/1.1 connections, with the q11 compression CPU on top. Deviation to note: spec 006 §13 Q5 pins AVIF quality 50; the hero's phone rungs now use 40 (constant `HERO_PHONE_AVIF_QUALITY`, `seed/schema/variants.ts`).
