# TASK-278 — The all-A answers drawn into their owning artboards

Row: `TASKS.md` → TASK-278. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Founder 2026-10-19: "A ship, approve batch 5, C A, all A" (TASK-252's eight judgments, option A each) and "yes yes"
to the 19d consent ruling. `docs/design/README.md` "Answered" says: on an answer "the picked option is drawn 1:1 into
the owning artboard, and `/plan-tasks` makes the row"; until then no implementer builds from the qa-judgments sheets.
This task is that redraw, so TASK-281 to TASK-286 have a design source.

- **7A (spec 004 §14 A-founder-2026-10-19b clause 5):** redraw the card in `system/components.dc.html` and the listing
  artboards `country-shop-*`, `country-category-*`, `country-occasion-*`, `category-hub-*`, `occasion-hub-*`: one price
  with "Includes VAT and delivery", no equivalents line, the example label once per all-example grid (on the count
  line's row from `md`, between the count line and the first row below `md`), the hubs' per-card no-price line gone.
- **2A, 3A, 6A (A-founder-2026-10-19c clause 6):** the settings fold, the open phone Menu with its scrim and close
  mark, Send flowers closing it, and the short-screen chrome (under 500 px tall: header not sticky, no action bar,
  home cover capped) into `chrome-desktop`, `chrome-mobile` and `system/components.dc.html`'s consent sheet.
- **19d (A-founder-2026-10-19d clause 7):** the first-visit chrome with neither overlay and the panel opened from the
  footer replace 1A's 260 px sheet in `chrome-*` and the consent sheet; reference `wireframes/consent-compact-*` (PR 282)
  for the compact banner rather than redrawing it.
- **5A:** `home-mobile`'s Popular choices as one sideways-scrolling row (spec 004 AC-49).
- **8A:** `product-*`'s add-ons as a plain ruled price list (spec 009 AC-23 as rebound by A-founder-2026-10-14c).
- New wording stays a `[slot]` for the founder's copy batch. No em dash anywhere.
- Mark README rows 1 to 8 "drawn into the owning artboard" with the file names.
- **Review class: review-only** (docs/design only).
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `docs/design/README.md` ("Answered: the QA judgments of 2026-10-18")
- `docs/design/wireframes/qa-judgments-2026-10-18-{desktop,mobile}.dc.html` (option A of items 1 to 8)
- `docs/design/wireframes/consent-compact-{desktop,mobile}.dc.html`
- `specs/004-design-system-layout.md` §14 A-founder-2026-10-19b, -19c, -19d (clause 7)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** first in the queue: TASK-281, TASK-282, TASK-284, TASK-285 and TASK-286 depend on it.

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
