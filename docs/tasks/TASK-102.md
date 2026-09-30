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

- **From `/review 127` round 1 (2026-09-30):** (1) the `sitemap` tag stays unresolved (`[]` + `warn`); AC-22 passes with it open because nothing calls `invalidate` in Phase 0. It becomes a gate on the first task that calls `invalidate` with `sitemap` (the hourly sitemap job, spec 012 admin). (2) `src/lib/railway.ts` `OPTIONAL_VARIABLE_KEYS` must list `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` before either is set on Railway, or `railway:check` fails AC-11; owner: TASK-104 (orchestrator records it there). (3) `catalog:*`, `product:*`, `country:*` resolve to `[]` until the first task that caches those pages extends the resolver. (4) `audit` must be green after the rebase on PR 128.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-09-30 — **What does `sitemap` purge?** Spec 040 §5.4 maps a tag to "the set of absolute URLs carrying it" but never says which responses carry `sitemap`. By the code and specs it is declared by the corridor pages (`corridorCacheTags`, spec 007 §5.4), the hubs (`hubCacheTags`), spec 008's listing pages (spec 008 §5.4, `catalog:*` + `sitemap`), and, per the sitemap route headers, the sitemap XML documents (`plan/01` §8's hourly `sitemap.regenerate` purges it). Resolving it to all of these makes the hourly job purge every corridor, hub and listing page every hour. Resolving it to the sitemap documents alone contradicts the page tag builders. The choice was not made here: `urlsForTag("sitemap")` returns `[]` (`UNRESOLVED_TAGS` in `src/lib/cache.ts`) and the adapter names it in `unresolved_tags` at `warn`. Once answered, it is a one-line change plus a test. Nothing calls `invalidate` in Phase 0, so no behaviour ships wrong in the meantime. To: orchestrator / founder. **Open.**

## Progress

- 2026-09-30 — T-22/T-23 written and seen red, adapter + resolver + wiring implemented, 8 mutations each red, commit `6457fc8b` pushed.
- 2026-09-30 — Review 127 round 1 fixes are in `tests/integration/cache-cloudflare-purge.test.ts` (17 cases, up from 11). Every mutation below turned its case red, and the code was restored after each:
  - **Required test.** `selectCacheAdapter({ token, zone id, NEXT_PUBLIC_SITE_URL: https://staging.flowers-overseas.example })` then `invalidate([homeCacheTag("en")])` purges exactly `urlsForTag(tag, { baseUrl })`. **M15** (`resolve: () => []`) and **M16** (site URL hard-coded) were each red in 1 case.
  - **Breaker (1):** whitespace-only token or zone id gives the no-op with zero requests. M17 (no trim) was red in 3 cases.
  - **Breaker (2):** the error line carries no zone id. M20 (zone id in the fields) was red in 2 cases.
  - **Breaker (2), the 4xx behaviour:** a 4xx is retried like any failure, since §5.4 says failures are retried twice. That makes 3 attempts and then one `error` line. M21 (4xx not retried) was red.
  - **Breaker (3):** a resolver that throws still resolves, makes no request, and writes one `error` line with tag names only. M18 (rethrow) was red.
  - **Breaker (4):** a failed chunk next to unresolved `corridor:PL:en` and `sitemap` is logged at `error`. M19 (warn checked first) was red.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#127](https://github.com/itsahmeds/flowers-overseas/pull/127). New `src/lib/cache-cloudflare.ts` holds the adapter. It resolves tags through an injected resolver, de-duplicates tags and URLs, and sends chunks of `PURGE_CHUNK_SIZE` = 30 with `PURGE_CONCURRENCY` = 3. It retries `PURGE_RETRIES` = 2 times with 250/500 ms backoff and a 10 s per-request timeout, writes one log line per call (`tags`, `url_count`, `api_calls`, plus `failed_calls` or `unresolved_tags`; never a URL, never the token) and never rejects. The same file holds `parseCloudflarePurgeConfig()`, which `src/lib/env.ts` re-exports. `src/lib/cache.ts` gains `urlsForTag(tag, { baseUrl })`, built from the tag builders over `routableLocaleCodes()`, `listCorridorPages()`, `hubView()`, `localePath()` and `absoluteUrl()`. It also gains `selectCacheAdapter(env)`: `cache` is the Cloudflare adapter when both keys are well-formed, the no-op when either is absent or blank, and a warn-only adapter when either is malformed.

The keys are not zod schema keys. They follow `STAGING_BASIC_AUTH`, because `ENV_KEYS` is AC-11's 28-key contract. They are documented, commented, in `.env.example`.

Tests: unit T-22 `tests/unit/cache-cloudflare.test.ts`, 40 cases. Integration T-23 `tests/integration/cache-cloudflare-purge.test.ts`, 17 cases, against the new MSW handler `tests/msw/handlers/cloudflare.ts`. Eight mutations were each seen red: a locale dropped, a corridor URL dropped, chunk size 31, one retry, a URL in the log, unbounded concurrency, no de-duplication, and `&&` in the absent check. No expensive gate was run locally.

Handed on: the `sitemap` escalation above, and `src/lib/railway.ts` `OPTIONAL_VARIABLE_KEYS`, which needs the Cloudflare pair before the pair is set on Railway.

```
gates:cheap · 8aceb6c89e74d927457887ac6ab8b3be3b719d6d · tree clean · base origin/main
typecheck             exit 0 · 2.0 s
lint                  exit 0 · 13.5 s
format:check          exit 0 · 8.4 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 16.6 s · changed 3 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
