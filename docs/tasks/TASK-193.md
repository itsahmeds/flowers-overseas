# TASK-193 — Neutral "ordering opens" copy and AC-37's phrase scan

Row: `TASKS.md` → TASK-193. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23 clause 12** (the neutral copy batch) and
  open item (vii). It owns **AC-37's phrase bullet** (T-47) and **AC-38 for N1–N7** (T-40 for the
  N ids). AC-37's first bullet (state and counts, T-39) stays TASK-188's.
- **Founder.** 2026-10-05, in chat, on the seven strings below: "approve the wording just no em
  dash". Decisions log row "The neutral copy batch approved" (2026-10-05).
- **The strings, verbatim** (`messages/en.json`; `en-gb` inherits unless it overrides a key, in
  which case it takes the same text):

  | Id | Key | Approved English text |
  |---|---|---|
  | N1 | `shop.root.demoNotice` | Ordering opens soon. Every price here is the price you will pay, with VAT and delivery included. |
  | N2 | `product.demo.body` | When ordering opens, this is the price you will pay. Nothing is added at a later step. |
  | N3 | `delivery.picker.unavailable` | Delivery dates for {country} open when ordering does. |
  | N4 | `corridor.facts.delivering.none` | Not yet. This page will say so the day we start delivering in {country}. |
  | N5 | `corridor.coverage.bodyNone` | We are not delivering in {country} yet, so this page lists no towns. |
  | N6 | `categoryHub.destinationPending` | No page yet. This becomes a link the day we start delivering here. |
  | N7 | `catalog.availability.noPartner` | We do not deliver to this destination yet. |

  Copy each byte for byte. No em dash (U+2014) anywhere in N1–N7, in any locale.
- **`de` and `pl`.** Machine drafts of the new English text by `pnpm i18n:draft` (spec 003 §14
  A15's policy), with no em dash, `reviewed: false`. Use a full stop or a comma where a draft would
  reach for a dash.
- **Arguments.** N1 and N2 drop `{country}`. Remove the argument at their call sites
  (`CountryShopRootPage.tsx`, `CountryCategoryPage.tsx`, `CountryOccasionPage.tsx`,
  `PriceSummary.tsx` or wherever `codebase-map` points), and keep `de`/`pl` on the same argument set
  so `i18n:check` stays green. N3–N5 keep `{country}`.
- **Removed.** `nav.utility.datesPending` and `nav.utility.datesPendingShort` ("Delivery dates open
  when we confirm our first florist" / "Delivery dates are not open yet") go from every catalogue
  and meta sidecar, with the utility-strip line that renders them in `SiteHeader.tsx`. TASK-186
  does not own them (checked 2026-10-05). The strip keeps its other items; nothing takes the line's
  place, and the strip's layout must not shift (CLS 0).
- **Review state.** Every changed `en` key ships `reviewed: false`. The en manifest entries are
  founder-attested by the founder's chat words above, but the attestation itself runs through the
  record-approval mechanism the copy rules require (decisions log "Recording the founder's copy
  approval"): **the orchestrator hands the founder a `record-approval.py` command** naming exactly
  N1–N7's keys and values, and the founder runs it. Their run is committed alone and never edited,
  squashed or re-authored (as TASK-192). No agent sets `reviewed: true`. Keep `unreviewedShare("en")`
  ≤ 5 % until the founder's run lands.
- **AC-37's phrase scan (T-47).** No `en` or `en-gb` copy contains, case-insensitively, "still
  choosing", "first florist", "no florist" or "choosing florists":
  - **unit:** every value in `messages/en.json` and `messages/en-gb.json`, every `en`/`en-gb` seed
    copy record, and every file under `content/corridors/en*/`;
  - **e2e:** the rendered `en` and `en-gb` DOM of the home, the seven listing types, the guide and one
    product page;
  - **the named exception list** (A23 open item (vii)), in the test, one entry per key or per file
    and FAQ id, asserted to equal exactly: `corridor.facts.orderBy.none`, and the "can you deliver
    today" FAQ answer in `content/corridors/en/pl-guide.md`, `en-gb/pl-guide.md`, `en/es-guide.md`,
    `en-gb/es-guide.md` and `en-gb/fr-guide.md` (the FAQPage JSON-LD fixtures carry the same text).
    Confirm the five files against `main` at dispatch; the list never grows.
  - **Proposals.** For each exception, propose replacement wording (no em dash, present tense for
    florists, no promise) in the PR description for the founder's next batch. Do not change those
    strings in this task.
- **Tests to update** (they pin the old text; move each pin to the new value, never to a set):
  `tests/e2e/product-page.spec.ts` (N3), `tests/e2e/chrome-honesty.spec.ts`,
  `tests/unit/chrome-honesty.test.tsx` and `tests/unit/ui-site-header.test.tsx` (the removed
  utility line), `tests/unit/i18n-messages-schema.test.ts`, `tests/unit/catalog-messages.test.ts`,
  `tests/unit/catalog-availability.test.ts` (N7), `tests/unit/corridor-route.test.ts`, and any
  other test `grep` finds pinning an old N value.
- **Unchanged.** Honesty: every page that showed an old string still says nothing can be ordered
  yet, and the price shown is the price charged. No layout or design change. No `<title>`, meta
  description or JSON-LD text changes (none of N1–N7 feeds one; confirm, and escalate if one does).
- **Not gated on the round-2 design PR** (A23 clause 8): this task draws nothing. It may land before
  TASK-186.
- **Overlap.** TASK-179 (PR 170) edits `PriceSummary.tsx` and the product page; TASK-185 writes
  `de`/`pl` drafts for every key. Whichever merges second rebases and re-drafts N1–N7's `de`/`pl`
  values from the new English.
- **Review class.** It changes copy only, but compliance-adjacent honesty text (price display and
  availability claims), so it **keeps the breaker**: `/review` and `/break`.
- **Tests** (watch each go red by mutating its subject):
  - **T-40** for N1–N7 (unit): each `en` value equals its literal; changed keys `reviewed: false`;
    no U+2014 in N1–N7 in `en`/`de`/`pl`; `nav.utility.datesPending*` absent everywhere. Red with
    one character changed, and red with an em dash put back into N1's `de` draft.
  - **T-47** (unit + e2e): the phrase scan above. Red with "We are still choosing florists in
    {country}." restored to `delivery.picker.unavailable`, and red with a new entry added to the
    exception list.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, §14 A23 clause 12, open item (vii), AC-37,
  AC-38, T-40, T-47
- `specs/003-i18n-foundation.md`: §14 A15 (the draft policy and check 10)
- `docs/decisions-log.md`: "Recording the founder's copy approval" (2026-10-04) and "The neutral
  copy batch approved" (2026-10-05)
- `docs/tasks/TASK-192.md` (how a founder's attestation commit is carried)
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._
