# TASK-283 — The four missing motions: 3, 5, 10 (close) and 13

Row: `TASKS.md` → TASK-283. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A24 clause 9: all thirteen motions of `docs/design/system/motion.dc.html` are approved (founder,
2026-10-05); (e) "Built now: motions 1, 3, 4, 5, 6, 7, 10, 11, 12 and 13". Founder 2026-10-19 "fix and do all this
tooo" (motions 3, 5, 10, 13) and 2026-10-20 "You are also fixing animation and everything". TASK-194 (PR 221) left
these gaps (its brief, Carry-forwards and Result):

- **Motion 3, every primary action** ("Where: Every primary action"): built today on the sentence's Continue only. Give
  every primary submit or navigation action the pending state: label kept, arrow replaced by the 22 px bloom, width
  fixed, `aria-busy="true"` and `disabled` from press until the next page paints; reduced motion keeps the arrow. Motion
  6's exclusions do not apply here; name in the PR every primary action covered and any left out with its reason.
- **Motion 5:** the sunflower underline drawing under "far away." in the home H1, once, 500 ms after load,
  `stroke-dashoffset` on an inline SVG, `--duration-draw` 600 ms, `--ease-emphasised`; drawn from the start under
  reduced motion; the H1 text never moves. Attach to `#hero-heading em[data-fo-em]` (on main since TASK-231): no
  message change.
- **Motion 10, the close half:** fade and 8 px rise out (`--duration-base`), the phone sheet sliding back to its edge
  (`--duration-slow`), the scrim fading out, for the phone Menu (with TASK-282's scrim) and the consent panel (TASK-279);
  reduced motion: fade only, 120 ms or less. TASK-194 did not build exits "because `display`/`overlay` transitions are
  outside AC-44": build them within AC-44's property list (`transform`, `opacity`; for example hold the open state until
  `transitionend`), or escalate with the reason. The language popup never opens on today's data (TASK-280).
- **Motion 13:** the 404's route draws once, 1,200 ms (`--duration-bloom`), `--ease-standard`, a mask path unrolling
  over `noticeShell.ts`'s static dashed route (TASK-191); drawn from the start under reduced motion.
- **Limits (AC-44, AC-6 as A24 clause 9 reads them):** CSS and inline SVG; `transform`, `opacity` and, on an inline SVG
  path, `stroke-dashoffset` only; nothing on the LCP element or its ancestors; CLS 0; no loader on a first load; the
  motion module stays inside AC-25's budgets (131,072 B; 133,120 B on the product page) and in TASK-244's deferred set.
  Print the module's Brotli delta in the PR.
- **ACs:** AC-44 and AC-6 re-verified (T-48, T-06) with a red case per new motion (each motion removed or made to
  animate a forbidden property turns its case red).
- **Review class: review-only** (motion presentation).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `docs/design/system/motion.dc.html` (motions 3, 5, 10, 13 and the Binding block)
- `specs/004-design-system-layout.md` §14 A24 clause 9; AC-44, AC-6
- `docs/tasks/TASK-194.md` (Carry-forwards, Result: what exists and why)
- `src/modules/ui/motion/MotionIsland.tsx`, `src/app/globals.css` motion block, `tests/e2e/motion.spec.ts`,
  `tests/unit/motion-css.test.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-277 (PR 285, the motion 6 block), TASK-244 (PR 253, the deferred set), TASK-282 (the Menu scrim)
  and TASK-279 (the consent panel from the footer). Same frontend agent as TASK-282.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 221 HOLE 5b (the `defaultPrevented` guard's Playwright mutation) stays TASK-244's.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-20 (implementer): built in a scratch sandbox while the row waited for PR 288 (the edit guard refused `src/`); local build inside the build slot: new e2e 28 passed, related suites 381 passed; built-chunk mutations went red (Menu hold, consent hold, link pending).
- 2026-10-20 (implementer): applied on 642b5655 (no drift), cheap gates PASS, PR 299 opened. Next: CI `ci:full`, then the `visual:baselines` run for the home stills (the underline now shows).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 299. Motion 3 on every primary action (`Button` marks every `primary`/`accent` link or submit; `MotionIsland` gives a marked link `aria-busy` + `aria-disabled` and plays its bloom instead of motion 1's); motion 5 (the home H1 underline, inline SVG in `#hero-heading [data-fo-em]`, no message change); motion 13 (a paper cover over the 404 route, `pathLength` 1, unrolling once); motion 10's close half for the phone Menu and the consent sheet (`data-fo-closing`, held until the transition ends; the Menu scrim fade-out stays TASK-282's). Covered and left-out primary actions, with reasons, are in the PR body. Bytes (Brotli, esbuild, module alone): `MotionIsland` 691 to 852 B (+161), `ConsentBannerIsland` 1,278 to 1,391 B (+113); motions 5 and 13 are CSS only.

Tests: unit `motion-css.test.ts` (value-for-value + 12 mutations + AC-44 scan), `motion-markup.test.tsx` (+12), `ui-home.test.tsx` (headline regex); e2e `motion.spec.ts` sections 9 to 12 (16 cases x 2 projects). A local build, `next start` and Playwright ran inside the build slot (load 15 to 18) because the closes and the link pending state are browser behaviour that only goes red against a build (each mutation patched the built chunk).

```
gates:cheap · 642b56555b66cfd6a2242b2985724ca7583d89be · tree DIRTY · base origin/main · 2026-10-20T16:58:53.757Z
typecheck             exit 0 · 12.8 s
lint                  exit 0 · 22.2 s
format:check          exit 0 · 12.4 s
i18n:check            exit 0 · 0.8 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 44.9 s · changed 110 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```
