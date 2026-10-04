# TASK-058 — CSP enforcement: make the policy enforceable with Next 16's React flight inline blocks — nonce propagation on `no-store` routes and/or hash-per-response on cached routes, the enforce-flip runbook (`CSP_REPORT_ONLY=false`), Report-Only evidence read with flight-block reports filtered, per-instance rate-limiter caveat

Row: `TASKS.md` → TASK-058. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-058-csp-enforce`. Created by the orchestrator from `/review 28` nit 1: the served document carries eleven inline scripts (bootstrap + ten `self.__next_f.push` blocks), so flipping enforcement today blocks hydration. Decide nonce vs hash-per-response in the PR body against ADR-0016's cached-HTML constraint; do not edit ADR-0016 (supersede if the shape changes). Also carries `/review 26` nits: `AcceptLanguageSchema` test-only note, logger reporting 200 for 204/4xx responses.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

Raised by the implementer on PR #196, 2026-10-05. None blocks review; each needs a decision from
the founder or the orchestrator.

- **E-1. ADR-0016's mechanism changes, so a superseding ADR is proposed, not written.** ADR-0016
  says the policy "is emitted from `next.config.ts`'s `headers()`" and is enforced "by setting
  `CSP_REPORT_ONLY=false`", which renamed that static header. Its option 3 rejected per-response
  hashes as "nonce generation with extra steps and the same cache problem". The measured result
  says otherwise: a hash describes bytes, so it can be cached with them, and Next's cache entry is
  where the body and the header meet. What shipped: the static policy is **always** Report-Only,
  and the enforcing policy is per cached document, written by a `cacheHandler`
  (`src/lib/csp-cache-handler.ts`). The **policy shape** is unchanged: an allowlist plus hashes on
  cached routes, no nonce in cached HTML, and nonces reserved for `no-store` routes. Proposed
  record: **ADR-0019 "CSP enforced per cached document: inline-script hashes on the cache entry"**,
  superseding ADR-0016's mechanism paragraph and its option-3 rejection and keeping everything
  else.
- **E-2. Per-request listing variants stay Report-Only.** The `_query` route (`?page=`, `?sort=`,
  facets) is rendered per request but edge-cached for an hour (spec 008 §13 Q2). That rules out a
  nonce (ADR-0016), and there is no cache entry to hash. The options: (a) accept it, since these
  URLs are `noindex`; (b) serve them `no-store` and give them a nonce, which gives up their edge
  caching; (c) hash them in a response-body hook (a custom server or a Cloudflare Worker), which
  is a hosting change. The implementer recommends (a) for Phase 0, recorded in the runbook §5.
- **E-3. Coupling to Next internals.** The handler deep-imports
  `next/dist/server/lib/incremental-cache/file-system-cache.js`. It relies on two more Next
  details: the `APP_PAGE` entry value being the object the response is sent from, and the
  `routes-manifest.json` header format. A Next upgrade can break any of these. It fails open: the
  site works, unenforced. `tests/unit/csp-response.test.ts` (the handler over the real
  `FileSystemCache`) and `tests/e2e/csp-enforced.spec.ts` turn red when that happens, so a Renovate
  PR for `next` must run `ci:full`.
- **E-4. After the flip, the static Report-Only policy keeps reporting the flight blocks.** That is
  two to ten reports per cached page view. The reports are told apart by `disposition` (now
  logged), but they spend the 60-a-minute per-instance allowance. A follow-up could move the
  Report-Only header for cached documents onto the cache entry too, so that it also carries the
  hashes.

## Progress

- 2026-10-05 · Mechanism proven on a real build: a `cacheHandler` extending Next's `FileSystemCache` stamps `Content-Security-Policy` (static policy + per-document inline hashes) on `/en`, a shop, a product page and the 404; the `_query` listing variant stays Report-Only (E-2).
- 2026-10-05 · `tests/e2e/csp-enforced.spec.ts` green (4 per project); both mutations red; disposition logged by `/api/csp-report`; carried nits fixed.
- 2026-10-05 · Modules moved from `.mjs` to erasable `.ts` (Node 24 strips types) so the `src/` lint locks hold; standalone output verified enforcing; runbook written; `gates:cheap` PASS.

## Result

PR [#196](https://github.com/itsahmeds/flowers-overseas/pull/196) · status `in_review`.

**Decision: hash per response on cached routes; no nonce anywhere.** A hash describes the bytes
of one document, and every visitor who receives that cached document receives the same bytes. So
the hash list is correct for all of them and can be cached beside the body, in Next's ISR cache and
at Cloudflare, without becoming a secret. A nonce in the same response would be a public constant,
which is ADR-0016's rule. No `no-store` HTML route exists yet, so the nonce variant stays with the
spec that ships the first one. The only place the body and its headers meet before either is sent
is Next's cache entry. That is why the enforcing header is written by a `cacheHandler`
(`src/lib/csp-cache-handler.ts`, extending Next's `FileSystemCache`). It stamps every `APP_PAGE`
entry with the static policy, read back from `routes-manifest.json`, plus the `'sha256-…'` of that
document's inline scripts (`src/lib/csp-response.ts`). It stamps on `set`, which covers the
prerender, ISR regeneration and the first render, and on `get`, which follows the current flag.
The static `next.config.ts` header is now always Report-Only. `CSP_REPORT_ONLY=false` is a
run-time key, so the flip needs no rebuild. This also closes a latent gap: the old flip renamed a
build-baked header, and Railway never passes `CSP_REPORT_ONLY` to the build. The mechanism change
against ADR-0016 is escalation E-1.

**AC covered:** spec 004 AC-23, enforcement half (§14 A2). The two carried `/review 26` nits are
fixed: the proxy no longer logs a pass-through `status` it cannot know, and `AcceptLanguageSchema`
is documented as a test-only oracle.

**Tests added or changed:**
- e2e `tests/e2e/csp-enforced.spec.ts`: 4 cases per project (`e2e-desktop`, `e2e-mobile`). It
  starts its own `next start` with `CSP_REPORT_ONLY=false` over the same build and stops it by PID.
  Three page types (`/en`, `/de/polen/blumen`, a product page) hydrate. Hydration is shown by the
  consent sheet appearing and answering a click. Each page has zero `enforce` violations, every
  inline script's digest, recomputed in the browser, is in the header, and `script-src` has no
  `'unsafe-inline'` or `'unsafe-eval'`. An injected inline `<script>` does not run and raises a
  `script-src-elem` / `inline` / `enforce` violation.
- unit `tests/unit/csp-response.test.ts`: 21 cases. Hashing rules (src, JSON-LD, module, empty
  body, UTF-8, whitespace, de-duplication), policy composition, manifest read-back,
  `cspEnforced` against `cspReportOnly`, stamping, and the handler over Next's real
  `FileSystemCache` on a temp dir: `get`, `set` mutating the sent object and the `.meta`, a
  report-only server ignoring an enforcing entry, and fail-open with no manifest.
- unit `tests/unit/csp-report-route.test.ts`: +2 (disposition for both report shapes, and the
  closed set). `tests/unit/csp.test.ts`: the static header is Report-Only for every environment.
  `tests/unit/proxy.test.ts`: the request-end line has no `status`.

**Mutations (run locally, each red):**
- Drop the hash of one flight block (`inlineScriptHashes` skips the first `self.__next_f.push`
  block). The hydration case goes red twice. Once at the digest assertion. With that assertion
  removed, it still goes red at `expect(page.locator(SHOWN)).toBeVisible()`, because the page
  never hydrates.
- Replace the hashes with `'unsafe-inline'` (`'self'` kept). The injection case goes red at
  `expect(window.__foInjected).toBeUndefined()` (received 1). The hydration case goes red at
  `not.toContain("'unsafe-inline'")`. Under CSP3, `'unsafe-inline'` placed *beside* hashes is
  ignored by browsers, so the mutation that matters is replacing the hashes, not adding to them.

**Expensive gate run locally, and why:** `pnpm build` plus Playwright, inside the build slot. The
claim is about a real built page hydrating under the enforced header, which only a build can show.
The standalone output (`node .next/standalone/server.js`, the container's command) was also
started with `CSP_REPORT_ONLY=false`. It sent the enforcing header on `/en`, a shop and a product
page, and the static Report-Only header only on `/api/health`. Both `.ts` modules were traced into
`.next/standalone/src/lib/`. All servers were stopped by their own PIDs, and the slot was released.

**Docs:** `docs/runbooks/csp-enforce.md` (new, indexed): what is enforced and where, reading the
evidence with flight-block noise filtered, the per-instance rate-limit caveat, the staging-first
flip, and the rollback with a Cloudflare purge. `.env.example` and `src/lib/env.schema.ts` now say
the key is read at run time. RoPA is unchanged: the new `disposition` field is not personal data.

**Dependencies:** none added.

**Note for whoever runs `gates:cheap` after a local build:** `.next/` holds the generated
`.next/types` and a standalone copy of `src/lib/csp-*.ts`. Both enlarge the TypeScript program, and
`catalog-pricing-minor.test.ts`'s first type-aware lint case then timed out at 5 s (5.1 s against
1.8 s on main). With `.next/` removed it takes 0.95 s. That is a property of the local tree, not of
the diff.

`pnpm gates:cheap` on `0095118` (the brief commit before this block was pasted; the paste changes only this file):

```
gates:cheap · 009511823c2b288d29008812c77df12cd8af2d6e · tree clean · base origin/main · 2026-10-04T22:35:13.451Z
typecheck             exit 0 · 2.4 s
lint                  exit 0 · 17.1 s
format:check          exit 0 · 11.2 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 97.7 s · changed 168 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

