# TASK-326 — Spec 004 home sentence listbox

Row: `TASKS.md` → TASK-326. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-326`; keep it current by editing this file, not the row.

## Binding

Spec 004 §14 A-founder-2026-10-21d (the end of §14; PR 317), design `home-sentence-listbox-*` (PR 321). Approved 2026-10-21 on the founder's choice "Our own dropdown on desktop. (Recommended)"; §13 Q1 and Q2 on their defaults. Dispatch only after TASK-244 (PR 253) and PRs 317 and 321 are merged.
- **ACs owned:** AC-58 to AC-69; tests T-63 to T-75. AC-6, AC-24 and AC-55 are extended by this amendment and re-verified here.
- **Review class: review-only** (CLAUDE.md DoD 4: presentation; no money, orders, payments, dates, auth, migration or legal text).
- **Design:** `docs/design/wireframes/home-sentence-listbox-desktop.dc.html` and `-mobile.dc.html`, the "Sentence listbox" states in `docs/design/system/components.dc.html`, the open and close row in `docs/design/system/motion.dc.html` (motion 10); where an artboard and the spec differ on a token or size the artboard wins and the brief records it.
- The server HTML does not change (AC-58): exactly three `<select>`s, no `role="listbox"`, no trigger. The native select stays in the form and layout, `visibility: hidden` once enhanced; the trigger overlays its box. Fine pointer only: `(hover: hover) and (pointer: fine)`, built and torn down on change.
- The chunk is in TASK-244's deferred set, at most 3,072 B Brotli, the A1 script budget not raised; if the home cannot take it, escalate with the measured number (§13 Q2), never trade it.
- No new message key (clause 4). Panel tokens as clause 10; escape the hero card's `overflow: hidden` with the top layer or a portal and record the choice here. Visual baselines from CI per the visual runbook.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then §14 A-founder-2026-10-21d (clauses 1 to 14, AC-58 to AC-69, T-63 to T-75), A21 clause 4, A24 clause 9 and A-founder-2026-10-15b
- `src/modules/ui/home/SentencePicker.tsx`, `SentenceIsland.tsx`, `HomeHero.tsx`, `src/app/globals.css`, the deferred set from TASK-244 (`AfterPaint`)
- `tests/e2e/home.spec.ts` L369 and L435 to L465, `tests/e2e/home-round2.spec.ts` L63, `tests/a11y/home.spec.ts` L72 to L80, `tests/support/layout-shift.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** focusing an option must not scroll the page: open the listbox and move focus with `focus({ preventScroll: true })`, because a page scroll closes the listbox (clause 7, AC-62). Test it: `window.scrollY` unchanged after open and after every arrow key (AC-61).
- **From `/plan-tasks` (orchestrator, 2026-10-21):** the e2e helper `chooseSentence(page, field, value)` in `tests/support/` replaces `selectOption` in `tests/e2e/home.spec.ts` and `tests/e2e/home-round2.spec.ts` (and the a11y case); it drives the listbox when the trigger exists and the native `selectOption` when it does not (the `e2e-mobile` project, JavaScript off). No assertion in the moved cases is weakened.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
