# TASK-136 — Chrome density pass: the home and every listing page spend **377 px** of a laptop viewport on navigation before `main` begins — a utility strip (44 px), the header block with the locale row, logo row and always-expanded search (132 px), and the category row (29 px), plus the finder. Compress the stack against the competitor benchmark in `plan/02` §1/§15 without losing a fact: fold four locale links + the currency chip into one control, collapse search to an icon that expands, and move the honest `datesPending` line out of the highest-value pixels while keeping it crawlable and on the page. **Artboards in `docs/design/` first** (CLAUDE.md, TASK-059) — no page is redrawn from a description. Founder review of the drawings before any code

Row: `TASKS.md` → TASK-136. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-136`; keep it current by editing this file, not the row.

## Binding

- **The measurement this task exists for**, taken 2026-09-18 on the running dev server at
  `/en`, laptop viewport: `main` begins **377 px** down the page. The stack, top to bottom:

  | Band | Height | What is in it |
  |---|---|---|
  | Utility strip | 44 px | `nav.utility.datesPending` ("Delivery dates are not open yet") · help and WhatsApp number |
  | Header block | 132 px | four locale links printed separately (`English`, `English (UK)`, `Deutsch Beta`, `Polski Beta`) + a currency chip · hamburger · wordmark · account · basket · an always-expanded search field |
  | Category row | 29 px | Our selection · Bouquets · Roses · Plants · Occasions |

  Competitor headers in the `plan/02` §1 and §15 study run at roughly half that. 42 % of a laptop's
  first screen is navigation before a visitor sees anything we sell.
- **What may not be lost.** Every fact currently in the chrome stays on the page and stays
  crawlable: the four locales and the currency remain reachable and server-rendered (spec 003, and
  `alternatesFor()` depends on nothing here), the honesty line stays (spec 004 §14 A19 / TASK-120 —
  it may **move**, it may not disappear, and it may not become a claim we cannot keep), and the
  category row's `our-selection` id is fixed by spec 008 AC-9. Nothing here weakens AC-15's ban on
  ratings, reviews, counts or partner names.
- **Three changes to draw and argue**, each optional if the drawing disproves it: fold the four
  locale links and the currency chip into **one** control; collapse the search field to an icon that
  expands (keeping a server-rendered form for no-JS and for crawlers); move the `datesPending` line
  out of the top band into the finder or the trust strip, where it answers a question the visitor is
  actually asking at that moment.
- **Artboards first, and the founder reviews the drawings before any code exists.** `CLAUDE.md`'s
  TASK-059 rule: `docs/design/` is the design source of truth and no page is built from a
  description. Draw the current state and the proposed state side by side so the founder is
  comparing, not imagining. Only after the founder picks does any component change.
- **Sequenced after TASK-080 on purpose.** Until the photographs are committed every image slot is a
  grey placeholder, which is doing a large share of the damage the founder is reacting to. Judging
  density against placeholders would over-correct the layout and then look sparse once the
  photographs land. Re-measure the 377 px with imagery in place and record the new number in
  `## Result` before changing anything.
- **Prove it did not cost anything.** Re-run the chrome honesty sweep across four locales; hold the
  client-JS budget (an expanding search must not ship a new island beyond its own toggle — measure
  it in Brotli bytes); keep axe clean including the focus order through whatever control replaces
  the locale row; keep CLS at 0 across the header (a collapsing search that reflows is worse than
  the field it replaced). Record the before and after pixel heights in `## Result`.


## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
