# Glossary and style guide — `pl` (Polish)

**Status: stub.** Polish copy in the repository today is an unreviewed English echo written by
`pnpm i18n:draft` (`source: "machine"`, `reviewed: false`), so `pl` is non-indexable and tagged
`beta` — by design (spec 003 §13 Q7, Q10). The first native review pass (`plan/13` B12) fills §3
and records its decisions here.

Read `glossary.en.md` first: brand terms, the relay vocabulary, tone and the taboo list apply
unchanged.

## 1. Register — decided, do not re-decide per string

**Informal `Ty` in the UI; formal `Państwo` in legal and contractual copy** (spec 003 §13 Q2,
resolved 2026-09-08 from `plan/13` A5).

- **UI, transactional email, error messages, buttons, help text: `Ty`.** "Wybierz datę
  dostawy", "Twoje zamówienie". Polish e-commerce has moved to informal address and `Państwo`
  everywhere reads as a bank, not a florist.
- **Legal pages, terms, privacy policy, cancellation form, anything quoting a statutory right:
  `Państwo`** — and the same document is consistent from first line to last.
- A reviewer must not "harmonise" the two: the split is the decision.
- Never mix registers in one surface, and never use the third-person impersonal
  ("klient powinien") as an escape from choosing.

## 2. Decided already

| Question                   | Decision                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand name                 | **Flowers Overseas**, untranslated and **uninflected** — no `Flowers Overseasa`, no `w Flowers Overseasie`. Where a case ending is unavoidable, restructure the sentence.                                      |
| Currency                   | PLN, rendered by `formatMoney` (`45,00 zł`) — decimal comma, `zł` after the amount, never hand-typed.                                                                                                          |
| Dates                      | `14.02.2027` via `formatDate`; a written date is "14 lutego 2027" (genitive month, which is why the month name is never concatenated by hand).                                                                 |
| Numbers                    | Thousands grouped with a non-breaking space (`1 234,50`) by `formatNumber`.                                                                                                                                    |
| Legal URL                  | `/pl/informacje-prawne` (the legal segment, spec 041 §13 Q5); the terms are `/pl/informacje-prawne/regulamin`, "regulamin" being the expected name for terms in Poland.                                        |
| Address order and postcode | `plan/03` §8 Polish block via `formatAddressBlock`; `NN-NNN` postcode normalised by `normalisePostcode`.                                                                                                       |
| Collation                  | `collator("pl")` — `ł` sorts after `l`, so a city list is never sorted with the English collator.                                                                                                              |
| `common.floristCount`      | Counts **shops** (`kwiaciarnia` / `kwiaciarnie` / `kwiaciarni`), not people, unlike `en`/`de`. Deliberate — see the `en` glossary §6. Plural categories: `one`, `few`, `many`, `other`; all four are required. |

## 3. To decide in the first review pass

- The corridor verb and noun phrasing that appear in URL segments (`kwiaty-do`, `wyslij-kwiaty`)
  — decided once, not per string.
- Sympathy and funeral vocabulary. All Saints' Day (**Wszystkich Świętych**, 1 November) is the
  largest flower occasion in Poland; its copy is authored, never machine-drafted, and it does not
  map onto any UK occasion.
- Diminutives: Polish uses them warmly, but they can read as childish in a paid service. Set the
  rule once.
- Whether "dostawa" or "doręczenie" is used for delivery in transactional copy.

## 4. Never

- Never imply that flowers cross a border: a local florist (`lokalna kwiaciarnia`) makes and
  delivers.
- Never leave `zł` or `%` typed into a message value — the formatter renders them.
- Never use a country flag to mean the language (`plan/03` §2).

## 5. Trust and legal pages (spec 041): the four terms of the drafts

The machine drafts of the ten pages (TASK-184; `source: machine`, `reviewed: false`) use these
words. They are the drafts' choices for the native reviewer to confirm, not decisions. The trust
pages use `Ty`; the five legal documents use `Państwo` from first line to last (§1).

| `en`        | `pl` in the drafts                                                                                                                                                                   | Never                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| guarantee   | **gwarancja** ("Nasza gwarancja"), the promise itself **obietnica świeżych kwiatów**. ⚖️ _Gwarancja_ is a statutory term (Kodeks cywilny art. 577); the lawyer confirms the wording. | "gwarancja świeżości przez 7 dni", any number of days of freshness                                        |
| withdrawal  | **odstąpienie od umowy**, **prawo odstąpienia od umowy** (ustawa o prawach konsumenta, art. 38 for perishable goods); our own free cancellation is **anulowanie**                    | "zwrot kwiatów", a 14-day right for fresh flowers                                                         |
| imprint     | **Dane firmy** (`/pl/dane-firmy`): Poland has no _Impressum_ law, so the page is named for what it holds                                                                             | "Impressum", any completeness claim before the lawyer rules                                               |
| our florist | **nasz florysta**, in the present tense ("układa", "wręcza")                                                                                                                         | "partner", "florysta partnerski", "inny florysta", "brak florysty", "pośrednik", "zaakceptuje zamówienie" |

The help page's funeral answer stays in English in the draft: sympathy and funeral vocabulary is
decided by the first review pass (§3) and is not machine-drafted (spec 003 §14 A15 clause 4).
