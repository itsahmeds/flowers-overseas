# TASK-194 — Motion: the approved loading bloom and flower micro-animations

Row: `TASKS.md` → TASK-194. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23 clause 11** as amended by **A24 clause 9**.
  Owns **AC-44** (as A24 amends it) and the reduced-motion reading of **AC-6**; tests **T-48** (as
  amended) and the **T-06** reduced-motion case.
- **Founder.** 2026-10-05, on the thirteen drawn motions: "i like the animations... they are good
  approve them" (decisions log, 2026-10-05). A24 is approved by the orchestrator on the founder's
  delegation; the founder confirms on return.
- **Artboard.** `docs/design/system/motion.dc.html` on PR 189. Each cell's Trigger, Tokens,
  Reduced motion and Where rows bind that motion. The canvas loops each motion so it can be
  watched; in the build each plays once per trigger, and only the bloom loops, while it waits.
- **Build now (motions with a Phase 0 trigger):**
  - 1, the route-loading bloom;
  - 3, the pending button;
  - 4, the sentence shimmer, on home A's card;
  - 5, the underline under "far away";
  - 6, card lift, photo zoom and button press;
  - 7, the size selection ring, and the date ring only where dates are live;
  - 10, popup, menu and consent open and close;
  - 11, image fade-in below the fold;
  - 12, sections fading up on scroll;
  - 13, the 404 route drawing once.
- **Not now:** motions **2** (skeletons: no client fetch exists), **8** (petals: no basket) and
  **9** (the confirmation stamp: no confirmation page). Their CSS ships with the task that
  creates their trigger (specs 009 and 010). Do not ship unreachable code.
- **Limits (clause 11 plus A24 clause 9), each tested:**
  - **No loader in front of server HTML.** A first load, a reload, a JavaScript-off load and a
    per-request parameterised listing (`/en-gb/poland/flowers?page=2`) show no loader over
    `<main>`. Motion 1 shows only on a client navigation that has not painted after 150 ms. No
    route-level loading fallback may reach a first-load response.
  - **The LCP element** (the home photograph, each lead or first-card photograph, or the H1 where
    it is the LCP) and its ancestors carry no animation, transition or delay. Motion 5 animates
    the SVG under the words; the H1 text never moves.
  - **Properties.** `transform` and `opacity` only, plus `stroke-dashoffset` on an inline SVG
    path with a fixed `stroke-dasharray` (motions 1, 5, 13). CLS is 0 across every animation.
  - **Reduced motion** (AC-6 as A24 reads it): nothing moves, nothing iterates, and the only
    change over time is an opacity transition of 120 ms or less (motion 10). Every other reduced
    form is static, as its cell says.
  - **Motion 12.** The hidden start state applies only after the module's class is on `<html>`,
    and never to a section that intersects the first viewport at load. Without JavaScript, and for
    crawlers, every section is visible.
  - **Motion 3.** Sets `aria-busy="true"` and `disabled` on press, keeps the button's width, and
    re-enables on `pageshow` (the back/forward cache).
  - **No animation library**, no Lottie, no canvas, no video, no parallax, no auto-carousel.
- **Tokens.** Add `--duration-draw: 600ms` and `--duration-bloom: 1200ms` to
  `src/app/globals.css` and `docs/design/system/tokens.css` in this PR, name for name and value
  for value. Everything else uses the existing duration and easing tokens.
- **JavaScript budget.** One small client module (motions 1, 3, 4's "not touched" check, 12, and
  10's `Esc` where TASK-195 has not already done it). It toggles classes and the
  `aria-busy`/`disabled` states only, with no new dependency. Print its Brotli bytes in the PR.
  AC-25's budget (131 072 B, §14 A1) **is not raised**: if the module does not fit, stop and
  escalate with the numbers.
- **Dependencies.** Blocked until **PR 189** merges. After **TASK-196** (home v3: motions 4, 5),
  **TASK-197** (product v3: motion 7), **TASK-195** (the menu: motion 10), **TASK-191** (the 404
  route: motion 13) and **TASK-119** (the popup: motion 10), because the motions attach to their
  markup. Motions 6, 11 and 12 also touch the listing cards (TASK-187, TASK-188), so dispatch after
  those too, or rebase onto them.
- **Class.** Keeps the breaker. It changes what renders before and after hydration on every page
  (an indexability risk if motion 12's start state leaks), the client bundle against a blocking
  budget, and the LCP element's paint.
- **Tests** (watch each go red by mutating its subject):
  - **T-48** (e2e + unit), as amended:
    - first load, reload, JS-off load and `?page=2` show no loader, and a client navigation shows
      it;
    - the LCP element's computed animation, transition, opacity and transform at first paint;
    - a stylesheet scan of `@keyframes` and `transition-property` for anything but `transform`,
      `opacity` or `stroke-dashoffset`;
    - CLS 0;
    - a dependency scan;
    - the two tokens in both files;
    - motion 12's start state absent in the first viewport;
    - reduced motion.

    Red with a fade-in on the hero image, red with a `height` keyframe, and red with motion 12's
    start state on a first-viewport section.
  - **T-06** (e2e), the reduced-motion case: opacity of 120 ms or less only. Red with motion 10's
    reduced fade at 300 ms.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A1 (the budget), A23 clause 11, A24
  clauses 1 and 9, AC-6, AC-25, AC-44
- `docs/design/system/motion.dc.html` (PR 189), every cell's spec rows
- `docs/codebase-map.md`
- `src/app/globals.css` (motion and duration tokens), `docs/design/system/tokens.css`,
  `scripts/client-js-budget.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-14 (orchestrator, before review): motion 5 → home conformance task, needs `<em>` in
  `home.hero.heading`, founder asked 2026-10-14. The poppy italic phrase in the H1 is also a
  home-vs-artboard finding from the 2026-10-14 QA; that task adds the tag and the underline
  together.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-14, to the orchestrator (for the founder): **motion 5 needs a copy change.** The sheet
  draws the underline under "far away." inside the H1 (`someone <em>far away.</em>`, the italic
  poppy phrase). The shipped H1 is one plain string, `home.hero.heading` = "Flowers for someone far
  away." in `en` (and the same English text in `de` and `pl`), with no tag marking the phrase, so
  the code cannot find "far away" in a locale-neutral way. Building motion 5 needs the message to
  carry a tag, e.g. `Flowers for someone <em>far away.</em>`, in every locale (en, de, pl; en-gb
  inherits), rendered with `t.rich`. That is a change to message text (founder-attested copy) and
  also brings in the italic poppy phrase the sheet draws, which the H1 does not have today. The
  fence forbids changing message text, so motion 5 is skipped. Question: may the four catalogues
  carry that tag (text otherwise unchanged), in this task or a copy task? Answer (orchestrator,
  2026-10-14): **moved**. Motion 5 leaves this task for the home-conformance task, with the tag;
  see Carry-forwards.

## Progress

One line per coherent step, newest last.

- 2026-10-14 (paused by the founder): PR 221 (draft). Done: the two tokens in both files; `MotionIsland` (one null-rendering client module in `SiteHeader`) plus CSS in `globals.css` for motions 1 (header bloom + bar), 3 (Continue `pending`), 4 (shimmer), 6 (pill press, `transition-colors` removed everywhere, `@source not inline("transition")`), 7 (tier/date ring), 10 (popup, menu, consent entry via `@starting-style`), 12 (home sections); unit tests `motion-css.test.ts`, `motion-model.test.tsx` green, full unit suite green. Next: escalate motion 5 (the H1 has no split around "far away"; marking it is a message change in every locale, outside the fence); after PR 214 merges, rebase and do 6 (cards) and 11 (`MediaAsset` `data-fo-fade`); e2e for T-48/T-06 (no loader on first load/reload/JS-off/`?page=2`, LCP ancestors, CLS, reduced motion, motion 12 first viewport); client-JS budget build; screenshots; README difference rows (360/250/1600 ms literals drawn, tokens built; exit animations not built because `display`/`overlay` transitions are outside AC-44); the `pdp-bar-reveal` `visibility` keyframe exception named in the scan, for the reviewer.
- 2026-10-14 (resumed): rebased on 37ba0489 (PR 214). Motion 6 on `ProductCard` (`data-fo-card-motion`, never the priority card) and motion 11 on `MediaAsset` (`data-fo-fade` on every non-priority image); `tests/e2e/motion.spec.ts` (every Binding limit, with mutation cases); README difference row; motion 5 escalated. Cheap gates green (map regenerated). The local build could not finish: load average 158, product pages timed out at 60 s (not this diff); slot released. Next: CI `ci:full` runs the e2e and `budget:client-js` (print the module's Brotli bytes in the PR), then `visual:baselines`.

## Result

_Pending._
