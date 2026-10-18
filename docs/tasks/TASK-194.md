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

- **From the orchestrator (2026-10-18):** TASK-244 now lands before this task. When this task merges, add the motions module to TASK-244's declared deferred set in `src/modules/ui` and extend its unit test (spec 004 A-founder-2026-10-15b clause 2); the motion chunk must load after the LCP paint (clause 1).

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
- 2026-10-15, to the orchestrator: **AC-55 (spec 004 §14 A-founder-2026-10-15b, PR 237, not yet on main) for the motion module is more than a small change, so it is left to TASK-244.** Today `MotionIsland` is a static `"use client"` import in `SiteHeader`, so its 691 B (Brotli) load with the layout's client references at hydration, before or around the LCP paint; nothing defers it today. Building to AC-55 means: splitting it into its own chunk behind a small eager loader (`next/dynamic` or `import()` on `requestIdleCallback` after the LCP entry, or on first interaction); honouring a tap before it loads (motion 10's `Esc` for the Menu, AC-47, and motion 3's submit listener live in it, and the clause asks that such a tap still works); the one declared deferred set in `src/modules/ui` with its unit test; and T-60's resource-timing e2e. Each of those is new code and a new test, and the loader costs bytes inside a budget this module only just fits (main 130,528 B; the motions were measured at +816 B in the chunk before the slimming). Nothing in this PR makes AC-55 harder: the module renders nothing, the server HTML carries no motion state, and every motion that hides content waits for the module's mark. Answer: open.
- 2026-10-18, to the orchestrator (for the founder): **the motion module does not fit AC-25's script budget on the product page.** CI run 39073507362 on 5fc585a5 (base 83c8e777): `/en/poland/flowers/roses` and `/en-gb/poland/flowers/roses` transfer 131,454 B of script (Brotli) against 131,072 B; main at 83c8e777 (run 39072813203) transfers 130,950 B on the same URLs, so the motions add 504 B and main leaves 122 B of room. Every other URL fits (130,603 B against main's 130,099). The run on 2253c203 (38696262638) measured the same 131,454 B, so the slimmed 691 B module never fitted the product page. Cutting 382 B Brotli from a 691 B module that carries motions 1, 3, 4, 10's `Esc`, 11 and 12 means dropping motions, not trimming them. Options: (a) ship a subset now (for example the CSS-only motions 5 to 7 and 10's opening, with the script motions 1, 3, 4, 11, 12 waiting for TASK-244's deferral or a budget ruling); (b) TASK-244's AC-55 split first, if a chunk loaded after LCP is outside what `resource-summary` counts; (c) the founder raises the budget (the brief forbids this task from doing so). Row set `blocked`. Answer (founder, 2026-10-18, spec 004 §14 A-founder-2026-10-18a and spec 009 §14 A-founder-2026-10-18a, landed by PR 239): **(c) for the product page**: product pages get 133,120 B, every other page keeps 131,072 B, and the listings stop loading the product island. This task measures against those two budgets once PR 239 is on main.

## Progress

One line per coherent step, newest last.

- 2026-10-14 (paused by the founder): PR 221 (draft). Done: the two tokens in both files; `MotionIsland` (one null-rendering client module in `SiteHeader`) plus CSS in `globals.css` for motions 1 (header bloom + bar), 3 (Continue `pending`), 4 (shimmer), 6 (pill press, `transition-colors` removed everywhere, `@source not inline("transition")`), 7 (tier/date ring), 10 (popup, menu, consent entry via `@starting-style`), 12 (home sections); unit tests `motion-css.test.ts`, `motion-model.test.tsx` green, full unit suite green. Next: escalate motion 5 (the H1 has no split around "far away"; marking it is a message change in every locale, outside the fence); after PR 214 merges, rebase and do 6 (cards) and 11 (`MediaAsset` `data-fo-fade`); e2e for T-48/T-06 (no loader on first load/reload/JS-off/`?page=2`, LCP ancestors, CLS, reduced motion, motion 12 first viewport); client-JS budget build; screenshots; README difference rows (360/250/1600 ms literals drawn, tokens built; exit animations not built because `display`/`overlay` transitions are outside AC-44); the `pdp-bar-reveal` `visibility` keyframe exception named in the scan, for the reviewer.
- 2026-10-14 (resumed): rebased on 37ba0489 (PR 214). Motion 6 on `ProductCard` (`data-fo-card-motion`, never the priority card) and motion 11 on `MediaAsset` (`data-fo-fade` on every non-priority image); `tests/e2e/motion.spec.ts` (every Binding limit, with mutation cases); README difference row; motion 5 escalated. Cheap gates green (map regenerated). The local build could not finish: load average 158, product pages timed out at 60 s (not this diff); slot released. Next: CI `ci:full` runs the e2e and `budget:client-js` (print the module's Brotli bytes in the PR), then `visual:baselines`.
- 2026-10-15 (CI run 38601568506 on 5a74795a): Lighthouse script 131,344 B on the two `/flowers/roses` URLs (budget 131,072; main 130,528, so the motions cost 816 B in the chunk). Fixed without raising the budget: `MotionIsland` rewritten for bytes (no `motion-model.ts`, no reduced-motion check in JS: the CSS media query is the gate), and `MenuEscape` folded into it (one island where there were two). Brotli of the module on its own (esbuild, minified): 1,001 + 214 (`MenuEscape`) = 1,215 B before, 691 B now, so +477 B over main before chunk sharing. Per motion, measured by removing each part: 1 bloom 109 B, 3 pending 76 B, 4 shimmer 68 B, 10 Esc 47 B (was the separate 214 B `MenuEscape`), 11 + 12 fade and reveal 161 B, plus about 230 B of React hook and module wrapper. Motions 5, 6, 7, 10 (opening) are CSS only (0 B). The e2e failures were mine: the popup, consent and bar tests measured boxes mid-opening. `playwright.config.ts` now runs every suite with `reducedMotion: "reduce"` (at rest); `motion.spec.ts` opts back in. The motion spec's navigation and pending-button cases now click through the DOM, because Playwright's `click()` waits for the held navigation to commit.
- 2026-10-15 (finisher, run 38631900547 on 6044ff81 red in e2e and a11y): rebased on main (map regenerated). Causes: (1) the global `reducedMotion: "reduce"` turned on the base layer's 0.01 ms collapse for every element, and with `transition-property` defaulting to `all` that made every style change a transition, so `frame-laptop-band` T-45's font-size probe read its first value nine times over; and the consent sheet's 120 ms reduced fade raced axe (color-contrast on the shop, category, hub, product and 500 pages). Removed: e2e and a11y now run with the motions on; only the two screenshot projects take stills with `reduce` (a full-page shot scrolls nothing, so motion 12 would leave sections at opacity 0). (2) `motion.spec` waited on locators, which wait for the held navigation to commit, so the loader and the pending button were read on the next document: both are now read from inside the page. (3) The reduced case asserted the module's attributes, which it now sets in both modes: it asserts computed styles (opacity 1, no transform, no shimmer) instead. (4) `tests/support/at-rest.ts`: `motionsSettled` (finite motions on the document clock end) for the popup's shape tests, `atRest` (hydrated, scrolled through, settled) before axe. (5) On a phone with a sticky action bar the consent sheet fades without rising, so it never passes over the bar's action (AC-48, T-53; design README row (h)).
- 2026-10-15 (finisher, run 38691919334 on c82f379f: e2e, a11y, visual green; a11y 6 flaky, e2e 1 flaky): the a11y flakes were the consent sheet's fade again, on suites not yet waiting (home, media, shell) and on `/en/boom`, where `motionsSettled` ran before the lazily loaded consent island had rendered. `atRest` now waits for `networkidle` first (no longer for the module's mark, so it serves the root `not-found` and the global 500 too); the shell, media and consent audits use it. `tests/a11y/home.spec.ts` is PR 230's file and is left alone (carry-forward). The e2e flake, `shell.spec` "`/` without JavaScript" on the phone, failed its first try on both runs of this branch with motions on and on no other branch: Playwright's click waited for the Menu link to be stable while motion 10 dropped the panel in, and never resumed. The test now waits for the panel's opacity 1 and no transform before it clicks.
- 2026-10-15 (finisher, session closing): run 38696262638 on 2253c203: every job green (e2e 1,796 passed, 0 flaky; a11y 104 passed, 1 flaky in `tests/a11y/home.spec.ts`, PR 230's file, which does not yet call `atRest`; visual green with no baseline change) except `lighthouse`, still running at hand-off. Head is now d949eb16 (docs only: the AC-55 escalation), CI re-fired. Next: read `lighthouse` and the run on d949eb16; if green, set the row `in_review` and fill `## Result`; then `/review` and `/break`. A replacement must know: no `reducedMotion` in the shared config (only `visual`/`pseudo-rtl` take stills with `reduce`); suites that measure an overlay or run axe call `tests/support/at-rest.ts`; home.spec's audit should call `atRest` once PR 230 merges (carry-forward); AC-55 deferral is TASK-244's (Escalations).
- 2026-10-18 (finisher): rebased on 67ac748d (PR 237), then on 83c8e777 (PR 225, the map's only conflict, regenerated at each step); the only conflicts were `docs/design/README.md`'s difference table (main's two 2026-10-15 rows kept, this branch's TASK-194 row kept once, at its latest text); map regenerated with `pnpm codebase:map` (no change). Cheap gates: typecheck, lint, format, i18n, no-db, map exit 0; the unit run hit 5 s timeouts at load average 77 to 136 in eight files (five on the second base, all passing with the longer timeout) this diff does not touch, and those eight pass with `--testTimeout=60000` (209 tests, exit 0). Row `in_review`; CI re-fired with `ci:full` on the new head. Next: `/review` and `/break`.
- 2026-10-18 (finisher): CI run 39073507362 on 5fc585a5: everything green except `lighthouse` (script 131,454 B on the two product URLs against 131,072, escalated; LCP `/en` 2,011 ms, the known flake) and `a11y` (`tests/a11y/home.spec.ts`, PR 230's file: `/en` color-contrast failed on both tries, `/en-gb` flaky; 103 passed). Stopped per the brief's budget clause; row `blocked`.
- 2026-10-18 (finisher 3): rebased on 8befcd62 (one hand conflict, `tests/e2e/shell.spec.ts`: main's `/en-gb` link kept, this branch's wait for the Menu panel to land kept; map regenerated). Cheap gates PASS on 5ffd61b9. Measured inside the build slot (load average 12 to 6) with `budget:client-js` on a throwaway merge of this head and PR 239's head 01a6ff7a (two conflicts, resolved as the rebase will: `globals.css` drops the `pdp-bar-reveal` block PR 239 removes and keeps the motions; `DateChip` keeps both `data-fo-ring` and `data-fo-date-muted`): every non-product URL 126,802 B against 131,072 (PR 239 alone 126,297, so the motions add 505 B), both product URLs 127,839 B against 133,120 (PR 239 alone 127,334). Next: when PR 239 merges, rebase, drop the dead `pdp-bar-reveal` exception from `motion-css.test.ts`, push, re-fire CI.
- 2026-10-19 00:10 (finisher 3, stopped by the coordinator at the usage cap): rebased on 072d9181 and pushed; no CI fired on this push (ready and labelled) and none should run until PR 239 is on main. PR 239 still open (PASS, HOLDS, CI green on 01a6ff7a, unmerged at 00:08). Next: when it merges, rebase; resolve `src/app/globals.css` by dropping the `pdp-bar-reveal` block (PR 239 removes it) and keeping the motions, and `src/modules/ui/product/DateChip.tsx` by keeping both `data-fo-ring` and `data-fo-date-muted`; remove the dead `pdp-bar-reveal` entry from `KEYFRAME_EXCEPTIONS` in `tests/unit/motion-css.test.ts`; cheap gates; push; toggle `ci:full`; set the row `in_review`. PR 253 (TASK-244) still open: its `deferredSet.ts` reserves `motions` for this task and it edits `MenuEscape.tsx`, which this branch deletes (folded into `MotionIsland`), so whichever lands second resolves that.
- 2026-10-19 (finisher 3, resumed): rebased on e6958197 (PR 239 merged): `globals.css` drops the `pdp-bar-reveal` block and keeps the motions, `DateChip` keeps `data-fo-date-muted` and `data-fo-ring`; the dead `pdp-bar-reveal` entry left `motion-css.test.ts` (watched red: that keyframe with `visibility` put back in the stylesheet fails the scan). Cheap gates: six exit 0; tests exit 1 only on two 5 s timeouts at load average 110 (`product-route`, `url-pii`), both green with `--testTimeout=60000` (23 tests, exit 0). Row `in_review`; CI re-fired with `ci:full`.

## Result

PR 221. Motions 1, 3, 4, 6, 7, 10, 11 and 12 built as one null-rendering client module (`src/modules/ui/motion/MotionIsland.tsx`, 691 B Brotli on its own, `MenuEscape` folded in, AC-25's budget not raised) and CSS in `src/app/globals.css`; the two tokens in both files. Motion 5 moved to the home-conformance task, 13 to TASK-191; 2, 8 and 9 wait for their triggers; AC-55 for this module is TASK-244's (Escalations).

- **AC-44 / T-48:** `tests/unit/motion-css.test.ts` (12 cases: keyframe and transition-property scan, red with a `height` keyframe; start states gated by `html[data-fo-motion]`; both tokens; no `loading.*`; no animation library, canvas or video) and `tests/e2e/motion.spec.ts` sections 1 to 5 (no loader on first load, reload, JS off, `?page=2`; the bloom on a held navigation; LCP element and ancestors still, red with a fade on the hero; CLS 0; motion 12 never in the first viewport; motion 3 width, `aria-busy`, `disabled`, `pageshow`).
- **AC-6 / T-06 (reduced motion):** `tests/e2e/motion.spec.ts` section 6, opacity of 120 ms or less only, with a non-vacuous control and the red case at 300 ms.
- `tests/unit/motion-markup.test.tsx` (4): the pending button's markup and the press scale.
- **Budget (spec 004 §14 A-founder-2026-10-18a, AC-56; spec 009 AC-37).** `budget:client-js` on a build of this branch merged with PR 239 (build slot, load average 12 to 6): every non-product URL 126,802 B against 131,072 (the motions add 505 B), both `/poland/product/amber-hour` URLs 127,839 B against 133,120. Lighthouse on the head is in the PR.
- The `pdp-bar-reveal` visibility exception left the stylesheet scan with the keyframe (PR 239); the scan now allows only transform, opacity and stroke-dashoffset.
- No local e2e or Lighthouse run: CI is the gate of record. CI on the head SHA is recorded in the PR.
