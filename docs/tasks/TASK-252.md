# TASK-252 — Design judgments from the 2026-10-18 QA that no spec clause decides

Row: `TASKS.md` → TASK-252. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

**Owner: the designer (`/design`), not an implementer.** These are QA-2's "design bar" notes and
judgment bugs. No spec clause says what the right answer is, so no implementer builds any of them
from this row. The designer draws each as an artboard under `docs/design/` (desktop 1440 and
mobile 390, with an annotation block), records the founder's choice in `docs/design/README.md`,
and hands the orchestrator the amendments to write; `/plan-tasks` then makes implementer rows.
The designer writes only under `docs/design/` and never code.

Items (QA 2026-10-18 on `c8d3b334`, evidence in `.claude/state/qa-2026-10-18/`):

1. **N-03 (P1), the first-visit consent card over the home hero form** at 1330 × 860: "Poland / her
   birthday / Continue" are hidden until the buyer answers; on a phone the card takes about 45% of
   the screen above the fixed "Send flowers" bar. Spec 004 AC-17 says the banner "blocks no
   content"; where it sits so it does not is a drawing question. `QA-2-home-1330-consent.png`,
   `QA-2-home-390-consent.png`.
2. **N-09 (P2), the consent settings sheet** is four screens tall on a phone (copy is TASK-251).
   `QA-2-consent-settings-phones.png`.
3. **N-04 (P1), the phone Menu on the home page.** Menu > "Send flowers" scrolls to the form but the
   menu stays open over it, so it looks like nothing happened. Spec 004 §13 Q16 (how the open Menu
   behaves) is open; its default is to draw the open Menu first. `QA-2-sendclick-sheet.png`.
4. **Escape closes the language popup and the cookie card together** (QA-2 re-test 21). AC-17 makes
   the card close on `Esc` without deciding; spec 003 A16 makes the popup close on `Esc`. Which one
   a single `Esc` closes is a choice.
5. **N-08 (P2), home phone "Popular choices"**: five cards in two columns leave a blank half row.
   TASK-232 built what the artboard draws, so this is a redraw question (`QA-2-home-390-sheet1.png`).
6. **N-12 (P2), 200% zoom at 1280 (a 640 × 400 viewport)**: the 64 px sticky header and the 76 px
   fixed "Send flowers" bar leave 65% of the viewport and the home shows an image with no headline.
   `QA-2-zoom200-sheet.png`.
7. **Q18-07 and Q1-19 (P2), every listing card**: the price caption "all in", a three-currency line
   ("45.48 £, 235.54 PLN or 60.65 US$") on every card, and "Example arrangement · our florist
   hand-makes each one" repeated per card. The founder's price rule is one price with "Includes VAT
   and delivery" beside it (the em dash in `shop.card.noPrice` is TASK-188's). `QA-1-N10.png`,
   `QA-1-N11.png`.
8. **N-05 (P1), the product page**: date chips and the "Add something" add-ons read as live
   controls while they are inert (chips disabled radios; add-ons static rows). TASK-230 mutes the
   chips; whether the add-ons become selectable is spec 010's, so only how a static row should look
   is drawn here. `QA-2-prod-1330.png`.
9. **Design bar, QA-2:** the product page's gaps beside the card preview and the delivery facts at
   1024 to 1440 (draw after TASK-228/229/230 merge, so it is not redrawn twice); the huge blank band
   to the right of the H1 on category and occasion pages (AC-45 measures vertical gaps only);
   the placeholder photo box on guides (TASK-189 removes it).
10. **For the founder, not drawn:** see the planning PR's list (name day destination, sort on Next,
    currency chooser, overlapping categories, "refund you in full").

- **Copy.** Drawings use existing keys; new wording is marked for the founder's batch.
- **Review class.** Review-only (docs under `docs/design/`).

## Read

- `docs/design/README.md` (the sheet and the code, where they differ), `docs/design/system/`
- `specs/004-design-system-layout.md` — `## 0. Index`, AC-17, AC-47 to AC-50, §13 Q14, Q16, Q18
- `.claude/state/qa-2026-10-18/QA-2.md` ("Design bar verdict") and `QA-1.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

- 2026-10-18: which of items 1 to 9 the founder wants drawn first. Asked via the planning PR's
  body. Answer: `open`.

## Progress

_Not started._

## Result

[PR 267](https://github.com/itsahmeds/flowers-overseas/pull/267), merged 2026-10-18: the design judgments drawn as artboards in `docs/design/`; the founder's answers (Escalations) decide which builds `/plan-tasks` opens next.
