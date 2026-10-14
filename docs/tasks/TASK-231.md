# TASK-231 — Home headings and the sentence to the artboards

Row: `TASKS.md` → TASK-231. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-177, TASK-196), so a new task (founder rule, 2026-10-14). Class:
**review-only** (presentation: components, styles, copy markup; no money, no SEO gate, no new
words). The reviewer confirms the class against the diff; if the diff touches a string that feeds
`<title>`, a meta description or structured data, it keeps the breaker.

- **Spec 004 §14 A21 clause 1, A24 clause 1:** implementers match the round-2 artboards
  `docs/design/wireframes/home-desktop.dc.html` and `home-mobile.dc.html` (PR 189).
- **The poppy italic phrase (QA-3 D-01).** A21 clause 2: poppy `--accent` is for "Send, prices and
  the one emotional phrase per page"; clause 3: Fraunces italic 300 is "the emotional phrase"; the
  identity table in `docs/design/README.md` ("Act: poppy … the one italic phrase in a heading").
  The artboards set *far away.*, *choices*, *sending for*, *occasion?*, *None of them is a
  courier.*, *promise*, *ask first* and *send flowers* in the home's `h1 em`/`h2 em`
  (sunflower on the phone cover), and *our order* in `product-desktop`'s related-products heading.
  The built pages print every one in roman. The listing pages already render the split (*Poland* on
  the shop root): reuse that mechanism. **No new words:** the split marks words already in each
  approved string. Where TASK-226 or the founder's copy batch changes a heading's text, the split
  follows the approved text. If adding the markup to an `en` value changes its review state
  (spec 003 §14 A17, the 5 % unreviewed share that decides `isLocaleIndexable`), stop and escalate
  before shipping. `de`/`pl` drafts carry the same markup where the phrase exists.
- **The country select never clips its value (QA-1 Q1-04, QA-4 #1).** A21 clause 4 (the sentence
  picker): at 390, 360 and 320 px in all four locales the selected country renders whole ("Poland",
  "Deutschland", "Rumunia", the longest name in each locale) with its chevron clear of the text;
  the artboard draws it whole. AC-43 (the phone) and AC-46 (home half) re-verified.
- **"Continue →" (QA-3 D-19):** the arrow is the drawn `chevron`/arrow icon (aria-hidden, mirrored
  under `dir="rtl"` per spec 004's `mirror-in-rtl`), not a new string.
- **Touches the product page** only for the related heading's italic phrase: never run beside
  TASK-227, TASK-228, TASK-229 or TASK-230 (same files); sequence after their PR or hand that one
  line to their agent.
- **Gates:** cheap gates; CI green with `ci:full` (home visual baselines re-taken in CI); `/review`.
  Mutations watched red: `em` removed from one heading; select width back to its old value at 390.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A21 clauses 1–4, A24 clause 1, AC-43, AC-46
- `docs/design/wireframes/home-desktop.dc.html`, `home-mobile.dc.html`, `product-desktop.dc.html` (related heading); `docs/design/README.md` (identity table, the 2026-10-13 TASK-196 row)
- `docs/codebase-map.md`
- `src/modules/ui/home/SentencePicker.tsx`, `HomeHero.tsx`, the home section components, `src/modules/ui/product/ProductPage.tsx` (related heading)

## Carry-forwards

- **From the site test (2026-10-14):**
  - QA-1 Q1-04 (P1): "Poland" reads "Polana" at 390 and every phone width.
    `.claude/state/qa-2026-10-14/QA-1-05.png`; QA-4 `QA-4-out/sent-en-390-mum-birthday.png`.
  - QA-3 D-01 (P1): `QA-3-home-1440-first-built.png` against `-design.png`,
    `QA-3-home-card-sidebyside.png`, `QA-3-home-390-first-*`.
  - QA-3 D-19 (P2): Continue lost its arrow. `QA-3-home-card-sidebyside.png`.
- Same agent and PR as TASK-232 (branch `task/TASK-231-…`).

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
