# TASK-287 — The product page links its promise to the guarantee page

Row: `TASKS.md` → TASK-287. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

`/review 270` round 1 (2026-10-19, comment 6270164693), ruling (b) E3: "the orchestrator opens a product-page task row:
the link where `infoPageExists("guarantee", locale)` holds, and a test pinning the PDP promise text equal to the
guarantee's promise sentence." Spec 009 §14 A11 bullet 1: "Where `infoPageExists("guarantee", locale)` is true, it
links to the guarantee page (spec 041)"; spec 041 §6 internal links name the product page as a link in.

- The PDP's fresh-flower promise line links to the guarantee page in each locale where `infoPageExists("guarantee",
  locale)` holds, and renders no link where it does not.
- A unit test pins the PDP promise text (the one message key shared with the guarantee page, spec 009 A11) equal to the
  guarantee page's promise sentence (spec 041 Appendix A.3); red when either changes alone.
- An e2e case: the link's `href` on an `en` product page, and no link in a locale without the page.
- No promise text changes. No new key: the link wraps existing text or reuses a reviewed key.
- **Review class: review-only** (a link and a test); the breaker if the diff changes any promise or legal text.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/009-product-page-date-picker.md` §14 A11; `specs/041-trust-help-legal-pages.md` §6, AC-16
- `docs/tasks/TASK-182.md` (what PR 270 ships: `infoPageExists`, the guarantee page)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-182 (PR 270) merges. Product page: never beside TASK-286, TASK-128, TASK-129 or TASK-249.

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
