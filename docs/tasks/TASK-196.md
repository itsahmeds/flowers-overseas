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

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._
