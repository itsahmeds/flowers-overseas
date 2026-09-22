# TASK-143 — Assertion-strength sweep over `main`: six defects of the "passes with its subject removed" class were found in one day (PRs 84, 87, 89 ×2, 93 ×2, 94 ×2), and **two are already merged** — `tests/unit/catalog-shop-page.test.tsx:173` and `tests/e2e/country-shop.spec.ts:111` carry the same weak LCP shape PR 89 round 3 fixed, comparing counts to a nomination's own length so a page nominating nothing passes. Sweep the committed suites for the shapes now catalogued in `CLAUDE.md`'s definition of done, fix what is real, and record what is deliberate. Each fix is proved by mutating the subject and watching the case go red.

Row: `TASKS.md` → TASK-143. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-143`; keep it current by editing this file, not the row.

## Binding

**Six in one day.** Every one was found by a reviewer *mutating* the subject, never by reading:

| Where | The shape |
|---|---|
| PR 84 | an AC "proved" in prose instead of the fixture flip its brief bound |
| PR 87 | `seo:validate` passed a document with breadcrumb positions `0, 7`, an unnamed `ListItem` and a nameless `Organization` |
| PR 89 | `expect([200, 404]).toContain(status)` where those are the only reachable statuses |
| PR 89 | LCP counts compared to a nomination's own length, so zero-vs-zero passes |
| PR 93 | a descriptor term deletable at two separate links with the whole suite green, **fail-open** |
| PR 94 | an uploader's size cap and watermark refusal both neutered with 4,357 cases green |

**Two are already merged** and are your starting point, not your scope:
`tests/unit/catalog-shop-page.test.tsx:173` and `tests/e2e/country-shop.spec.ts:111` carry the
same weak LCP shape PR 89 round 3 fixed. Read that fix first —
`tests/support/lcp-nomination.ts` on the TASK-110 branch — and reuse it rather than inventing a
second idiom.

**The catalogue of shapes to sweep for**, from `CLAUDE.md`'s definition of done:

- a `toContain` over a set that covers every reachable value
- a count compared against a collection derived from the same page (`x.length` on both sides)
- a universal over `… ?? []` or `match(…) ?? []`, which zero elements satisfy
- an optional field whose omission silently leaves a conjunction — **fail-open is the worst of these**
- a grep of source text standing in for behaviour, which catches deletion but not neutering
- `toBeDefined()` / `toBeGreaterThan(0)` on something that cannot be otherwise
- an assertion true for the wrong reason, because two states coincide in Phase 0

**The rule that makes this task safe, and it is not optional.** A weak assertion is a **finding**.
Do not widen a gate, loosen a threshold, or delete a case to turn red green. If a sweep turns up
something that is red for a real reason, that is a defect in the code, and it stops being this
task's business the moment you have identified whose it is — record it in `## Escalations` with
the owning task and move on.

**Prove every fix.** Mutate the subject, watch the case go red, restore, and say so. A
strengthened assertion that was never observed failing is the same defect wearing a new coat, and
would be the seventh instance — in the task written to stop the class.

**Judgement, not a regex.** `expect([301, 308])` was *inspected and kept*, and that is the line
for the whole codebase: the rule is not "never assert over a set", it is **"the assertion must be
able to fail"**. `[200, 404]` covered the entire outcome space of its request; `[301, 308]` is a
tolerance across two acceptable implementations that still excludes 200, 404, 302 and 307, with a
separate `Location` assertion carrying the substance. Expect to keep things. Record why.

**Scope discipline.** Tests and test helpers only. If a sweep would require a production change
to become falsifiable, that is an escalation, not a licence — say so and leave it.

**Report a count, not a vibe.** `## Result` says how many files were swept, how many shapes were
found, how many were fixed, how many were kept deliberately and why.

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last. (Heading restored by the reviewer: `53aa9f7` had
deleted it — see item 1.)

- **From `/review 99` round 1 (2026-09-23) — FAIL, head `08f621c`** (CI run 35773941500 green,
  24 pass, `ci:full`; the diff is `tests/`, `docs/codebase-map.md` and this brief only, with no
  production file). The mutation evidence mostly holds. Reproduced: shop-page AC-24 with preload
  `imageSizes: "100vw"` and with the nomination moved to the second photograph (old case passes,
  new case fails `expected [ { …(2) } ] to deeply equal …`). Deleting `\bsterne\b` (old scan
  green, new scan `5 Sterne: expected [] to include 'star'` and `expected 88 to be 89`).
  `regex-branches.ts` returning zero mutants (`expected +0 to be 89` / `28`). It parses escaped
  `|`, `|` inside a class, nesting, named groups and lookbehinds correctly. Neutered sites
  `tasks-brief` missing-brief, `seed/check` person-allowlist and `corridor-check` other-destination
  slug all fail. Commenting out `assertRuntimeEnv` in the health route leaves the old greps green
  and fails the new case. `container.test.ts` is deterministic across five ambient envs and with
  fake credentials exported, reads nothing from `.env.local` (vitest never loads it), and prints
  no values. Required changes:
  1. **Restore the brief.** `53aa9f7` rewrote `## Binding` from `record it in \`## Escalations`
     onward. It deleted "Prove every fix", "Judgement, not a regex", "Scope discipline" and
     "Report a count", and removed the `## Read`, `## Carry-forwards` and `## Escalations`
     headings, so the three escalations now sit inside a broken sentence. Restore the section from
     `origin/main` and put the escalations back under `## Escalations`.
  2. **`scripts/tasks-brief.ts:264` is not unreachable.** `concatNotes` rejoins with exactly one
     space, so a TASKS.md cell with two spaces (or none) before a `**From \`/review` marker makes
     `migrate()` return `TASK-009: notes would not survive the split — migration refused`. Probed
     end to end through a fixture ledger. Add that case, prove it with the site neutered, and
     change the count to 3 unreachable.
  3. **A kept item is the vacuous shape.** `tests/unit/seo-indexability.test.ts:173`
     `expect(["never", "byRule"]).toContain(policy)` ranges over
     `Record<SeoPageType, "never" | "byRule">`, which is every value the type allows (PR 89's
     `[200, 404]`). With `corridor` deleted from `PAGE_TYPE_POLICY` and `categoryHub` flipped to
     `"never"`, the case stays green, and the flip alone leaves all 29 cases in that file green.
     (`catalog-listing.test.ts` catches it elsewhere.) State the whole map, or at least the key
     list, and prove both mutants.
  4. **The provider escalation understates the defect.** Every static provider method returns its
     module array itself, unfrozen, with unfrozen rows: all nine across catalogue, price, addon
     price, FX and flags (`same array: true`, `frozen: false`, `row frozen: false`). A caller can
     change `amountMinor` for every later reader, not just truncate `countryPrices()`. Rewrite the
     escalation to that scope. It stays `open` until the orchestrator names the owning task; see
     the review report for the recommendation.
  Nits (not blocking): `country-shop.spec.ts` AC-24 compares `imagesrcset` but not `imagesizes`,
  so the sizes mutant is caught only by the unit half. `regex-branches.ts` mis-parses `(?i:…)`
  modifier groups, though it throws rather than passing. Its pin is an aggregate, where a
  per-pattern count would be tighter. `i18n-check.ts:542` is untestable without mocking the live
  registry rather than unreachable. `container.test.ts` and `## Result` say "ten server keys", but
  `RUNTIME_ENV_KEYS` has 21. The `seed-copy` AC-5 loop over `?? []` passes with every `en-gb` file
  deleted; a sibling case catches it, but a non-empty guard would be clearer. The three TASK-113
  findings are all confirmed real: the occasions-index case stays green with the order reversed
  and with every `kind` set to `evergreen`, and `hubs.spec.ts:108` / `country-occasion.spec.ts:115`
  accept a self-redirect.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-23 — a real defect, not this task's: the static price provider hands out its own
  module array** (owner: spec 005's provider layer — TASK-069 shipped it and is `done`; TASK-070's
  DB providers run the same contract). `tests/contract/support/catalog-provider-contract.ts:136`
  ("a caller's mutation is not shared") truncates **a copy** (`[...first]`) and then checks the
  next read, so it can never observe sharing. Written to mutate what the provider returned, it
  goes red: `expected 1 to be 3332` — `staticPriceProvider.countryPrices()` returns
  `COUNTRY_PRICES` itself, unfrozen, so one caller's `.length = 1` truncates every later read.
  The case is **left as it is**: strengthening it here would turn CI red for a production defect
  this task may not fix. The fix is the provider's (freeze or copy), then the case can mutate
  `first` directly. To the orchestrator — `open`.
- **2026-09-23 — handed to TASK-113 (PR 98 owns the subject):**
  `tests/unit/catalog-listing.test.ts:384` "lists every occasion hub … grouped by kind" asserts no
  grouping at all: its count is corpus-vs-corpus, the loop is over `view?.occasions ?? []`, and the
  `toContain(entry.kind)` is over a `z.enum` the view is parsed with. With `listing.ts`'s
  occasions reversed, or every `kind` set to `evergreen`, the case stays green. PR 98 rewrites
  that surface and adds `catalog-occasions-index.test.tsx`; it should pin the grouped order there.
- **2026-09-23 — handed to TASK-113 (files in PR 98):** `tests/e2e/hubs.spec.ts:108` and
  `tests/e2e/country-occasion.spec.ts:115` check the trailing-slash `Location` with
  `toContain(bare)`, which a 308 to the slash form itself (a loop) satisfies — proved on the two
  siblings fixed below. Make them `toBe(bare)`.

## Result

**PR [#99](https://github.com/itsahmeds/flowers-overseas/pull/99)** — tests and test helpers only;
no production file changed. Method: every catalogued shape was grepped across the **276** test
files on `main` at `d1c0537` (unit 199, e2e 32, a11y 14, visual 14, integration 6, contract 5,
msw 3, support 3) and every hit read; then, because PR 87's class lives in validators rather than
in assertions, **17 checker sources** were mutation-swept — each of their **193** problem-reporting
sites neutered in turn (`problems.push(` → a no-op call) and the checker's own unit/contract suite
run. A site whose neutering leaves the suite green is a rule no test can see fail.

| | found | fixed | kept, with reason | escalated / handed over |
|---|---|---|---|---|
| Assertion shapes (the catalogue) | 122 inspected | **12** | 107 | 1 escalation, 2 to TASK-113 |
| Checker rules no test reached | 48 of 193 sites | **44** | 4 (unreachable) | — |

**The two merged instances** (brief's starting point), rewritten on PR 89 round 3's
`tests/support/lcp-nomination.ts` rather than a second idiom:

| Fix | Mutation of the subject (old case → new case) |
|---|---|
| `catalog-shop-page.test.tsx` AC-24 (stated `PHOTOGRAPHED_CARDS = 2`, descriptor equality, `nominatedImageCard === 0`) | `listing.ts` `photoFor` → no asset: old **pass**, new `expected [] to have a length of 2 but got +0`. `ListingGrid` nominates the second photograph: old **pass**, new `expected [ { …(2) } ] to deeply equal [ { …(2) } ]`. `preload.ts` `imageSizes: "100vw"`: old **pass**, new same descriptor failure. |
| `country-shop.spec.ts` AC-24 (first card's `<source>` vs head preloads, eager/high/lazy pinned) | Local build (slot held, port 3143, load 4–7 on 8 cores). Second-photograph mutant: old **pass**, new `expect(received).toEqual(expected)`. No-photograph mutant: old **pass**, new `Expected length: 1 / Received length: 0`. Clean build: 22 passed, 2 skipped (the mis-cased case self-skips on a case-insensitive local target). |

**The other ten assertion fixes:**

| Fix | Mutation (old → new) |
|---|---|
| `catalog-hub-pages.test.tsx` "names every published destination": count was view-vs-page, "sorted" ran over names scraped from all page text. Now the `data-fo-hub-destination` codes in order, stated. | `listing.ts` hub destinations emptied: old **pass**, new `expected [] to deeply equal [ 'FR', 'DE', … ]`; only Poland: old **pass**, new `expected [ 'PL' ] …`. (The old case *did* catch a renderer-side reversal; its gap was view-side.) |
| `corridor-page.test.tsx` FAQ: loop and `<h3>` count both over `guide.faq`. Now `GUIDE_FAQ_ITEMS = 10`. | `corridor.ts` `faq: []`: old **pass**, new `expected [] to have a length of 10 but got +0`. |
| `app-shell.test.tsx` ×3: `String(metadata.title).length > 0` is true for `undefined` (nine characters). Now the authored `meta` strings. | Home metadata `return {}`: old **pass**, new `en: expected undefined to be 'Flowers Overseas — …'`; title/description keys swapped: old **pass**, new red. Chooser and 404 descriptions dropped: old **pass**, new `expected undefined to be 'We send…'` / `'That page does not exist…'`. De/pl `meta.home` are still English, so "localised" and "English everywhere" coincide in Phase 0 — noted in the case. |
| `container.test.ts`: `toContain("assertRuntimeEnv(process.env)")` passes a commented-out or never-taken call. Added `register()` and `GET /api/health` called with the ten server keys absent. | Guard `isBuildPhase() && !isBuildPhase()`: old **pass**, new `promise resolved "undefined" instead of rejecting`; health call commented out: old **pass**, new `expected [Function] to throw an error`; build-phase guard removed: new `promise rejected … instead of resolving`. |
| `listing-honesty-scan.test.ts`: one sample per pattern, so a German/Polish branch was deletable (fail-open). New `tests/unit/support/regex-branches.ts` generates every single-branch deletion at every depth; each of the **89** must be missed on some sample. | On `tests/support/listing-honesty.ts`, against the old scan plus all six unit files that import the helper (179 cases): delete `\bsterne\b`, delete `\btaggleiche`, neuter `\bpolecane dla ciebie\b` — each old **179 pass**; delete inner `cart` — old **155 pass**. New: `5 Sterne: expected [] to include 'star'` and `expected 88 to be 89`, and the same for each. Dropping one sample: `expected [ 'star: \bsterne\b', … ]`. One branch is genuinely redundant and named (`the same day` inside `deliver…`, already matched by `\bsame[- ]day\b`). |
| `home-honesty.test.ts`: `FORBIDDEN.some(…)` per claim, so a shadowed pattern (`out-of-five`, `review count`) or branch (`feefo`, `fleurop`) was deletable. Same branch check, **28** mutants, 0 survivors. | Delete `\|fleurop`, `\|feefo`: old **13 pass**; new `Fleurop: expected false to be true`; drop the Feefo sample: `expected [ 'Trustpilot mark: feefo' ] to strictly equal []`. |
| `country-shop.spec.ts` / `country-category.spec.ts` trailing slash: `Location` `toContain(bare)`. Now `toBe(bare)`, as `corridor.spec.ts` does. | Mutant `skipTrailingSlashRedirect` + proxy 308 to the slash form itself (a loop): old **pass** ×2; new `Expected: "/en/poland/flowers" / Received: "/en/poland/flowers/"` and the `roses` twin. Clean: 46 passed, 4 skipped, desktop + mobile. |

**Checker rules no test reached** (every site re-neutered after the fix; the "after" column is
survivors):

| Checker | sites | survived before → after | added |
|---|---|---|---|
| `scripts/seo/validate-hreflang.ts` | 7 | 2 → 0 | file-level case: non-https page URL and relative alternate |
| `scripts/seo/validate-sitemap.ts` | 4 | 2 → 0 | a sitemap with **no `<loc>`** (PR 87's class), an unreadable `noindex.json` |
| `scripts/seo/validate-schema.ts` | 20 | 5 → 0 | a graph with **no typed node**, a crumb that is not an object / has no `@type ListItem`, non-money `visiblePrice` and `Offer.price` |
| `scripts/i18n-check.ts` | 23 | 11 → 1 | seven single-fault copies of `_cases/clean/` + two registry fixtures |
| `scripts/catalogue-check.ts` | 38 | 4 → 0 | funeral ladder start, overlapping sub-bands, no surcharge transcription, FX self-rate |
| `seed/check.ts` | 23 | 11 → 1 | ten tree mutations (stray/missing/stale file, lying `origin`, broken prompt file, orphan copy, no `en`, no florist sentence, a person's name, an image with no asset) |
| `scripts/corridor-check.ts` | 23 | 4 → 1 | second branches: `seoTitle`/`seoDescription` absent, a destination as a URL slug (`rumaenien`) |
| `seed/media-variants.ts` | 9 | 4 → 0 | height, `objectKey`, `variant`; and the "asset not in media.json" case, which passed **for the wrong reason** — `ghost-asset` is also in the expected object key and the missing file's path |
| `scripts/tasks-open-decisions.ts` | 14 | 2 → 0 | no Phase 0 row, no Tasks table |
| `scripts/tasks-brief.ts` | 3 | 2 → 1 | a migrated row whose brief was deleted |
| `src/lib/env.schema.ts` | 8 | 1 → 0 | the `.env.example` placeholder origin in a deployed build |
| branch-protection, codebase-map, specs-index, pr-policy, i18n-pseudo, seo/lib | 21 | 0 | — |

**Kept deliberately (107 assertion sites, 4 checker sites):**
- `[301, 308]` ×8 — the settled line: a tolerance across Next's 308 and Cloudflare's 301 that
  still excludes 200/404/302/307, each beside a `Location` assertion.
- `["IMG", "H1"]` (`lcp.spec.ts`) — with `inHero`, excludes the lede, the CTA and any island.
- 17 allow-list memberships (`CATALOG_LOG_FIELDS`, `*_COLUMNS`, `SCANNED_PATHS`, …) — an observed
  key against a declared list; a new key fails. `seed-media-manifest` `source`/`depicts` — the
  literal is spec 002's CHECK list, independent of the schema enum. `PAGE_TYPE_POLICY` values —
  a widened union fails it. `seed-copy` `[…].toContain(true)` — false when no field differs.
- 16 view-derived counts and loops with an independent guard (`> 0`, `FAQ_MIN_ITEMS`, a throwing
  reader — `seo-schema`'s corridor trail was proved: an empty breadcrumb throws in `visibleTrail`).
- 31 `.every` universals, each beside a non-empty guard or an exact count.
- 14 cases whose only assertions are `toBeDefined`/`> 0`, each of which can fail (a missing lookup,
  `undefined` is not a number); `integration/db.test.ts` is a skipped placeholder.
- 16 structural source greps (thin-route, placement, message-key liveness) — wiring rules with a
  behavioural twin elsewhere, not behaviour stood in for.
- Unreachable checker branches: `i18n-check.ts:542` (the live registry is valid; the same function
  is killed through `--registry`), `seed/check.ts:482` (non-Zod parse error), `corridor-check.ts:903`
  (the parse enum rejects a non-destination first), `tasks-brief.ts:264` (lossless split/concat guard).

**Out of scope, untouched:** the depth-3 route and its source-read tests, `country-occasion.spec.ts`,
`src/modules/geo/**` (mutated only transiently for proofs and restored), `geo-delivery.test.ts`,
`tests/visual/**`, and every test file an open PR (86, 94, 96, 97, 98) was changing.

**Gates (local, exit codes):** `typecheck` 0, `lint` 0, `format:check` 0, `codebase:map --check` 0,
the 18 touched unit files plus every caller of a changed helper — 28 files, 796 tests — 0. CI run
and per-job result on the head SHA: see the PR.
