# TASK-403 — Search privacy and abuse: the request logger writes the pathname only for search routes, Sentry scrubs `q`, the GA4 `search` event with no `search_term`, `Referrer-Policy: strict-origin`, the per-process HMAC rate limiter (60 results, 120 suggest a minute, 429 with `Retry-After`), the 32-search cap (503), the no-geo source scans and byte identity, the RoPA "Search abuse protection" row

Row: `TASKS.md` → TASK-403. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-403`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-400 to TASK-403 are one feature PR built by one backend agent on branch `task/TASK-400-site-search`; the description names all four IDs and each row gets the PR link. Class (DoD §4): keeps the breaker (privacy, logging, data flows, the ranking key).
- AC-14 (T-14): byte-identical bodies across the cf-ipcountry, address, Accept-Language and cookie permutations (`fo_dest` included); the only read of `CF-Connecting-IP` is the limiter's.
- AC-23 (T-23): the three PII fixture queries never reach a log line, the request log, Sentry or the GA4 adapter; the request log has the pathname and no `?`.
- AC-26 (T-26): 60 results and 120 suggest requests a minute per HMAC-keyed address (key random per process, never written), 429 with `Retry-After`; 32 in flight, then 503 with `Retry-After: 5`.
- Explicit scope with no AC id: the RoPA row "Search abuse protection" as §8 words it (AC-33 checks it in TASK-408), the `search.rate_limited` log, `Cache-Control: private, no-store` and `Referrer-Policy: strict-origin` on every search response. The Cloudflare rate-limit rule is a runbook step (TASK-408), not code.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.8, §8, §11
- `src/lib/logger.ts`, the Sentry `beforeSend` scrub, the GA4 adapter, `docs/compliance/ropa.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (SR403, self-review, not a `/review`): left for a built site, none run on the founder's no-CI night:
  (1) T-14's e2e half: served-body hashes for `/en/search?q=roses&to=pl`, `/pl/szukaj?q=roze` and `/de/suche` across the cf-ipcountry, address, Accept-Language and cookie permutations (the unit test proves the proxy's answer is the same across them, and the source scans);
  (2) T-23's built-site half (a real `next start` request log and a real Sentry transport);
  (3) T-26 on `next start`: that Next 16 serves the proxy's rewrite with its 429 or 503 status (the unit test proves the proxy returns it; `resolve-routes.js` sets `res.statusCode` from the proxy's response before the render) and that the proxy and the page share the one limiter through `globalThis` in one process;
  (4) axe and visual baselines for the "rate limited" state (the board's "Rate limited · HTTP 429" frame).
- 2026-11-04 (SR403): the GA4 `search` payload is rendered as `data-fo-analytics` and `sendPageAnalytics` is the adapter, but nothing calls it until spec 023's deferred chunk lands (TASK for spec 023's client events): that chunk must call `sendPageAnalytics` with the attribute's value. The bootstrap's `page_location` already drops a search address's query string today.
- 2026-11-04 (SR403): with no `CF-Connecting-IP` (a request that reached Railway without Cloudflare) there is no per-client limit, only the 32-search cap; TASK-408's runbook should say the origin answers only Cloudflare, and record Railway's HTTP log retention (it may log query strings, §8 "Processors").
- 2026-11-04 (SR403): `search.rateLimited` is now rendered; its `retained: true` in `messages/en.meta.json` can go in the next copy batch (left untouched here to keep the copy records out of this diff).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 (SR403): limiter `src/modules/search/gate.ts` (HMAC per process, fixed 60 s windows, 32-search cap, `globalThis` singleton), proxy wiring (429/503 with `Retry-After`, rewrite to `/{locale}/-search/limited`), route `searchRoutePage()` and the "rate limited" view, Sentry `q` scrub in `beforeSend` and `beforeBreadcrumb`, bootstrap `page_location` without the query on search addresses, GA4 `search` event payload; tests `search-gate` (16) and `search-privacy` (28) green; RoPA row 18.
- 2026-11-04 (SR403): the refused request now goes to its own route `src/app/[locale]/-search/limited/page.tsx` (slots re-export the search page's), because TASK-402's scan forbids `headers()` in the search route; locale helper shared in `-search/search-locale.ts`. 14 mutations, each red. Next: PR self-review, then TASK-404.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 497](https://github.com/itsahmeds/flowers-overseas/pull/497): the proxy counts every search address (and `/api/search/*`) against `searchGate()`, an HMAC-SHA-256 of `CF-Connecting-IP` under a per-process random key in 60 s windows (60 results, 120 suggest), and the process's searches in flight (32); over a limit it answers 429 (seconds left in the window) or 503 (`Retry-After: 5`) by rewriting to its own route `/{locale}/-search/limited` (the results route reads no header, TASK-402's scan), which renders the "rate limited" state (H1, `search.rateLimited` as a status, the form with the words and the destination) without searching; one `search.rate_limited` line (route, kind). The page counts its search in flight (`enter`/`leave`, released on a throw) and renders the same state if the cap is reached after the proxy's check. Sentry replaces any `q` value with `:q` in the request URL, transaction, breadcrumbs, extra, tags and contexts, in `beforeSend` and the new `beforeBreadcrumb`; the consent bootstrap sends a search address's `page_location` without its query string; the results page renders the GA4 `search` event (`locale`, `destination_country`, `results_bucket`, `query_tokens`; no `search_term`, strict schema) as `data-fo-analytics`, and `sendPageAnalytics` sends it only with analytics granted. RoPA row 18 "Search abuse protection". Unit tests: 16 in `search-gate`, 28 in `search-privacy`; the existing proxy, chooser-proxy, Sentry, url-tokens, consent-bootstrap and search-routes suites unchanged and green. No build, Playwright, Lighthouse or screenshot ran (founder's no-CI night); the e2e halves are carry-forwards above.
