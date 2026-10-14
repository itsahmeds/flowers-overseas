# TASK-196 — Home v3: desktop option A and phone cover 1

Row: `TASKS.md` → TASK-196. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23 clause 1** ("Round-2 picks") and **A24
  clauses 4 (a), 5 and 7**. Owns **AC-46's home half** and re-verifies **AC-10** (the home's
  minimum sections), **AC-24**, **AC-31**, **AC-41** (excluding the photograph cap, A24 clause 5),
  **AC-43** and **AC-48** on `/en-gb`. Tests: **T-51** (home half) and the home cases of T-33,
  T-43, T-45, T-46 and T-53.
- **Founder.** 2026-10-05: "A homepage is good", then "home 1 and product 2". The home extras
  (the next-occasion strip, the three-step row) were rejected: "they feel shit not good at all".
  They are **not** built. The home is exactly option A on desktop and option 1 on the phone.
- **Artboards (PR 189).** `wireframes/home-desktop.dc.html` and `home-mobile.dc.html`, with their
  annotation rows (First screen, Laptop band, Left edges, Phone rules). Match them pixel for
  pixel at 1440 × 900 and 390 × 844, and meet the laptop band at 1280 × 800, 1470 × 830,
  1512 × 860 and 1512 × 945. Options B, C, 2 and 3 are retired.
- **What to build.**
  - **Desktop (option A).**
    - The flat-lay fills the first screen under the chrome. Its block-start is the chrome's
      block-end, it is at least 560 px tall, and its block-end is at or above the viewport's
      bottom edge at 1280 × 800, 1440 × 900 and 1512 × 945 (AC-46).
    - `object-fit: cover` and `object-position: 64% 50%`, so the flowers stay in the crop. This
      image alone is exempt from `--hero-photo-max` (A24 clause 5).
    - One white card on columns 1–5, vertically centred, holding the eyebrow, the H1, the one
      supporting line and, under a rule, the sentence and Continue. Its airmail edge is one of
      A21 clause 2's named places (A24 clause 7).
    - Left edges: the card at x 56 and its text at x 92 at 1440 and 1280.
  - **Phone (option 1, the cover).**
    - The flat-lay is the screen: the header (TASK-195), the cover at `min(703px, 100svh − 141px)`
      (at least 420 px at 360 × 640) and the docked bar together equal the viewport at 390 × 844.
    - The H1 and its line sit on an ink fade at the cover's foot. **Contrast is a unit test:**
      computed over pure white under the fade, the H1 is at least 3∶1 and the line at least
      4.5∶1 (AC-46).
    - The docked bar (TASK-195's AC-48 primitive) holds **Send flowers**, an in-page link to the
      sentence card directly below the fold. With JavaScript off it still works.
  - **Below the fold.** The shipped sections in the round-2 artboard's order and look (Popular
    choices, the dates, the occasions, how it works, the promise, the FAQ, the destinations).
    Their data, states and behaviour are unchanged (A9, A11, A19, A22; AC-10's list is a
    minimum). Only the extras the founder rejected are absent.
  - **Copy.** Shipped strings only (`home.hero.*`, `home.sentence.*`, `finder.submit`,
    `home.trending.*`). No new string.
- **Unchanged.**
  - LCP under 2 000 ms and image transfer ≤ 204 800 B on the four locale homes (AC-24).
    Re-measure them, because the hero changes size: through CI's `lighthouse` job, or in the
    build slot with the load average stated.
  - One `fetchpriority="high"` image and one preload per width (A24 clause 5).
  - Zero new islands: the sentence stays a server-rendered GET form (TASK-177).
  - No literal strings, logical properties, tokens only.
- **Dependencies.** Blocked until **PR 189** merges. After **TASK-177** (PR 174, home v2: the same
  files), **TASK-186** (the frame and tokens) and **TASK-195** (the phone header and the bar).
  TASK-194 (motions 4 and 5) comes after this task.
- **Class.** Keeps the breaker: the Popular choices cards show prices (price display), and the
  page's LCP image and preload change against a blocking budget.
- **Tests** (watch each go red by mutating its subject):
  - **T-51**, the home half (e2e + unit). Red with the photograph capped at `--hero-photo-max`,
    and red with the fade's alpha lowered until the H1 is under 3∶1.
  - **T-53** on `/en-gb` at 390 × 844. Red with the foot padding removed.
  - **T-33, T-43, T-45** home cases re-run (T-33 skips the full-bleed photograph). **T-46**'s
    1280 × 800 home baseline and AC-27's home baselines are re-taken through `ci:full`.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A9, A11, A21 clauses 1–2, A23 clauses
  1 and 9, A24 clauses 4, 5 and 7, AC-10, AC-24, AC-41, AC-46, AC-48
- `docs/design/audits/2026-10-05-round-2.md` (PR 189): the rulings table and "Left edges"
- `docs/codebase-map.md`
- `src/modules/ui/home/` (TASK-177's v2 components), `src/app/[locale]/page.tsx`,
  `src/modules/ui/media/` (the preload)

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-13 (from PR 199, TASK-186 review): the home must sit on `PAGE_FRAME` above 1440 (today
  its content is at x 56 while the logo is at x 92 at wide widths) and join T-33's above-1440
  cases (1512, 1920).
- 2026-10-13 (the sticky-bar ruling): the docked bar appears only after the hero scrolls out where
  a page uses one; on the phone cover the bar is part of the first screen by design (the
  Binding's viewport equation, 65 + 703 + 76), so the home follows the Binding.

- 2026-10-14 (from PR 212 review round 1, nits): `ProofRow.tsx` has a doc-comment line over 100
  columns and one `SentencePicker.tsx` comment line is long (Prettier does not wrap comments).
  The breaker's round-2 list: German and Polish at 320 × 568 and 360 × 640, the consent sheet with
  the popup and the bar at 640 px height, one preload per width on the four locales, a Playwright
  rerun of the e2e mutations it read but could not run.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-13 (to the orchestrator, for TASK-119 / PR 205): the `test.fail` "the language overlay
  never covers the bar's action" (`tests/e2e/home-v3.spec.ts`) is right on this branch and
  **wrong once PR 205 is in**. Checked against `task/TASK-119-language-popup` @ bd8b4e73: the
  popup is `dialog[data-fo-language-popup]`, a top sheet below `md` (`fixed top-0 bottom-auto`,
  `max-h-[260px]`), so at 390 × 844 its box ends by y 260 and cannot meet the bar (y 768 to 844);
  the bottom banner it replaces is deleted. The case's overlay selector now matches the banner
  **or** the open popup, so after PR 205 it cannot "fail as expected" on a missing banner: it finds
  the popup, passes, and Playwright reports the unexpected pass. Whichever of PR 205 and this PR
  lands second deletes the `test.fail` line. **Answered 2026-10-14:** PR 205 merged; after the
  rebase the case starts from `NO_LOCALE_CHOICE` (the config now seeds a returning visitor's
  `fo_locale`), finds the open popup at y 0 to 242 against the action at y 778 to 830, and passes;
  the `test.fail` mark is deleted. Watched red with the dialog forced to the viewport's foot.

## Progress

One line per coherent step, newest last.

- 2026-10-13: carry-forwards recorded; worktree from PR 208's tip (a138275d).
- 2026-10-13 (paused by the founder, WIP): done: option A + phone cover in `HomeHero.tsx`, the bar on `page.tsx`, `--color-cover-fade` token with its unit contrast case (`tests/unit/home-cover-fade.test.tsx`, watched red at alpha 0.4), sections on the frame via `HOME_BLEED`, promise band to the round-2 cards, FAQ on paper-2; measured locally (1280x800 photo 145-800, card x56/text x92 at 1440, 390x844 = 65+703+76). Next: run `tests/e2e/home-v3.spec.ts` and the edited `frame-laptop-band.spec.ts` (home H1 now the title step; home joins T-33 above 1440) in the build slot; `pnpm gates:cheap`; codebase:map; rebase on PR 208's merge; ready + `ci:full` + `visual:baselines`; LCP from CI. Must know: the real desktop chrome is 145 px (artboard 119), so `--home-chrome` is 203/183/145 by breakpoint; the pre-TASK-119 suggestion banner covers the bar at 390 (`test.fail`, owner TASK-119); `docs/design/README.md` needs the difference row (phone line is the whole proposition).

- 2026-10-13 (finisher): codebase map regenerated; the two e2e files run in the build slot on a
  local `next start` of de8d6055 (load 15.9 at build start): `home-v3.spec.ts` 16 passed + 1
  expected failure (the language overlay, see Escalations), after fixing the T-53 text case to skip
  unpainted text (the closed phone menu's help link has a box at y 747 to 791; the case still goes
  red with the foot padding removed, "Cookie settings" under the bar); `frame-laptop-band.spec.ts`
  156 passed, 15 of them expected failures, none a home case (the home joined T-33 at 1512 and
  1920 and passes). `docs/design/README.md` difference row added. `pnpm gates:cheap` PASS.
  Waiting on PR 208's merge for the rebase onto `origin/main`.
- 2026-10-14 (finisher, partial at the time limit): rebased onto `origin/main` 48837dca (PR 206,
  210); map regenerated; baselines the home does not render (dev-components, laptop-country-shop,
  listing-*, product-*) taken from main, the home's kept, the manifest main's plus the home's
  entries. Main's own manifest already mismatches 10 of PR 206's PNGs, so `--verify` stays red
  until the CI re-take. Pushed a2e112f2. `gates:cheap`: six gates exit 0; 12 unit cases timed out
  under load (typecheck took 37 s against 4 s), none in this diff. Next: re-run `gates:cheap`,
  add `visual:baselines` alone, commit its PNGs, toggle `ci:full`.
- 2026-10-14: rebased onto `origin/main` 932c0733 (PR 208, 205, 209 merged); map regenerated. In
  the build slot (load 11.6 at build start): `home-v3`, `frame-laptop-band` and `shell` e2e, 187
  passed and 15 expected failures (none on the home); the language-popup case passes and its
  `test.fail` mark is gone.

- 2026-10-14 (round-1 fixes): review FAIL items and breaker holes 1–3 closed, each watched red.
  The fade's last stop equals `COVER_FADE_RAMP_PX` and the `pt-` padding (unit, on the class;
  e2e, on the computed `background-image`): red at `_220px`, `_400px` and `pt-[40px]` (unit) and at
  `_220px` (e2e, a mutated build: stop 220 against padding 96). T-51 at 768 × 1024, 1024 × 768 and
  1180 × 820: photo top at the chrome's foot, foot inside the viewport, card on the photo; red with
  md `--home-chrome` at 3px (768 × 1024, foot 1028.6). 1024 × 700: the card stays on the photo
  below the header (no spill); the 560 px floor runs past the foot by design. The
  `NON_SINGLE_COLOUR_TOKENS` entry is asserted to name the contrast test: red with it dropped.
  Rebased on f780a389; row `in_review`.

## Result

**Merged in PR 212.** Rebased on `origin/main` (PR 208, 205, 209, 206, 210, 216 merged).

- CI on 9d15de08 (run 38515671336 and its siblings): every job green with `ci:full`.
- LCP in CI's lighthouse, median of 3 (run 38468596768, attempt 2): `/en` 1 969 ms, `/en-gb`
  1 875, `/de` 1 904, `/pl` 1 745, all under the 2 000 ms budget; `/en` is the first URL measured
  (the orchestrator logged the first-URL penalty and the missing `lighthouseci` artifact as
  framework gaps).
- Visual baselines: the whole linux set from `visual-baselines` run 38515671452, `--verify` 106 of
  106 (it also repaired ten manifest entries PR 206 left stale); the home's from run 38461061867
  (59 PNGs, each opened).
- Local e2e in the build slot: `home-v3.spec.ts` 21 passed; `frame-laptop-band` and `shell` 187
  passed with 15 expected failures, none on the home.
- Screenshots (local render): `.claude/state/shots-196/home-desktop-1440x900-final.png`,
  `home-phone-390x844-final.png`, `home-phone-390x844-popup-final.png` (main checkout).
