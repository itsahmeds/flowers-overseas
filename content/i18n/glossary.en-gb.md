# Glossary and style guide — `en-gb` (British English)

Read `glossary.en.md` first: brand terms, the relay vocabulary of §2, tone and the taboo list
apply unchanged. This file records **only the delta**, because `messages/en-gb.json` is a thin
override of `messages/en.json` and a value identical to the `en` one is a `pnpm i18n:check`
failure, not a harmless duplicate (spec 003 §13 Q5).

`en-gb` exists as a separate locale for two reasons that are not spelling: **GBP** and **UK
consumer law** (14-day cancellation wording, "Contact us", trader details). Those make `/en-gb/`
a genuinely different page, not a variant.

## 1. Spelling

`-ise`, not `-ize`: `organise`, `personalise`, `apologise`, `recognise`, `customise`. Also
`colour`, `favourite`, `licence` (noun), `practise` (verb), `enrolment`, `travelled`,
`cancellation` (same in both).

## 2. Vocabulary

| `en`                                                     | `en-gb`                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| postal code                                              | postcode                                                                                       |
| cell phone / mobile                                      | mobile                                                                                         |
| ZIP                                                      | postcode                                                                                       |
| store                                                    | shop                                                                                           |
| shipping (never used here — see §2 of the `en` glossary) | delivery                                                                                       |
| fall                                                     | autumn                                                                                         |
| Mother's Day (US date)                                   | Mothering Sunday date rules differ — never assume the date, take it from the occasion calendar |

## 3. Money and dates

- Currency is **GBP**, rendered by `formatMoney` (`£45.00`). Never a hand-typed `£`.
- Dates render as `14/02/2027` (day first) through `formatDate`; a written date is
  "14 February 2027".
- Note the recorded formatting decision for plain `en`: its `formattingTag` is `en-150`
  (European conventions), so `en` and `en-gb` differ in output as well as in wording. `en-gb`
  keeps British conventions.

## 4. Legal register

Formal but plain, matching UK consumer-law phrasing: "Your right to cancel", "We will refund",
"Contact us". No American legalese ("shall", "hereby"). Legal pages are authored, never
machine-drafted (`plan/03` §6.4).

## 5. Reviewer

Founder. `en-gb` is 100% reviewed by definition of being hand-authored — its keys are only ever
written deliberately.
