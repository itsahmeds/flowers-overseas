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

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
