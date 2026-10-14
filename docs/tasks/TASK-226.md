# TASK-226 — Buyer copy without relay wording

Row: `TASKS.md` → TASK-226. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Founder ruling, 2026-10-14 (verbatim in `docs/decisions-log.md`):** buyers never learn we relay to partner florists; no "partner", no florist accepting or declining, no offers, re-routing, "another florist", "no florist", "finding a florist", and no card hold wording. The voice stays "we" send it, "our florist" makes it.
- **Founder copy approval, 2026-10-14, in chat ("3 ok"), exactly these `en` texts:**
  - `home.howItWorks.make.title` → "Our florist nearby makes it that morning."
  - `corridor.facts.orderBy.none` → "None yet." (also removes the em dash; drop its entry from `tests/support/forbidden-phrases.ts` `PHRASE_EXCEPTIONS`)
  - the ten guide FAQ answers to "Can you deliver to {country} today?" / "Can you send flowers to {country} now?" in `content/corridors/{en,en-gb}/*-guide.md` → "Not yet. Ordering for {country} is not open. When it opens, this page shows the delivery days and the order-by time." (country name filled per file; drop their `PHRASE_EXCEPTIONS` entries)
  - `checkout.price.currencyLine` → "You pay in {buyerCurrency}." (spec 010 §14 A4)
  - The founder approved these texts in chat on 2026-10-14, but the agent marks nothing reviewed itself: ship them `reviewed: false`, and the orchestrator hands the founder a record-approval script for their own commit (spec 003 A17 clause 5).
  - `de` and `pl`: replace the same keys and FAQ answers with machine drafts of the new text (`source: machine`, `reviewed: false`); no English left in `de`/`pl`.
- **Glossary:** `content/i18n/glossary.en.md` lines ~34 and ~67 tell translators to write "partner florist" and never "our florist(s)": rewrite so buyer-facing copy uses "our florist"; "partner florist" only for florist, admin and founder surfaces.
- **The em dash** in the product date picker (seen 2026-10-14): find its key and replace it with a full stop or comma, same review handling.
- **The scan:** `RELAY_PATTERNS`, `RELAY_EXEMPT` and `relayMatches` in `src/config/honesty.ts` exactly as spec 041 §14 A-founder-2026-10-14 defines them, plus (a) a unit test over every `en`, `en-gb`, `de`, `pl` message value outside `RELAY_EXEMPT` (spec 010 AC-51) and (b) an e2e scan of the rendered text and `alt`/`aria-label`/`title` of the home, a product, a country shop, a country category, a country occasion and a guide page in all four locales (spec 041 AC-30, site-wide half). Each goes red when one banned phrase is put back.

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, §14 A-founder-2026-10-14, AC-30
- `specs/010-checkout.md` — §14 A4, AC-51
- `docs/codebase-map.md`
- `tests/support/forbidden-phrases.ts`, `tests/e2e/phrase-scan.spec.ts`, `tests/unit/neutral-ordering-copy.test.ts`

## Carry-forwards

- **From the orchestrator (2026-10-14):** spec 041 L576 "what we hold" trips the `hold` pattern; that page is not built yet (TASK-182/183), so it is not this task's, but the scan must not exempt it.

## Escalations

_None recorded._

## Progress

_Not started._

## Result
