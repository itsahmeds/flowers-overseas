# TASK-281 — The compact consent banner and the settings fold

Row: `TASKS.md` → TASK-281. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19d clause 4 ("The compact form ... Who builds it. A-founder-2026-10-19c's build row,
which takes this clause in place of clause 1's 260 px sheet and already waits for TASK-251's copy approval. If that
row does not exist, the orchestrator makes one. It merges before any category is switched on") and A-founder-2026-10-19c
clause 2 (the settings fold).

- **ACs owned:** AC-17 (c) (below `md` top edge at y 0, at most 140 CSS px at 390 × 844 and 360 × 640 in `en` and
  `en-gb`, the three answers' tops within 1 px; from `md` the 420 px card, 32 ± 1 px insets), AC-20's disclosure,
  height and Save clause (closed disclosures; at most 780 CSS px with Save in view at 390 × 844; at most viewport
  minus 64 px from `md`), AC-27's compact re-take. Tests T-19 (c), T-22 (disclosure half), T-29 (banner baseline).
- **Blocked on founder copy (the only blocker once TASK-279 merges):** the banner's one short line; the fold's
  disclosure label and the locked switch's word (TASK-251's consent batch, drawn as `[slot]` "The cookies in this
  group" and "Always on"); the controller sentence (`company.controller`, no key in `messages/en.json`). No key ships
  before the founder approves its text (spec 003 A17). `consent.essentialLocked`'s two em dashes go in the same batch.
- **Reading (19d clause 4):** the line links to the cookie notice and the controller sentence moves into the panel
  (spec 041 §14 A-founder-2026-10-19d; spec 041 AC-29 and T-31 stay TASK-183's, which renders the sentence in this
  panel). Overrulable by the founder in one word.
- Design: `wireframes/consent-compact-*` §3 and §4, and TASK-278's consent sheet in `system/components.dc.html`.
- **Review class: keeps the breaker** (consent text, compliance).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-19c clause 2, A-founder-2026-10-19d clause 4
- `docs/design/wireframes/consent-compact-{desktop,mobile}.dc.html`
- `docs/tasks/TASK-251.md` (the consent copy batch)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-279 (same consent island; never beside it) and TASK-278. Status `blocked` on the founder's copy
  only; set `todo` when the founder approves the batch and the record lands.

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
