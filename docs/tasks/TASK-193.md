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

- 2026-10-05, E1, to the orchestrator and founder (PR 194): N1 feeds a meta description.
  `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` sets every product page's
  `<meta name="description">` to `shop.root.demoNotice`, but the brief says no N string feeds one.
  Product pages are `noindex` in Phase 0. Options: (a) accept the description becoming N1 (the
  current diff does this); (b) give the product page its own description key, which is new copy.
  `open`.
- 2026-10-05, E2, to the orchestrator and founder (PR 194): `unreviewedShare("en")` goes over the
  5 % gate. With the 7 N keys `reviewed: false` it is 30/535 (5.61 %), or 29/535 (5.42 %) once
  PR 190 lands; the gate allows 26.75. `en` and `en-gb` become non-indexable, and about 48 unit
  cases go red (i18n-review, home-honesty, seo-indexability, sitemaps, alternates). The brief
  requires both `reviewed: false` and a share at or under 5 %, and those cannot both hold.
  Options: (a) the founder's `record-approval.py` run for N1 to N7 lands on this branch, as its
  own commit, before ready (recommended); (b) the founder attests at least 3 other queued keys
  first. `open`.
- 2026-10-05, E3, to the orchestrator and founder (PR 194): a match outside the exception list.
  The `intro` of `content/corridors/en/pl-guide.md` says "We are still choosing the florists we
  want to work with in Poland". A YAML fold splits "still" and "choosing" across two lines, so a
  line grep misses it, but it renders on `/en/send-flowers-to/poland`. Open item (vii) lists only
  the FAQ answers, and the list never grows. Options: (a) a spec amendment adds `en/pl-guide.md ›
  intro`; (b) the founder approves the replacement proposed in PR 194 and this task applies it.
  T-47's unit and e2e scans are red on it until then. `open`.
- 2026-10-05, E4, to the orchestrator (PR 194): the mobile notice bar loses its sentence row.
  "Nothing takes the line's place" leaves the row empty below `md`, so the lone lead is hidden
  there too, and the bar goes from 80 to 60 px (`tests/e2e/header.spec.ts` updated). CLS stays 0,
  because the change is static, but the box is permanently 20 px smaller. Confirm this reading of
  "the strip's layout must not shift". The visual baselines need a `visual:baselines` refresh.
  `open`.

## Progress

One line per coherent step, newest last.

- 2026-10-05: N1 to N7 written to `en` (`reviewed: false`); `de`/`pl` re-drafted; `datesPending*`
  and their notice line removed; N1/N2 call sites drop `{country}` (aa69c5f5).
- 2026-10-05: T-40 and T-47 (unit and e2e) written, old pins moved, mutations watched red
  (a38f7fb4). Draft PR 194 opened. Four escalations raised, so the task is `blocked`.

## Result

**Partial, blocked on E1 to E4.** PR: https://github.com/itsahmeds/flowers-overseas/pull/194
(draft; not ready, no `ci:full`, because the tree is red by construction until E2 and E3 are
answered).

- AC-38 for N1 to N7 (T-40) holds. AC-37's phrase bullet (T-47) is written and red on `main`'s own
  `en/pl-guide.md` intro (E3).
- Mutations watched red:
  - one character changed in N1 `en` makes T-40 N1 red;
  - an em dash in N1 `de` makes the de em-dash case and the de draft case red;
  - the old N3 sentence restored makes the T-47 scan red;
  - an added exception makes the scan and the "never grows" case red.
  The two T-47 runs used a local, uncommitted exception for the E3 intro.
- Tests:
  - unit: `neutral-ordering-copy.test.ts`, 18 new cases (17 green, 1 red on E3);
  - e2e: `phrase-scan.spec.ts`, 22 new cases, not run locally (CI's);
  - pins moved in 6 unit files and 6 e2e files.
- No build slot was taken.

`pnpm gates:cheap` (load average 24.6 at the time; `tests` is red only for the E2 cascade, the E3
scan and one `url-pii` timeout under that load):

```
gates:cheap · a38f7fb4f83ad8cccfcd9e2097b152dc21efd3bd · tree clean · base origin/main · 2026-10-04T21:56:50.332Z
typecheck             exit 0 · 2.8 s
lint                  exit 0 · 20.1 s
format:check          exit 0 · 15.5 s
i18n:check            exit 0 · 0.5 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 1 · 91.9 s · changed 126 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: FAIL (1 of 7 red: tests)
[ELIFECYCLE] Command failed with exit code 1.
```
