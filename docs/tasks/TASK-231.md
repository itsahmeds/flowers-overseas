# TASK-231 — Home headings and the sentence to the artboards

Row: `TASKS.md` → TASK-231. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-177, TASK-196), so a new task (founder rule, 2026-10-14). Class:
**keeps the breaker** (changed 2026-10-15 from review-only): spec 004 AC-52 changes
`pnpm i18n:check` (the tag set) and the founder's `record-approval` comparison, which are
`scripts/` gates and i18n tooling (`CLAUDE.md` DoD §4), and TASK-232 in the same PR changes home
links (PR 226 review nit 1).

- **Spec 004 §14 A21 clause 1, A24 clause 1:** implementers match the round-2 artboards
  `docs/design/wireframes/home-desktop.dc.html` and `home-mobile.dc.html` (PR 189).
- **The poppy italic phrase (QA-3 D-01).** A21 clause 2: poppy `--accent` is for "Send, prices and
  the one emotional phrase per page"; clause 3: Fraunces italic 300 is "the emotional phrase"; the
  identity table in `docs/design/README.md` ("Act: poppy … the one italic phrase in a heading").
  The artboards set *far away.*, *choices*, *sending for*, *occasion?*, *None of them is a
  courier.*, *promise*, *ask first* and *send flowers* in the home's `h1 em`/`h2 em`
  (sunflower on the phone cover), and *our order* in `product-desktop`'s related-products heading.
  The built pages print every one in roman. **No new words:** the marker wraps words already in
  each approved string. Where TASK-226 or the founder's copy batch changes a heading's text, the
  marker follows the approved text.
- **Spec 004 §14 A-founder-2026-10-14d ("italic ok", 2026-10-14). Owned: AC-52 (T-57).** This
  replaces the earlier "if the review state changes, stop and escalate" hedge:
  1. A heading whose artboard draws the phrase carries one `<em>…</em>` pair around exactly that
     phrase in its **message value**, rendered with next-intl's `t.rich` into an `<em>`. At most
     one pair per heading, none outside a heading's value. The PR names each key and phrase.
  2. `h1 em` and `h2 em` render Fraunces italic 300 in the poppy token (sunflower on the phone
     cover), tokens only; clause 3's fallback applies if the italic file was cut.
  3. A marker-only change **keeps the founder's approval**: a value whose tag-stripped text equals
     the base byte for byte keeps `reviewed`, `reviewedBy` and `reviewedAt`; only `sourceHash` is
     recomputed. `record-approval`'s exact-match comparison reads the value with the two tags
     removed. Any other change in the same value is an ordinary edit.
  4. Each `de` and `pl` value of these keys carries one pair around the phrase's translation, and
     `i18n:check` treats the tag set like the argument set: a locale value that lacks the pair or
     adds another fails.
- **The country select never clips its value (QA-1 Q1-04, QA-4 #1).** A21 clause 4 (the sentence
  picker): at 390, 360 and 320 px in all four locales the selected country renders whole ("Poland",
  "Deutschland", "Rumunia", the longest name in each locale) with its chevron clear of the text;
  the artboard draws it whole. AC-43 (the phone) and AC-46 (home half) re-verified.
- **"Continue →" (QA-3 D-19):** the arrow is the drawn `chevron`/arrow icon (aria-hidden, mirrored
  under `dir="rtl"` per spec 004's `mirror-in-rtl`), not a new string.
- **Touches the product page** only for the related heading's italic phrase: never run beside
  TASK-227, TASK-228, TASK-229 or TASK-230 (same files); sequence after their PR or hand that one
  line to their agent.
- **Gates:** cheap gates; CI green with `ci:full` (home visual baselines re-taken in CI); `/review`
  and `/break`. Mutations watched red: `em` removed from one heading; select width back to its old
  value at 390; T-57: one word inside a marked value changed (the tag-stripped comparison fails),
  `t.rich` replaced by `t` (the tags print as text), a `de` value without the pair.
- **Not this task:** the home finder's "soon" mark on a not-open country (spec 007 AC-33) is
  TASK-239's, after this PR; keep `SentencePicker` changes to the clipping fix.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A21 clauses 1–4, A23 clause 6, A24 clause 1, A-founder-2026-10-14d, AC-43, AC-46, AC-52
- `specs/003-i18n-foundation.md` — §14 A15 clause 6, A17 clause 5 (`record-approval`); `scripts/i18n-check.ts`
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
- **From PR 226's review (2026-10-14):** spec 004 AC-52 and T-57 now own the italic phrase; cite
  them, and the escalation hedge is dropped (done above).
- Same agent and PR as TASK-232 (branch `task/TASK-231-…`).

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
