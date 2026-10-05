# Enforcing the Content-Security-Policy

Spec 004 §5.2, §14 A2, AC-23 · ADR-0016, ADR-0020 (proposed) · TASK-058 · `src/lib/csp.ts`,
`src/lib/csp-response.ts`, `src/lib/csp-cache-handler.ts`, `src/lib/csp-state.ts`,
`src/lib/csp-report.ts`

The policy is **built and dark**. Every response carries the static policy as
`Content-Security-Policy-Report-Only`. Enforcement is one Railway variable, `CSP_REPORT_ONLY=false`,
read by the server at start: no code change and no rebuild. This page says what that switch does,
how to read the evidence before you flip it, how to flip it and flip it back, and how to keep
watching it afterwards.

## 1. What is enforced, and where

| Response | Header with `CSP_REPORT_ONLY` absent or `true` | Header with `CSP_REPORT_ONLY=false` |
|---|---|---|
| A cached HTML document: every locale home, hub, corridor, shop, category, occasion and product page, the chooser `/` and the 404 page | static `Content-Security-Policy-Report-Only` | the same, **plus** `Content-Security-Policy`: the static policy plus the `'sha256-…'` of that document's **flight blocks** |
| A shop listing with a query parameter (`?page=`, `?sort=`, a facet), which is rendered per request | static Report-Only | static Report-Only only. **Not enforced** |
| `/api/*`, `/sitemaps/*`, an error (500) render | static Report-Only | static Report-Only only |
| Any page on the Vercel cold fallback | static Report-Only | static Report-Only only. Vercel serves prerenders without the cache handler |

Why the enforced policy is per document: Next 16 puts the page's data in inline
`<script>self.__next_f.push(…)</script>` "flight" blocks, and their bytes change with every route,
build and hourly regeneration. A static header cannot list their hashes, so enforcing the static
policy would block hydration on every page (spec 004 §14 A2). The cache handler sees each document
as it is stored, hashes its flight blocks, and stores the header next to the body. Cloudflare then
caches header and body together.

**Only Next's own flight blocks are hashed.** A script body is hashed only if it is exactly one of
the statements Next writes, with an argument that parses as JSON of the expected shape. The
consent bootstrap keeps its fixed build-time hash. **Any other inline script gets no hash**,
including one that got into the page's content before it was cached (a stored XSS). The browser
blocks it and reports it. ADR-0020 states the one residual risk: a script that is itself a
well-formed flight block. It can only push data, never run code.

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

- **The log is a floor, not a count.** Per running instance, the endpoint reads at most 600
  report requests a minute, and of those it logs at most 60 `disposition: enforce` lines and 60
  others (ADR-0016, ADR-0020 R-4). The two log allowances are separate, so the flight-block noise
  fills its own allowance and does not touch the `enforce` one. Before the flip everything is
  `report`, and the noise (two or more lines per page view) fills that allowance at about 30 page
  views a minute. Read the whole period, not a busy minute.
- **Above 600 requests a minute on one instance, reports are dropped unread, `enforce` ones
  included.** That is roughly 200 cached page views a minute while the noise lasts. It is a
  ceiling, not something that cannot happen. Each minute it is hit, the endpoint writes one line:

  ```json
  {"level":"warn","msg":"csp reports dropped","csp_report_dropped":"unread"}
  ```

  A minute with that line, or with `"csp_report_dropped":"enforce"` (more than 60 real blocks in
  a minute), may have lost `enforce` reports. Count those minutes next to the `enforce` count in
  §3 step 5. Report-only drops are expected and are not announced.
- **The filter also hides a real injected inline script.** Before the flip it cannot be told apart
  from a flight block, so inline scripts are not judged from these reports at all. Their evidence
  is `tests/e2e/csp-enforced.spec.ts`, which runs on every PR with `ci:full`. It starts a server
  with `CSP_REPORT_ONLY=false` over the PR's build and proves four things:
  - three page types hydrate with zero enforced violations;
  - every flight block in the received document is named in the header;
  - a script written into the stored page **before** hashing is refused;
  - a script added to the response **after** hashing is refused.

## 3. Flipping it (staging first, then production)

**Preconditions.** Do not flip any environment until all of these hold:

- §2's evidence is clean.
- `pnpm cloudflare:check` is clean. Rocket Loader, Email Obfuscation, Auto Minify or any
  JavaScript detection switched on at the edge would rewrite or add scripts **after** the server
  hashed them, and the page would stop working.
- **For production only (E-4):** the Report-Only header on cached documents either carries the
  same flight hashes or is gone. Otherwise its flight-block noise keeps arriving on every page view
  after the flip. The separate allowance keeps `enforce` reports flowing, but the noise is still
  load and log volume. This is a follow-up task. It gates the production flip, not staging.
- Every `next` upgrade since the last flip ran `ci:full`. The handler depends on Next internals
  (ADR-0020 R-3), and only that suite proves they still hold.

**Steps:**

1. **Staging.** In Railway → `staging` → `web` → Variables, set `CSP_REPORT_ONLY` to `false`.
   Railway restarts the service. No build argument is involved: the variable is read at run time.
2. **Check the server says it is enforcing:**

   ```bash
   curl -s -u "$STAGING_BASIC_AUTH" https://<staging-host>/api/health | jq -r .cspEnforce
   ```

   `ok` means the server is enforcing. `degraded` means the server could not build the policy and
   is serving pages **unenforced** (it fails open on purpose, so the site stays up). That is a
   defect to report, not a reason to keep going. Then check the header itself, through Cloudflare
   as a visitor gets it:

   ```bash
   curl -sI -u "$STAGING_BASIC_AUTH" https://<staging-host>/en | grep -i '^content-security-policy'
   ```

   You should see both lines: `content-security-policy-report-only:` with one `sha256-`, and
   `content-security-policy:` with several (the consent bootstrap plus the flight blocks).
3. **Purge Cloudflare's cache** (Caching → Configuration → Purge Everything). HTML that was cached
   at the edge before the flip keeps its old headers until it expires, which can be up to an hour.
4. **Click through, and fire one canary.** Open `/en`, `/de`, a shop listing, a product page and a
   product page in a second locale with DevTools open. The console shows no
   `Content-Security-Policy` error. The consent sheet appears and answers a click; it only exists
   once the page has hydrated. Then, on `/en`, run this in the console:

   ```js
   document.body.append(Object.assign(document.createElement("script"), { textContent: "1" }))
   ```

   The console shows one refused inline script. That refusal is the **canary**: it proves that
   blocked scripts are reported and logged.
5. **Count the enforced reports for 24 to 72 hours.** Silence is not evidence on its own, so write
   the number down:

   ```
   "csp violation" @disposition:enforce
   ```

   - The count must be **at least 1**, because the canary from step 4 is in it. **Zero means
     reports are not arriving** (a reporting header, the endpoint or the log query is broken), and
     the period proves nothing until that is fixed.
   - Each line beyond the canary is something a browser actually refused. `blocked_origin: inline`
     with `disposition: enforce` is either an attack or a script added without its hash: read it at
     once.
   - Count the minutes with a `csp reports dropped` line too:

     ```
     "csp reports dropped"
     ```

     Zero is the clean answer. Any other number means `enforce` reports may have been lost in those
     minutes (§2), so the `enforce` count is a floor for them.
   - The static policy's flight-block noise (`disposition: report`) keeps arriving after the flip.
     It is expected, the filter in §2 still removes it, and it has its own log allowance. Only above
     the 600-requests-a-minute ceiling can it crowd out an `enforce` report, and then the
     `csp reports dropped` line says so.
6. **Production.** Repeat steps 1 to 5 on `production`, at a quiet hour, never on a peak day
   (`peak-day.md`), and only once the production precondition above holds.

## 4. Keep watching it (scheduled check)

From the first flip on, `/api/health` is the signal that enforcement is still applied:

- **A scheduled check** reads `cspEnforce` every 5 minutes on each environment where
  `CSP_REPORT_ONLY=false`, and alerts when it is anything but `ok`. The uptime monitor of
  `plan/08` §7 is the place for it; until it exists, a Railway cron or a GitHub scheduled workflow
  can run `curl … /api/health | jq -e '.cspEnforce == "ok"'`. A missing `cspEnforce` counts as
  `degraded`.
- **A log alert** fires on `"csp enforcement degraded"` (a `warn` line that `/api/health` writes
  each time it answers `degraded`).

`degraded` stays set until the service restarts, even if the cause has gone away. Find the cause
(usually an unreadable `.next/routes-manifest.json` after an image or Next change), fix it, and
restart.

## 5. Flipping it back

Set `CSP_REPORT_ONLY` to `true` (or delete it) on the service, let Railway restart, and **purge
Cloudflare's cache**. Without the purge, edge copies of HTML keep enforcing for up to an hour. Then
read the `disposition: enforce` lines from before the rollback to find what was blocked.

## 6. What this does not cover yet

- **Per-request listing variants** (`?page=`, `?sort=`, facets) stay Report-Only. They are rendered
  per request but cached at the edge, so a nonce is not allowed there (ADR-0016), and no cache
  entry exists for the handler to hash (ADR-0020 R-2, accepted for Phase 0). Revisit when those
  pages show user input such as search terms.
- **`no-store` routes** (checkout, account, admin, vendor) get a per-request nonce with
  `'strict-dynamic'` from `src/proxy.ts`. The spec that ships the first one adds it (ADR-0016).
- **The Vercel cold fallback** cannot enforce. If the site ever fails over to Vercel, it runs with
  the Report-Only policy only.
