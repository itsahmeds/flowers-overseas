# TASK-308 — Spec 042 card preview (042-2)

Row: `TASKS.md` → TASK-308. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.2 and §13 Q4 (answered (a): Caveat on both; the idea is "the card preview", never "handwritten"); spec 004 §14 A-founder-2026-10-20c (in PR 284) amends A21 clause 3.
- **ACs owned:** AC-10, AC-11 (component and checkout-primitive half); tests T-10, T-11 (unit half). AC-11's page half (the e2e at `/{locale}/checkout` step 2 with JS off) is TASK-204's, because the checkout page is not built yet.
- **Feature PR with TASK-309, one agent** (§12: both spend the product island's bytes). Branch and title carry TASK-308; the description names TASK-308 and TASK-309. §13 Q7 (a): if the bytes do not fit, the gallery falls back to CSS scroll markers; the budget is not raised.
- The product page's `<textarea>` has no `name` and makes no network request on input (AC-10).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 15, `product-desktop`, `product-mobile` (card section), `checkout-desktop`, `checkout-mobile` (step 2). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff). The printed caption is the existing `card.preview` key.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): it changes checkout step 2's card-message fields, which feed the order.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- `src/modules/ui/product/PrintedCardPreview.tsx`, `CardMessageField.tsx`, `src/modules/ui/checkout/TextAreaWithCounter.tsx`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 297 escalation 1: spec 042 §5.3.2 does not say what checkout's card shows when both fields are empty; the designer drew it as today (the mark and the caption, no words). Build that.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22, implementer: one `PrintedCardPreview` on both pages, the product island writes into its `<bdi>` and marks the sample, `globals.css` idea 2 section, `src/config/interactions.ts` (`cardPreviewMotion`), unit T-1/T-3/T-10/T-11 and e2e T-10 (+ the gallery's AC-11 face check); 14 mutations each seen red. TASK-309 is not in this PR: its dependency TASK-306 is still `todo` (PR 314). Next: gates, Self-review, ready, `ci:full`, Linux baselines for the product card section if `visual` moves.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 339](https://github.com/itsahmeds/flowers-overseas/pull/339). `PrintedCardPreview` is the one card
preview (`data-fo-card-preview`, Caveat on the words, the sample and the signature, the page's
printed label as the caption); the product page and checkout's `TextAreaWithCounter` both render
it, the card sits above the field on phones, and the sample-to-words crossfade (opacity, 200 ms,
`--ease-standard`, `no-preference` only) sits behind `interactions.cardPreviewMotion`. Tests:
unit `card-preview-mirror.test.ts` (4, new), `interactions-budget.test.ts` (4, new),
`interactions-css.test.ts` (3, new), `product-card-preview.test.tsx` (5 changed or new),
`checkout-ui-components.test.tsx` (5 changed or new); e2e `product-card-preview.spec.ts` (+3 for AC-10, AC-4,
AC-5; the four-locale case updated) and `checkout-ui.spec.ts` (+1 for AC-11's face on the gallery).

**AC-1 bytes for idea 2** (Brotli; §5.3.0 caps in brackets): product island 1,129 B against
1,231 B before, growth **-102 B** [160 B]; `CardCounter` **0 B** [160 B], unchanged; stylesheet
growth **67 B** by the test's upper-bound method, 40 B as the whole scanned sheet against main
`e590959f` [300 B]; listing HTML **0 B** [0 B] (the preview is imported by the product page and
checkout's primitive only). The product page document grows by 436 B uncompressed (no cap) and,
with JavaScript off, keeps the same visible text and the same `href` set as main in all four
locales (AC-6, checked once by rendering both trees). Route budgets are CI's
`budget:client-js`; no local build was run.

**Handed on.** TASK-204: AC-11's page half (step 2 at `/{locale}/checkout`, JavaScript off), and
the font-budget line `scripts/client-js-budget.ts` still labels "Caveat (product page only)"
(A-founder-2026-10-20c adds checkout step 2; the 30 KB figure is unchanged). TASK-309 was not
built here: its dependency TASK-306 (PR 314) is not merged; the product island has 1,231 - 1,129
= 102 B more headroom than before for the gallery dots. TASK-313: the shared T-1/T-3 files now
exist with idea 2's rows.
