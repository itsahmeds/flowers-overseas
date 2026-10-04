# Enforcing the Content-Security-Policy

Spec 004 §5.2, §14 A2, AC-23 · ADR-0016 · TASK-058 · `src/lib/csp.ts`,
`src/lib/csp-response.ts`, `src/lib/csp-cache-handler.ts`, `src/lib/csp-report.ts`

The policy is **built and dark**. Every response carries the static policy as
`Content-Security-Policy-Report-Only`. Enforcement is one Railway variable, `CSP_REPORT_ONLY=false`,
read by the server at start: no code change and no rebuild. This page says what that switch does,
how to read the evidence before you flip it, and how to flip it and flip it back.

## 1. What is enforced, and where

| Response | Header with `CSP_REPORT_ONLY` absent or `true` | Header with `CSP_REPORT_ONLY=false` |
|---|---|---|
| A cached HTML document: every locale home, hub, corridor, shop, category, occasion and product page, the chooser `/` and the 404 page | static `Content-Security-Policy-Report-Only` | the same, **plus** `Content-Security-Policy`: the static policy plus the `'sha256-…'` of that document's own inline scripts |
| A shop listing with a query parameter (`?page=`, `?sort=`, a facet), which is rendered per request | static Report-Only | static Report-Only only. **Not enforced** |
| `/api/*`, `/sitemaps/*`, an error (500) render | static Report-Only | static Report-Only only |
| Any page on the Vercel cold fallback | static Report-Only | static Report-Only only. Vercel serves prerenders without the cache handler |

Why the enforced policy is per document: Next 16 puts the page's data in inline
`<script>self.__next_f.push(…)</script>` "flight" blocks, and their bytes change with every route,
build and hourly regeneration. A static header cannot list their hashes, so enforcing the static
policy would block hydration on every page (spec 004 §14 A2). The cache handler sees each document
as it is stored, hashes its inline scripts, and stores the header next to the body. Cloudflare then
caches header and body together.

A **hash** is safe to cache because it describes bytes that every visitor receives anyway. A
**nonce** is not, because it is only worth anything while nobody else can read it. That is
ADR-0016's rule, and it is why nothing here uses a nonce.

## 2. Reading the evidence (before the flip)

`/api/csp-report` writes one `warn` line per violation with exactly three fields:

```json
{"level":"warn","msg":"csp violation","directive":"img-src","blocked_origin":"https://cdn.example","disposition":"report"}
```

**Filter out the flight-block noise first.** The static Report-Only policy does not name the flight
blocks, so every cached page view reports each of them. Those lines always look like this:

- `directive` is `script-src-elem` (older browsers send `script-src`),
- `blocked_origin` is `inline`,
- `disposition` is `report`.

In the Railway log explorer for the `web` service:

```
"csp violation" -@blocked_origin:inline
```

If the explorer does not accept the negation, export the lines and filter them with `jq`:

```bash
jq -c 'select(.msg == "csp violation")
       | select((.blocked_origin == "inline" and .disposition == "report"
                 and (.directive == "script-src-elem" or .directive == "script-src")) | not)' logs.jsonl
```

What is left is the evidence. It is clean when, over **at least seven days of real traffic**:

1. no line remains after the filter. An `img-src`, `connect-src`, `font-src` or `frame-src` line
   names an origin the policy is missing: fix the policy in `src/lib/csp.ts` in a reviewed PR
   before you flip, because after the flip that origin is blocked on cached pages;
2. the `csp_report_invalid` and `csp_report_oversized` counters are zero, or explained.

**Two limits on this evidence:**

- **The log is a floor, not a count.** The endpoint drops reports past 60 a minute per running
  instance (ADR-0016). Railway runs one replica (ADR-0018), but the flight-block noise uses up that
  allowance: two to ten reports per page view means about 6 to 30 page views a minute exhaust it.
  So a quiet minute only proves something about the first reports of that minute. Read the whole
  period, not a busy minute.
- **The filter also hides a real injected inline script.** Before the flip it cannot be told apart
  from a flight block, and that is why inline scripts are not judged from these reports at all.
  Their evidence is `tests/e2e/csp-enforced.spec.ts`, which runs on every PR with `ci:full`. It
  starts a server with `CSP_REPORT_ONLY=false` over the PR's build and proves three things. Three
  page types hydrate with zero enforced violations. Every inline script in the received document
  is named in the header. An injected inline script is refused.

## 3. Flipping it (staging first, then production)

1. **Staging.** In Railway → `staging` → `web` → Variables, set `CSP_REPORT_ONLY` to `false`.
   Railway restarts the service. No build argument is involved: the variable is read at run time.
2. **Check the header**, through Cloudflare as a visitor gets it (staging needs its Basic Auth):

   ```bash
   curl -sI -u "$STAGING_BASIC_AUTH" https://<staging-host>/en | grep -i '^content-security-policy'
   ```

   You should see both lines: `content-security-policy-report-only:` with one `sha256-`, and
   `content-security-policy:` with several (the bootstrap plus the flight blocks). If the
   enforcing line is missing, the server could not read `routes-manifest.json`. It fails open, so
   nothing is blocked; that is a defect to report, not a reason to keep going.
3. **Purge Cloudflare's cache** (Caching → Configuration → Purge Everything). HTML that was cached
   at the edge before the flip keeps its old headers until it expires, which can be up to an hour.
4. **Click through** `/en`, `/de`, a shop listing, a product page, and a product page in a second
   locale with DevTools open. The console shows no `Content-Security-Policy` error. The consent
   sheet appears and answers a click; it only exists once the page has hydrated.
5. **Watch the enforced reports for 24 to 72 hours:**

   ```
   "csp violation" @disposition:enforce
   ```

   Each line is something a browser actually refused. `blocked_origin: inline` with
   `disposition: enforce` is either an attack or a script added without its hash: read it at once.
   The static policy's flight-block noise (`disposition: report`) keeps arriving after the flip.
   It is expected, and the filter in §2 still removes it.
6. **Production.** Repeat steps 1 to 5 on `production`, at a quiet hour, never on a peak day
   (`peak-day.md`).

## 4. Flipping it back

Set `CSP_REPORT_ONLY` to `true` (or delete it) on the service, let Railway restart, and **purge
Cloudflare's cache**. Without the purge, edge copies of HTML keep enforcing for up to an hour. Then
read the `disposition: enforce` lines from before the rollback to find what was blocked.

## 5. What this does not cover yet

- **Per-request listing variants** (`?page=`, `?sort=`, facets) stay Report-Only. They are rendered
  per request but cached at the edge, so a nonce is not allowed there (ADR-0016) and no cache entry
  exists for the handler to hash. Recorded as an escalation on TASK-058.
- **`no-store` routes** (checkout, account, admin, vendor) get a per-request nonce with
  `'strict-dynamic'` from `src/proxy.ts`. The spec that ships the first one adds it (ADR-0016).
- **The Vercel cold fallback** cannot enforce. If the site ever fails over to Vercel, it runs with
  the Report-Only policy only.
