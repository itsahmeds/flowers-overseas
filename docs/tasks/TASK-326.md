# TASK-326 — Spec 004 home sentence listbox

Row: `TASKS.md` → TASK-326. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-326`; keep it current by editing this file, not the row.

## Binding

Spec 004 §14 A-founder-2026-10-21d (the end of §14; PR 317), design `home-sentence-listbox-*` (PR 321). Approved 2026-10-21 on the founder's choice "Our own dropdown on desktop. (Recommended)"; §13 Q1 and Q2 on their defaults. Dispatch only after TASK-244 (PR 253) and PRs 317 and 321 are merged.
- **ACs owned:** AC-60 to AC-71; tests T-65 to T-77. AC-6, AC-24 and AC-55 are extended by this amendment and re-verified here.
- **Review class: review-only** (CLAUDE.md DoD 4: presentation; no money, orders, payments, dates, auth, migration or legal text).
- **Design:** `docs/design/wireframes/home-sentence-listbox-desktop.dc.html` and `-mobile.dc.html`, the "Sentence listbox" states in `docs/design/system/components.dc.html`, the open and close row in `docs/design/system/motion.dc.html` (motion 10); where an artboard and the spec differ on a token or size the artboard wins and the brief records it.
- The server HTML does not change (AC-60): exactly three `<select>`s, no `role="listbox"`, no trigger. The native select stays in the form and layout, `visibility: hidden` once enhanced; the trigger overlays its box. Fine pointer only: `(hover: hover) and (pointer: fine)`, built and torn down on change.
- The chunk is in TASK-244's deferred set, at most 3,072 B Brotli, the A1 script budget not raised; if the home cannot take it, escalate with the measured number (§13 Q2), never trade it.
- No new message key (clause 4). Panel tokens as clause 10; escape the hero card's `overflow: hidden` with the top layer or a portal and record the choice here. Visual baselines from CI per the visual runbook.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then §14 A-founder-2026-10-21d (clauses 1 to 14, AC-60 to AC-71, T-65 to T-77), A21 clause 4, A24 clause 9 and A-founder-2026-10-15b
- `src/modules/ui/home/SentencePicker.tsx`, `SentenceIsland.tsx`, `HomeHero.tsx`, `src/app/globals.css`, the deferred set from TASK-244 (`AfterPaint`)
- `tests/e2e/home.spec.ts` L369 and L435 to L465, `tests/e2e/home-round2.spec.ts` L63, `tests/a11y/home.spec.ts` L72 to L80, `tests/support/layout-shift.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** focusing an option must not scroll the page: open the listbox and move focus with `focus({ preventScroll: true })`, because a page scroll closes the listbox (clause 7, AC-64). Test it: `window.scrollY` unchanged after open and after every arrow key (AC-63).
- **From `/plan-tasks` (orchestrator, 2026-10-21):** the e2e helper `chooseSentence(page, field, value)` in `tests/support/` replaces `selectOption` in `tests/e2e/home.spec.ts` and `tests/e2e/home-round2.spec.ts` (and the a11y case); it drives the listbox when the trigger exists and the native `selectOption` when it does not (the `e2e-mobile` project, JavaScript off). No assertion in the moved cases is weakened.

## Decisions recorded here (clause 10, clause 11, the brief's own asks)

- **Numbering.** PR 317 renumbered this amendment: AC-60 to AC-71, T-65 to T-77 (the row above
  still reads AC-58 to AC-69 until PR 317 merges). Code, tests and the PR use the new numbers.
- **The panel escapes the hero card through the top layer** (clause 10's choice): a
  `popover="manual"` element placed from the trigger's rectangle with `inset-inline-start` and
  `inset-block-start` through the CSSOM. Manual, not auto: an auto popover's light dismiss closes
  on the trigger's own press and the click then reopens it, so every dismissal of clause 7 is
  handled in `sentence-listbox.ts`. Without the popover API the native selects stay.
- **When the chunk loads** (clause 11, §13 Q2). The sentence's chunk was already an interaction
  island (TASK-244: first pointer press, focus or input on `#send`). A mouse needs the listbox on its
  **first** click, so the control-bound wait also starts on `pointerover` (`CONTROL_INTERACTION_EVENTS`
  in `paintSignal.ts`): §13 Q2's "first pointer movement over the sentence". It stays out of every
  page load nobody touches, so `ON_INPUT_CHUNK_MARKERS` (PR 363) already excludes it by the
  existing `fo:deferred:home-sentence` marker, and the A1 budget is not touched. Paint islands do
  not listen for it. Bundled size: 2,305 B Brotli with esbuild's minifier for the island plus the
  listbox (cap 3,072 B); CI's `deferred-chunks` spec measures the real chunk.
- **The type-ahead's collator.** `fo/no-adhoc-intl` allows `Intl.*` only in
  `src/modules/i18n/format.ts` and `collate.ts`, and `collate.ts` reads the locale registry (zod and
  the locale tables), which must not reach a 3 KB client chunk. ECMA-402 defines
  `String.prototype.localeCompare(that, locales, options)` as `new Intl.Collator(locales,
  options).compare`, so `collatorCompare(locale)` uses it with `sensitivity: "base"`;
  `tests/unit/sentence-listbox-model.test.ts` holds it equal to `Intl.Collator` for en, pl and de.
- **A chunk that fails** renders nothing (the loader catches the import), so the native selects
  serve the reader (AC-69) instead of a rejected import reaching the route's error boundary.
- **Artboard over spec text.** The trigger's focus ring takes `outline-offset: 2px` and
  `--radius-md` (components sheet, "The trigger"); the panel takes the artboard's normal tracking
  (`letter-spacing: normal`), not the sentence's `-0.015em`. The artboard's options look wider
  than the page's: its Fraunces is the variable font at automatic optical size, the site ships the
  static opsz-144 subsets (fonts are outside this task).
- **New dev dependency:** `jsdom` (T-66 asks for a jsdom unit test; the repo had none).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: model, controller, island wiring, CSS and unit tests (T-66, T-68, T-72/T-73 unit
  halves) green; 22 unit mutations each red. Checked in a static Chromium harness (real server
  HTML, compiled CSS, real fonts): closed state 0 differing pixels at 1440 and 1280, boxes equal,
  motion 10 exact, keyboard and RTL as specified.
- 2026-10-24: e2e (`tests/e2e/home-sentence-listbox.spec.ts`), a11y, visual and pseudo-RTL cases,
  `chooseSentence` in `tests/support/sentence.ts`; home specs moved to it. Next: CI on the head SHA,
  Linux baselines through the `visual:baselines` label.
- 2026-10-24: first CI run (74edf0a4): a11y, build, unit green; e2e found a real defect (a scroll
  event landing a frame after the opening press closed the panel; now closes only if the page
  moved) and three test faults (`/pl` field order, minified easing, pixel parity held to the
  visual threshold). Linux baselines committed from run 40079739301.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 388. On a fine pointer the home sentence's three choices open our own listbox
(`src/modules/ui/home/sentence-listbox.ts`, model in `sentence-listbox-model.ts`, CSS in
`src/app/globals.css`), loaded in the sentence's existing on-input chunk (2,305 B Brotli with
esbuild for island plus listbox; the CI `deferred-chunks` spec asserts at most 3,072 B on the four
homes); the A1 budget is not touched. Tests: unit 18 (model) + 34 (controller, jsdom) + 9 (CSS) +
2 (deferred set); e2e 31 cases in `tests/e2e/home-sentence-listbox.spec.ts` plus the chunk size in
`deferred-chunks.spec.ts` and the home specs moved to `chooseSentence`; a11y 2; visual 1 test with
2 new baselines; pseudo-RTL 1. No local `next build`: the browser checks ran in a static harness
inside the build slot (real server HTML, compiled CSS and fonts) and on CI.

Carry-forwards: none owed by this task. For the founder, outside it: the site's Fraunces is the
static opsz-144 subset, so the artboards' option rows look wider than the page's.
