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
  Answered 2026-10-05 (coordinator): accepted. N1 is approved, honest text, and TASK-197 carries a proper product meta.
- 2026-10-05, E2, to the orchestrator and founder (PR 194): `unreviewedShare("en")` goes over the
  5 % gate. With the 7 N keys `reviewed: false` it is 30/535 (5.61 %), or 29/535 (5.42 %) once
  PR 190 lands; the gate allows 26.75. `en` and `en-gb` become non-indexable, and about 48 unit
  cases go red (i18n-review, home-honesty, seo-indexability, sitemaps, alternates). The brief
  requires both `reviewed: false` and a share at or under 5 %, and those cannot both hold.
  Options: (a) the founder's `record-approval.py` run for N1 to N7 lands on this branch, as its
  own commit, before ready (recommended); (b) the founder attests at least 3 other queued keys
  first. Answered 2026-10-05: the founder ran `record-approval-193.py`, commit d76e6fa3, rebased as 8446dc8c (range-diff `=`). `en` now has 22 of 535 keys unreviewed (4.11 %), at or under the gate.
- 2026-10-05, E3, to the orchestrator and founder (PR 194): a match outside the exception list.
  The `intro` of `content/corridors/en/pl-guide.md` says "We are still choosing the florists we
  want to work with in Poland". A YAML fold splits "still" and "choosing" across two lines, so a
  line grep misses it, but it renders on `/en/send-flowers-to/poland`. Open item (vii) lists only
  the FAQ answers, and the list never grows. Options: (a) a spec amendment adds `en/pl-guide.md ›
  intro`; (b) the founder approves the replacement proposed in PR 194 and this task applies it.
  T-47's unit and e2e scans are red on it until then. Answered 2026-10-05: the founder approved the replacement ("2–6 yes"), and the intro now reads "Ordering for Poland is not open yet, so this page makes no promise about when a bouquet would arrive." Corridor review is file-level (`reviewed`/`reviewedBy`/`reviewedAt`, no per-string hash), and the 2026-09-16 decisions-log row accepted the founder's chat words for it. So the file stays `reviewed: true` by the founder, with `reviewedAt` 2026-10-05, `version` 2 and `updatedAt` 2026-10-05; the sitemap fixtures were regenerated.
- 2026-10-05, E4, to the orchestrator (PR 194): the mobile notice bar loses its sentence row.
  "Nothing takes the line's place" leaves the row empty below `md`, so the lone lead is hidden
  there too, and the bar goes from 80 to 60 px (`tests/e2e/header.spec.ts` updated). CLS stays 0,
  because the change is static, but the box is permanently 20 px smaller. Confirm this reading of
  "the strip's layout must not shift". The visual baselines need a `visual:baselines` refresh.
  Answered 2026-10-05 (coordinator): accepted. The baselines are refreshed through the `visual:baselines` label flow.

## Progress

One line per coherent step, newest last.

- 2026-10-05: N1 to N7 written to `en` (`reviewed: false`); `de`/`pl` re-drafted; `datesPending*`
  and their notice line removed; N1/N2 call sites drop `{country}` (aa69c5f5).
- 2026-10-05: T-40 and T-47 (unit and e2e) written, old pins moved, mutations watched red
  (a38f7fb4). Draft PR 194 opened. Four escalations raised, so the task is `blocked`.
- 2026-10-05: the founder's `record-approval-193.py` commit landed. The branch was rebased onto
  `main` 22a2d110, with the founder's commit unchanged (range-diff `=`). E1 to E4 are answered.
  The `en/pl-guide.md` intro takes the approved sentence, and T-40 and the review queue move to
  the attested state (93621550).

## Result

**Ready for review.** PR: https://github.com/itsahmeds/flowers-overseas/pull/194, rebased onto
`main` ee50223d. The founder's commit is carried unchanged (range-diff `=`).

- AC-38 for N1 to N7 (T-40) holds:
  - each `en` value matches its approved text byte for byte;
  - the implementer commit shipped each one `reviewed: false`, and the founder's
    `record-approval-193.py` run attests exactly those values;
  - there is no em dash in any locale;
  - `nav.utility.datesPending*` is absent everywhere.
- AC-37's phrase bullet (T-47) holds:
  - the unit scan over the en/en-gb catalogues, the seed copy and the corridor files finds exactly
    the six named exceptions;
  - the `en/pl-guide.md` intro now carries the founder's sentence (E3);
  - the e2e scan is `tests/e2e/phrase-scan.spec.ts`, judged by CI.
- `unreviewedShare("en")` is 22 of 535 keys (4.11 %), so `en` and `en-gb` stay indexable.
- Mutations watched red:
  - one character changed in N1 `en`;
  - an em dash in N1 `de`;
  - the old N3 sentence restored;
  - an added exception, which also turns the "never grows" case red.
- Tests:
  - unit: `neutral-ordering-copy.test.ts`, 19 cases;
  - e2e: `phrase-scan.spec.ts`, 22 cases;
  - pins moved in 6 unit files and 6 e2e files;
  - sitemap fixtures regenerated, because the `<lastmod>` moves to 2026-10-05.
- Visual baselines (E4): refreshed through the `visual:baselines` label flow on the PR. No local
  build slot was taken.

**Follow-up, not this task.** The founder approved the other exception-list rewrites ("2–6 yes",
2026-10-05) for a follow-up task:
- `corridor.facts.orderBy.none`;
- the five FAQ answers in `en/pl-guide.md`, `en-gb/pl-guide.md`, `en/es-guide.md`,
  `en-gb/es-guide.md` and `en-gb/fr-guide.md`.
Each changed key ships `reviewed: false` and needs its own founder record run. Each entry leaves
T-47's exception list in the PR that ships its replacement. The em-dash proposals for
`company.support.hours` and `shop.card.noPrice` are in PR 194's description.

`pnpm gates:cheap` at 96e97a49 exits 0. The load average was 16 to 43, from other agents. Earlier runs at loads of 25 to 100 timed out on five heavy files that pass on their own:

```
gates:cheap · 96e97a49c8a4ff63aa3224fba64a4926452d0bba · tree clean · base origin/main · 2026-10-05T06:57:06.224Z
typecheck             exit 0 · 3.5 s
lint                  exit 0 · 17.0 s
format:check          exit 0 · 11.1 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 116.3 s · changed 128 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

After the rebase onto `main` 9bc90368 (TASK-200): the range-diff shows `=` for every commit,
including the founder's 61dba4ff. Only `docs/codebase-map.md` was regenerated. Two
`gates:cheap` runs at e5e9f92c, at load averages of 35 to 36 from other agents, failed on the
`tests` gate only. All 9 failures were 5 s timeouts in files this diff does not touch
(`catalog-listing`, `catalog-product-routes`, `checkout-currency`, `product-route`, `url-pii`).
The other six gates exited 0. CI on the head SHA is the gate of record.
