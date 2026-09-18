# TASK-093 — Schema builders: `BreadcrumbList` equal to the visible trail, `FAQPage` equal to the visible Q&A character for character, `Organization` (only `company.ts` fields) + `WebSite` without `SearchAction` on the locale home; JSON-LD type scan forbidding `LocalBusiness`/`FloristShop`/`Product`/`Offer`/`aggregateRating`/`review`; `seo:validate` (schema) fixtures for both states + hub

Row: `TASKS.md` → TASK-093. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-093`; keep it current by editing this file, not the row.

## Binding

- Owns spec 007 **AC-15** (§9 L260) and **AC-16** (§9 L261); tests **T-16** (unit + contract) and
  **T-17** (e2e JSON-LD type scan) (§10 L302–L303). §12 task (7) "schema builders + validators".
- §5.2 L65 is the design: typed builders in `src/modules/seo/schema/` — `breadcrumbList.ts`,
  `faqPage.ts`, `organization.ts`, `webSite.ts`, `JsonLd.tsx` (§5.2 L150 layout) — exported only
  through `src/modules/seo/index.ts`. `BreadcrumbList` on the corridor **and** the all-destinations
  hub, items equal to the visible breadcrumb in order and label; `FAQPage` built **from the same
  `corridorView` the FAQ block renders** (never a second source of the Q&A) and emitted only where
  8–12 visible Q&A exist; `Organization` on the locale home with only `name`/`url`/`logo`, gaining
  `address`/`vatID`/`sameAs` only when `company.registered` is true (`src/config/company.ts`);
  `WebSite` without `SearchAction`. **Never** `LocalBusiness`, `FloristShop`, a per-city entity,
  `Product`, `Offer`, `aggregateRating`, `review`, and never an `Offer` for a non-live country.
- Spec 001's `validate-schema` (`pnpm seo:validate`, `scripts/seo/validate-schema.ts`) must pass on
  fixtures for **both corridor states** (guide / published) **and the hub**; the fixtures live where
  TASK-009's validator already reads them — extend, do not fork.
- Rulings that bind here: spec 007 §14 A1–A7 (read all; A6 for the 404 shapes a scan must not
  visit, A7 for the sixth `operational` indexability term); spec 008 §14 A2 (provenance note once
  per card — no schema counterpart), A3 (`HubCardViewSchema` + `hubItems`: listing JSON-LD is
  TASK-109+'s, not this task's — build no `ItemList`/`Product` here).
- Boundaries: `app/` stays thin — a page composes `JsonLd` from the builder's output and nothing
  else; builders take view models, never fetch. No literal user-facing strings; the breadcrumb
  labels come from the same message keys the visible trail renders.
- Gates: unit (builders, equality with the visible trail/Q&A), contract (`seo:validate` schema on the
  three fixtures), e2e T-17 type scan over every rendered page in every locale, `pnpm typecheck`,
  `pnpm lint`, `pnpm codebase:map --check`, script budget unchanged (the JSON-LD is a
  server-rendered `<script type="application/ld+json">`, no client JS).

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §5.2 L57–L65 (rule engine, schema
  builders), §5.2 L127–L160 (module layout), §9 AC-15/AC-16, §10 T-16/T-17, §14 A1–A7.
- `specs/008-country-shop-category-occasion-pages.md` §14 A2/A3 only (what is *not* this task's).
- `docs/codebase-map.md` — `modules/seo`, `modules/corridor` (or wherever `corridorView` /
  `listCorridorPages()` live), the hub and corridor routes, `config/company.ts`,
  `scripts/seo/validate-schema.ts` and its fixtures, `tests/e2e/` scan specs to mirror.
- `plan/02` §9 (schema policy), `plan/01` §5 (module boundaries).
- `docs/tasks/TASK-091.md` and `docs/tasks/TASK-092.md` `## Result` — the corridor and hub view
  models and breadcrumb components you must mirror, and their `/review` carry-forwards.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **(2026-09-18) Three rulings taken in-task rather than escalated, each recorded here for the
  reviewer to accept or reverse.** None of them changes an AC; all three are narrowings the spec
  already implies, in the shape `/review 65` accepted for AC-10.
  1. **Spec 004 AC-16's "a 004 page emits no JSON-LD" is narrowed to "none of spec 004's own".**
     Spec 007 AC-15 requires the **locale home** to emit `Organization` + `WebSite`, and spec 004
     §8 always said spec 007 owns structured data. `tests/e2e/honesty.spec.ts` now asserts the
     stricter thing — exactly those two nodes, no `FAQPage` over the five disclosures, no
     `Product`, no `Review` — instead of a bare count of zero. Same move as AC-10's canonical
     clause, recorded on TASK-090's brief.
  2. **`validate-schema`'s `ALLOWED_TYPES` gains `Question`.** Its own table has always read
     "`FAQPage` (+ `Question`, `Answer`)" and `Answer` was already listed; the omission was a
     transcription slip, found by the first real `FAQPage` fixture. `plan/02` §9 is unchanged —
     a `FAQPage` without `Question` children is not a valid `FAQPage`.
  3. **The `<script type="application/ld+json">` is the second `dangerouslySetInnerHTML` in
     `src/`.** Spec 004 §5.2's "exactly one inline script" invariant
     (`tests/unit/consent-bootstrap.test.tsx`) is re-worded to "one *executable* inline script":
     a data block whose type is not a JavaScript MIME type is never prepared or executed as a
     script, so the hash-based `script-src` still carries exactly one hash and needs no nonce.
     `tests/e2e/security-headers.spec.ts` is green with the blocks present.

## Result

Shipped in PR #81. `src/modules/seo/schema/` holds the five files §5.2 L150 names —
`breadcrumbList.ts`, `faqPage.ts`, `organization.ts`, `webSite.ts`, `JsonLd.tsx` — exported only
through `src/modules/seo/index.ts`, plus `schemaOptions()`, the fail-closed rule that emits no
document at all when `NEXT_PUBLIC_SITE_URL` is not a URL. Each builder is a projection of a view
model: `BreadcrumbList` from the same `view.breadcrumb` array `CorridorBreadcrumb` renders (a crumb
that renders as text announces no `item`; fewer than two crumbs emit nothing), `FAQPage` from the
same `view.faq` the FAQ block renders and only inside the 8–12 band, `Organization` from
`company.ts` (`name`/`url`/`logo` today; `address`/`vatID`/`sameAs` only once `registered` flips),
`WebSite` with no parameter that could ever become a `SearchAction`. The corridor route, the hub
route and the locale home fill the slots they had reserved; nothing else in them changed. Tests:
**unit** `tests/unit/seo-schema.test.tsx` (17 cases — the trail and the Q&A compared against the
*rendered* components in `en`/`en-gb`, the two field-set pins, the `@graph`/escaping cases, the
allow-list walk), **contract** `tests/contract/seo-schema-fixtures.test.ts` (4 cases; the three new
fixtures in `tests/fixtures/seo/schema/` are rebuilt from the builders every run and
`validate-schema` runs over the committed directory — `4 fixture(s) ok`), **e2e**
`tests/e2e/schema.spec.ts` (92 cases across 22 URLs × 2 projects: the type scan, the served trail,
the served Q&A, the home identity). Numbers a reviewer wants: unit 4 225 / 5 skipped in 176 files,
contract 26, e2e 873 passed with two pre-existing failures reproduced on `main`'s own files (the
`darwin` casing 404 pair, green on rerun, and the `home.spec.ts` type-ahead hit test, which fails
identically with this task's home page reverted to `main`'s), a11y 73, visual 43, Lighthouse green
on all nine URLs over the Brotli origin, `budget:client-js` unchanged (JSON-LD is markup, not
script). Handed on: TASK-115 extends `breadcrumbList` to spec 008's six page types and adds the
`ItemList` builder; TASK-130 the gated `Product`/`Offer`; TASK-094's sitemap and TASK-095's
honesty scan inherit `schemaOptions()` and the fixtures.
