# TASK-307 — Spec 042 photo morph (042-1)

Row: `TASKS.md` → TASK-307. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.1 and §13 Q1 (answered (a) with transform-only keyframes; advisor fix F2 narrows it to `lg` and up).
- **ACs owned:** AC-7, AC-8, AC-9; tests T-7 to T-9. AC-9's two LCP medians (five CI runs each, switch on and off) go in `## Result`.
- After TASK-244 (PR 253: the motion module's deferral; the `pageswap` handler is JS).
- Spec 004 §14's narrow exception to A23 clause 11 and AC-44 (in PR 284) is the only allowance: same-origin card navigation only, never a first load or reload, at most 320 ms.
- Never beside TASK-285's feature PR (TASK-285 and TASK-290 edit `ProductCard`).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 14, `product-desktop` (arrival from a card at 0 / 160 / 320 ms). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): motion, no money or legal text; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- the motion module, `ProductCard`'s link, the product hero

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-25 (finisher self-review): T-8's WebKit half is not run; `playwright.config.ts` has no
  WebKit project. Whoever adds one runs `photo-morph.spec.ts` "a card click at 390 x 844" there.
- 2026-10-25: no RTL locale has alt text in `seed/data/alt/`, so `/ar-XB` cards draw spec 006's
  placeholder and the morph has no photograph to fly; the mirrored origin is covered only by the
  shipped-CSS unit test. Add an `/ar-XB` T-7 case when an RTL locale gets alt text.
- 2026-10-25: spec 042 T-9's stated mutation ("red with a 400 ms morph") stays green: Chromium
  paints the product page's LCP at reveal, under the transition, so the flight's length does not
  move it (measured: 400 ms group, delta 4 ms). The case goes red for a morph that delays the
  reveal (200 ms of work at `pagereveal` only under a transition: delta 200 ms). Spec 042's T-9
  wording wants that mutation instead, at its next amendment.
- 2026-10-25: the group keyframes are the UA's (width and height equal at both ends because the
  card box takes the hero's width in `pageswap`), not custom keyframes; the outcome clause 2 asks
  for, only `transform` changing, holds and T-7 asserts it within 1 px.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: built (PR 407): `src/modules/ui/motion/morph.ts` (click arms, `pageswap` names and sizes
  the card box), `Gallery` `<style data-fo-morph>`, motion 14 in `globals.css`, `src/config/interactions.ts`.
  Unit: `interactions-css`, `interactions-budget`, `interactions-morph`; e2e `photo-morph.spec.ts` (T-7 to
  T-9). Next: run the e2e once locally in the build slot (view transitions cannot be judged without a
  browser), then CI with `ci:full` for the AC-9 medians.
- 2026-10-25 (finisher): rebased on main; CI's e2e had three red cases on the old head, all test
  defects: the easing compared authored `.3` with computed `0.3` (now read off a probe), the
  `/ar-XB` case had no photograph (dropped, see carry-forwards), and T-9's Playwright route on the
  product document stops Chromium from starting any view transition (T-9 now skips the transition
  in the arm without, no route). Frames at 0 to 320 ms against motion 14 showed square corners and
  a 2 px edge at the end of the flight: the group now clips to `--radius-photo` (checked with the
  same rule injected over the older build: the end frame then equals the rest frame). T-7 added at
  1280 x 800. Ran locally in the build slot against CI's preview build, because a view transition
  cannot be judged without a browser.

## Result

PR 407. Spec 042 idea 1, motion 14: `src/modules/ui/motion/morph.ts`, `Gallery`'s
`<style data-fo-morph>`, motion 14 in `globals.css`, `INTERACTIONS.morph` in
`src/config/interactions.ts`. Tests: unit `interactions-css` (18), `interactions-morph` (8),
`interactions-budget` (3); e2e `photo-morph.spec.ts` (desktop project, 11 cases: T-7 at 1440 x 900
and 1280 x 800, T-8 eight cases, T-9 one). AC-1 row (idea 1): JS 375 B Brotli (cap 400), CSS
199 B Brotli (cap 400), cards 0 B, product page `<style>` 243 B raw (145 B Brotli). AC-9 LCP
medians at 1440 x 900 by card click, local run in the build slot against CI's preview build (load
average about 3): morph on 48 ms, off 44 ms, delta 4 ms (on 120, 48, 52, 48, 48; off 44, 56, 44,
52, 44); CI's numbers are in the e2e job's log on the PR's head (`AC-9 LCP medians`). Local e2e on
that build: 10 of 10 green before the 1280 case was added, then T-7 2 of 2.
