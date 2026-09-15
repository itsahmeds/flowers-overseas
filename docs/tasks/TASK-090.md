# TASK-090 — `src/modules/seo` rule engine: `indexability()` (exists × reviewed × `isLocaleIndexable` × `isIndexingEnvironment`, 16-case table), self-referencing canonical builder, `robots.txt` in indexing vs non-indexing environments per `plan/02` §7, page metadata helpers

Row: `TASKS.md` → TASK-090. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **AC-9** — `indexability()` is `index,follow` only when the page exists, `reviewed === true`,
  `isLocaleIndexable(locale)` and `isIndexingEnvironment()`; otherwise `noindex,follow`. A
  table-driven test covers all sixteen combinations (unit half here; the e2e half needs TASK-091's
  route).
- **AC-10** — self-referencing canonical: absolute, lowercase, no trailing slash, no query; no
  cross-locale canonical is expressible; **a `noindex` page emits its canonical unchanged**.
- **AC-12** — `robots.txt` unchanged (`Disallow: /`) in a non-indexing environment; the `plan/02`
  §7 disallow list plus exactly one `Sitemap:` line in an indexing environment, blocking no facet
  URL that must be crawled to see its `noindex`.
- **§6 / §12 / §13 Q5** — the environment gate is the flip: production **and** the canonical host.
  Everything is built and tested while the answer is `false`; the flip is configuration (TASK-096).
- **spec 003 §14 A5** — the `en-150` non-emission ruling and `alternatesFor()` stay spec 003's;
  this task neither reimplements nor extends them (AC-11 is TASK-091/094's).
- **ADR-0018 / spec 040 draft** — `isIndexingEnvironment()` must sit on one small predicate so the
  `VERCEL_ENV` → `APP_ENV` swap is one line: it is built on `deploymentEnvironment()` in
  `src/lib/env.schema.ts`, which is that line.
- Gates: lint, typecheck, `format:check`, `pnpm test`, `seo:validate`, `check:no-db`,
  `tasks:check`, `codebase:map --check`, `specs:index --check`, cold build. No Playwright,
  Lighthouse or visual work (no route yet).

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §2 (indexability/canonical/robots bullets),
  §6 (the contract; AC-29 at L200), §9 AC-9/AC-10/AC-12, §10 T-10/T-11/T-13, §12, §13 Q5, §14.
- `plan/02-seo-spec.md` §7 (canonicalisation, facets, the disallow rows), §8 (hreflang), §10
  (sitemaps: robots names only `/sitemap.xml`), §12 (translation gating), §4.1 (which paths carry a
  locale prefix).
- `src/lib/env.schema.ts` (`deploymentEnvironment()`), `src/app/robots.ts`, `src/lib/robots-headers.ts`,
  `src/modules/i18n/review.ts` + `alternates.ts`, `docs/codebase-map.md`.

## Carry-forwards

- **From `/review 63` / `/review 64` (2026-09-16):** nothing binding on this task — 087 and 089 are
  independent; this branch is cut from `origin/main` and shares no file with either.

## Escalations

- **2026-09-16 — `plan/02` §7 "facet parameter shapes": which shapes may `robots.txt` block?**
  Spec 007 §2 says the disallow list includes "the facet parameter shapes", and the next sentence
  says "facets are **not** disallowed as URLs so their `noindex` can be seen (`plan/02` §7) — only
  the `?`-parameter shapes named there". `plan/02` §7 names four parameter families: pagination
  (`?page=N`, **indexable**), facets (`?colour=`, `?price=`, flower type — `noindex` but must be
  crawled), sort (never in an indexable URL) and UTM/`gclid`/`fbclid` (stripped from the canonical,
  not blocked). **Decision taken, not guessed:** only `sort=` is blocked (`/*?*sort=`); colour,
  price, flower type, `page` and the tracking parameters stay crawlable, which is the only reading
  that satisfies AC-12's own clause. `DISALLOWED_PATHS` is one exported array and
  `tests/fixtures/seo/robots/plan-02-disallow.json` records the sentence each entry comes from, so
  a different founder ruling is a one-line change plus a fixture edit. **Answer: open** — needs a
  yes/no from the founder or the reviewer before TASK-096's flip, not before this merges.
- **2026-09-16 — spec 004 AC-16 vs spec 007 AC-10 (canonical on a `noindex` page).** 004 AC-16:
  "No JSON-LD, canonical or hreflang tag is emitted by any page in this spec (spec 007 owns them)".
  007 AC-10: "a page that is `noindex` emits its canonical unchanged". These do **not** conflict:
  004's reason is ownership (spec 007 builds the tag), not a rule that a `noindex` page must not
  carry one. Read as a rule, 004 AC-16 would forbid the canonical on the very pages 007 AC-10
  requires it on, so the ruling recorded here is: **007 AC-10 governs from the moment TASK-091
  renders a corridor page**; the spec 004 pages that this task does not touch keep their current
  output, and the spec 004 T-18 assertion must be narrowed by whoever first adds a canonical to a
  004 page (TASK-091/092 for the locale home). No spec amendment filed: nothing in 004 is violated
  by anything in this PR. **Answer: open for the reviewer to confirm** the narrowing note lands on
  TASK-091 rather than here.
- **2026-09-16 — locale-prefixed `checkout`/`search`/`track`.** `plan/02` §4.1 puts them behind the
  locale prefix (`/en-gb/checkout/*`), but their localised path segments do not exist
  (`src/config/locales.data.ts` has seven segment keys, none of them these). The unprefixed forms
  ship; the prefixed forms belong to specs 008/010/013 and are recorded in the module header and in
  the fixture. **Answer: none needed** — recorded so it is not rediscovered.
- **2026-09-16 — `scripts/check-no-db-imports.ts` `SCANNED_PATHS`.** `src/modules/seo` reads no
  database and should join the scan list, but that list belongs to spec 007 AC-1, owned by
  TASK-087 (in review, same file). Not touched here to avoid a cross-task edit; handed to TASK-091
  or whoever closes AC-1.

## Result

PR [#65](https://github.com/itsahmeds/flowers-overseas/pull/65). Five new module files under
`src/modules/seo/` — `environment.ts` (`isIndexingEnvironment()` on `deploymentEnvironment()`,
`CANONICAL_HOST`, `deploymentDescriptor(process.env)`), `indexability.ts` (the rule as a
conjunction over `INDEXABILITY_TERMS`, plus `PAGE_TYPE_POLICY` so `/` and `/dev/components` can
never open), `canonical.ts` (`canonicalPath`/`absoluteUrl`/`canonicalFor`, which **throws** on a
cross-locale canonical), `robots.ts` (`robotsPolicy`/`robotsTxt`/`robotsMetadataRoute` and the
`DISALLOWED_PATHS` array) and `metadata.ts` (`robotsMeta`, `pageMetadata`, `hreflangLanguages`) —
exported through the barrel; `src/app/robots.ts` now serves the policy. Tests: **79 unit** across
five files (indexability 28, canonical 23, robots 13, environment 8, metadata 7) (16-case table + the page-type table, canonical normalisation and the cross-locale
throw, both robots bodies byte-exact and pinned against Next's own `resolveRobots()`, the
`plan/02` §7 fixture subset and the must-stay-crawlable set, the environment gate, the metadata
helpers) and **two parked e2e specs** (`tests/e2e/seo-indexability.spec.ts`,
`tests/e2e/seo-canonical.spec.ts`) that skip on a 404 from `/en-gb/send-flowers-to/poland` and
start asserting the moment TASK-091's route answers. Gates: lint, typecheck, `format:check`,
3 176 unit tests / 148 files green (79 added), `seo:validate`, `check:no-db`, `tasks:check`,
`codebase:map --check`, `specs:index --check`, cold build (`/robots.txt` still `○ Static`, body byte-identical to the closed
string). `docs/codebase-map.md` is 12 272 B against main's 12 288 B cap — two doc lines were
shortened to fit; spec 001 §14 A16 (on TASK-087's branch) raises the cap to 16 KB.
Handed to TASK-091/092: `pageIndexability(descriptor, deploymentDescriptor(process.env))`,
`canonicalFor(locale, path, { baseUrl })`, `pageMetadata({ … })`. Handed to TASK-094:
`verdict.indexable` as the single sitemap-membership answer, and `SITEMAP_PATH`.
