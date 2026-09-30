# TASK-102 — Purge adapter: `cloudflareCacheAdapter` behind `src/lib/cache.ts` `invalidate(tags)` — `urlsForTag()` resolving `home:{locale}`, corridor and page tags to a complete de-duplicated URL set from the registries, purge calls chunked at ≤30 URLs, two retries, logs with counts and tag names only (never a URL list), no-op `Promise<void>` when `CLOUDFLARE_API_TOKEN` or the zone id is absent; no caller changes

Row: `TASKS.md` → TASK-102. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-102`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §5.4 (the purge adapter) and §5.7, §9 AC-22, tests T-22 (unit) and T-23 (integration, MSW). `cloudflareCacheAdapter.invalidate(tags)` resolves tags to a complete, de-duplicated URL set, issues purge calls of at most 30 URLs each, retries twice on failure, logs counts and tag names only (never a URL), and is a no-op returning `Promise<void>` when `CLOUDFLARE_API_TOKEN` or the zone id is absent. `src/lib/cache.ts` stays the only invalidation path, its tag builders (`homeCacheTag`, `corridorCacheTags`, `hubCacheTags`, `SITEMAP_CACHE_TAG`) are the tag vocabulary, and no caller changes. `urlsForTag()` builds URLs from the same registries and URL builders the sitemaps use (the `seo` module), so a page the sitemap lists cannot be missed by a purge; T-22 pins completeness for `home:{locale}` and one corridor tag against those registries, not against a hand-written list. The token and the zone id are runtime keys: this task adds the zone-id key beside `CLOUDFLARE_API_TOKEN` in `.env.example` and `src/lib/env.ts` (both optional, absent means off, per §12 "Feature flags"), and the purge call goes to `api.cloudflare.com` only.

## Read

- `specs/040-hosting-railway-cloudflare.md`: `## 0. Index`, then §5.4 (purge adapter paragraphs), §5.7, §9 AC-22, §10 T-22, T-23, §12 "Feature flags"
- `src/lib/cache.ts`: the seam and the tag builders
- the sitemap builders in `src/modules/seo` (see `docs/codebase-map.md`) and `tests/msw/`: how contracts against external APIs are mocked here
- `docs/codebase-map.md`

**Fence:** `src/lib/cache.ts` and a new `src/lib/cache-cloudflare.ts` (or a name beside it), `src/lib/env.ts` and `.env.example` (the two `CLOUDFLARE_*` runtime keys only), `tests/unit/` and `tests/integration/` files for the adapter, an MSW handler for the purge endpoint under `tests/msw/`, this brief, the row and the map. **Not** `config/cloudflare/`, `scripts/`, `package.json`, `.github/workflows/ci.yml` or `tests/unit/ci-workflow.test.ts`: TASK-100 owns them and is in flight at the same time.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
