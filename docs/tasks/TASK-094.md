# TASK-094 — Sitemaps: `/sitemap.xml` index → per-locale index → `static.xml` + `corridors.xml`, real `<lastmod>` (max `updatedAt`), full `xhtml:link` sets byte-equivalent to the `<head>` cluster, caps and `Cache-Control: public, max-age=3600`; no `noindex` URL in any sitemap; every sitemap URL 200 (full fetch in e2e); `seo:validate` sitemap + hreflang over the built set

Row: `TASKS.md` → TASK-094. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-094`; keep it current by editing this file, not the row.

## Binding

- Owns spec 007 **AC-11** (§9 L252), **AC-13** (§9 L256), **AC-14** (§9 L257); tests **T-12**,
  **T-14**, **T-15** (§10 L298, L300, L301). §12 task (8) "sitemaps + robots" — robots policy
  already shipped in TASK-090 (§14 A5), so this task is the sitemaps and the hreflang equality.
- §5.2 L67–L69 is the design: `/sitemap.xml` (index) → `/sitemaps/{locale}/index.xml` →
  `/sitemaps/{locale}/static.xml` (home, hub) and `/sitemaps/{locale}/corridors.xml`; **no other
  child** until its spec ships (an absent child is correct, an empty one is noise — the shop
  children are TASK-109+'s, fed by TASK-107's `listingView()`). Route handlers under
  `src/app/sitemap.xml/route.ts` and `src/app/sitemaps/[locale]/[child]/route.ts`, logic in
  `src/modules/seo/sitemap/` (`index.ts`, `statics.ts`, `corridors.ts`, `xml.ts`; §5.2 L151),
  exported only through `src/modules/seo/index.ts`. `Cache-Control: public, max-age=3600`;
  ≤ 10 000 URLs and ≤ 10 MB per child; `xhtml:link` alternates on every URL from the **same**
  `alternatesFor()` call the `<head>` cluster uses (§5.2 L61 — never a second generator);
  `<lastmod>` = the real maximum `updatedAt` across the content file, the country registry entry
  and the message catalogue, never "now"; `x-default → /en`; never `en-150`.
- **Membership predicate (carry-forward from `/review 74`, TASK-092):** a URL is listed iff it is in
  `listCorridorPages()` (existence) **and** `pageIndexability(descriptor).indexable` is true. There
  is no `inSitemap` field on the indexability verdict — the verdict is `{ indexable, directive,
  terms }` (§5.2 L145's `inSitemap` is superseded by the shipped API; do not add the field). The
  AC-7 sitemap-row half deferred by TASK-092 is proven **here**: a fixture flip of
  `guidePublished` adds/removes the row.
- Rulings that bind: spec 007 §14 A5 (robots: `sort=` only), A6 (trailing slash 308 — sitemap URLs
  carry none), A7 (`operational` term; absent ≠ satisfied — a sitemap must call the same
  `pageIndexability()` and never re-derive the directive). `/review 74`: the footer links the hub
  only (no sitemap link in chrome).
- Gates: T-12 equality test per URL (`<head>` cluster vs `xhtml:link` set), T-14 contract via spec
  001's `validate-sitemap` (`pnpm seo:validate`) over the **real built URL set**, T-15 e2e fetches
  **every** sitemap URL → 200 and asserts sitemap ∩ noindex = ∅ (no sampling), `pnpm typecheck`,
  `pnpm lint`, `pnpm codebase:map --check`; ISR tag `sitemap` through `src/lib/cache.ts` (§5.4).
- Boundaries: `app/` thin; zod at the route boundary for `[locale]`/`[child]`; unknown child or
  locale → 404, no redirect (A6 shapes).

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §5.2 L57–L69, L127–L160, §5.4 L188+, §9
  AC-11/13/14, §10 T-12/14/15, §14 A5–A7.
- `docs/tasks/TASK-092.md` — `## Carry-forwards` item 1 and `## Escalations` note 1 (the sitemap
  half of AC-7 is yours); `docs/tasks/TASK-090.md` `## Result` (robots, indexability engine).
- `docs/codebase-map.md` — `modules/seo` (`indexability.ts`, `canonical.ts`, `metadata.ts`),
  `modules/i18n` `alternatesFor()`, `listCorridorPages()`, `src/lib/cache.ts`,
  `scripts/seo/validate-sitemap.ts` + fixtures, `tests/e2e/` crawl specs.
- `plan/02` §8 (hreflang), §10 (sitemaps); `plan/01` §3 (caching), §5 (boundaries).

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
