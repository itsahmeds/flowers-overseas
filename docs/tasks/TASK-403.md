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

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
