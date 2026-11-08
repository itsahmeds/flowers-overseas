# Glossary and style guide — `de` (German)

**Status: stub.** German copy in the repository today is an unreviewed English echo written by
`pnpm i18n:draft` (`source: "machine"`, `reviewed: false`), so `de` is non-indexable and tagged
`beta` — by design, not by omission (spec 003 §13 Q7, Q10). The first native review pass
(`plan/13` B12) fills the empty sections below **and records its decisions here** so the second
pass inherits them instead of re-deciding per string.

Read `glossary.en.md` first: brand terms, the relay vocabulary, tone and the taboo list apply
unchanged.

## 1. Decided already

| Question      | Decision                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand name    | **Flowers Overseas**, untranslated, uninflected, in every case position.                                                                                   |
| Currency      | EUR, rendered by `formatMoney` (`45,00 €`) — decimal comma, symbol after the amount, never hand-typed.                                                     |
| Dates         | `14.02.2027` via `formatDate`; a written date is "14. Februar 2027".                                                                                       |
| Percent       | `19 %` — CLDR puts a non-breaking space before the sign in `de`. Never `19%` typed by hand.                                                                |
| Legal URLs    | `/de/rechtliches/agb`, `/de/impressum` (authored path segments, spec 003 §8). Germany's Impressum is a legal requirement, not a footer link we may rename. |
| Address order | `plan/03` §8 German block, via `formatAddressBlock`.                                                                                                       |

## 2. To decide in the first review pass

- **Register: `Sie` or `du`?** The recommendation to confirm is **`Sie` throughout** — including
  the UI — because the German flower-gifting market skews older and formal address is the safe
  default for a service handling funerals and money. This is the opposite of the Polish decision
  and must be recorded here before any `de` string is approved, since it changes every sentence.
- Whether "Blumen versenden" or "Blumen verschicken" is the corridor verb (it appears in a URL
  segment, so it is decided once and not per string).
- Trauerfloristik vocabulary: the phrasing for sympathy and funeral occasions, which is more
  codified in German than in English (`Trauerfloristik`, `Kranz`, `Trauergesteck`) and must not be
  machine-drafted.
- Whether `Florist` or `Floristin/Florist` (gendered forms) is used, and what the plural in
  `common.floristCount` counts — in `de` it counts **people**, unlike `pl` (see the `en`
  glossary §6).

## 3. Never

- Never `Bestellung wird versandt` or any wording that implies international shipping: the German
  buyer must understand that a local florist in the destination country makes and delivers.
- Never a literal translation of an occasion that does not exist in the German calendar.
- Never `Sie`/`du` mixed within one surface.

## 4. Trust and legal pages (spec 041): the four terms of the drafts

The machine drafts of the ten pages (TASK-184; `source: machine`, `reviewed: false`) use these
words. They are the drafts' choices for the native reviewer to confirm, not decisions.

| `en`        | `de` in the drafts                                                                                                                                                      | Never                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| guarantee   | **Garantie** ("Unsere Garantie"), the promise itself **Frische-Versprechen**. ⚖️ A voluntary guarantee is a _Garantie_ under BGB §443; the lawyer confirms the wording. | "Frischegarantie" with a number of days, "7-Tage-Garantie", "garantierte Lieferung"                                |
| withdrawal  | **Widerruf**, **Widerrufsrecht** (BGB §355, §312g Abs. 2 Nr. 2 for perishable goods); our own free cancellation is **stornieren**, never "widerrufen"                   | "Rückgabe" of fresh flowers, a 14-day right for fresh flowers                                                      |
| imprint     | **Impressum** (`/de/impressum`), with the facts and German labels only                                                                                                  | "Angaben gemäß § 5 DDG", "Impressum gemäß", any completeness claim before the lawyer rules (spec 041 AC-39 (a))    |
| our florist | **unser Florist**, in the present tense ("bindet", "übergibt")                                                                                                          | "Partnerflorist", "Partner", "ein anderer Florist", "kein Florist", "Florist finden", "akzeptiert Ihre Bestellung" |

The drafts use `Sie` throughout (spec 003 §14 A15, "all defaults"). The help page's funeral
answer stays in English in the draft: Trauerfloristik vocabulary is not machine-drafted (§2).
