# ADR-0020 — CSP enforced per cached document: flight-block hashes carried on the cache entry

| Field | Value |
|---|---|
| Status | proposed (founder approval pending) |
| Date | 2026-10-05 |
| Deciders | Ahmed |
| Supersedes | ADR-0016, **in part**: its "Decision" sentence on *how* the policy is emitted and enforced, and its rejection of option 3. Everything else in ADR-0016 stands. |
| Related | ADR-0016, ADR-0018 (Railway behind Cloudflare), specs/004-design-system-layout.md §5.2 §14 A2 (AC-23), TASK-058 / PR #196, `docs/runbooks/csp-enforce.md` |

## Context
ADR-0016 chose a static per-environment allowlist plus one build-time hash for the Consent-Mode
bootstrap on cached routes, with per-request nonces kept for `no-store` routes. It said the policy
"is emitted from `next.config.ts`'s `headers()`" and is enforced "by setting
`CSP_REPORT_ONLY=false`", which renamed that one static header. It rejected a hash-based policy
(option 3) because "the hashes must be computed per response, which is nonce generation with
extra steps and the same cache problem".

Two measurements overturn the mechanism, though not the shape:

1. **The static policy cannot be enforced.** Next 16 writes the React flight payload into every
   document as inline `self.__next_f.push(…)` scripts (spec 004 §14 A2, `/review 28`). Their bytes
   change with each route, build and hourly ISR regeneration. Enforcing the static header blocks
   hydration on every page.
2. **A per-response hash does not have the nonce's cache problem.** A nonce is only worth anything
   while it is unpredictable, and a cached response shows the same one to everyone. A hash
   describes bytes. Every visitor who receives one cached document receives the same bytes, so one
   hash list is correct for all of them and can be cached beside the body, at Next's cache and at
   Cloudflare, without becoming a secret.

The remaining question is where the hashes can be computed. `headers()` and `src/proxy.ts` never
see a response body. Next's incremental cache entry is the one place the HTML and its headers are
held together before either is sent: on `set` (prerender, ISR regeneration, first render), where
the same object is then sent to the client, and on `get` (every hit).

## Options considered
1. **Keep ADR-0016 as written: static header, renamed to enforce.** No new mechanism · blocks
   hydration site-wide the moment it is enforced · rejected, measured.
2. **Nonce everywhere.** The strongest policy · every indexable page goes dynamic (ADR-0016
   option 1) · rejected again, for the reason ADR-0016 gives.
3. **Hash every inline script in each cached document** (the first round of TASK-058) · works for
   hydration · **authorises any script that is in the HTML when it is cached**, so a stored
   injection is hashed and runs. For stored XSS that is `'unsafe-inline'` by another name
   (`/review 196` item 1, `/break 196` hole 1, reproduced) · rejected.
4. **Hash only the statements Next emits, on the cache entry** `[agent-inferred]`. A `cacheHandler`
   extends Next's own `FileSystemCache` and stamps each `APP_PAGE` entry with
   `Content-Security-Policy` = the static policy, read back from `routes-manifest.json`, plus the
   `'sha256-…'` of every inline script whose body is **exactly** one of Next's flight statements.
   The bootstrap is `(self.__next_f=self.__next_f||[]).push([0])`, with an optional
   `[2,<form state>]`. The data pushes are `self.__next_f.push([1,"…"])` and `[3,"<base64>"]`. The
   argument must pass `JSON.parse` and have the exact array shape. The Consent-Mode bootstrap keeps
   its static build-time hash; no other inline script gets one, so the browser blocks it and
   reports `script-src-elem` / `inline` / `enforce` · relies on Next internals (option 4's cost,
   below) · keeps every page cached.
5. **Hash in a response-body hook outside Next** (a custom server or a Cloudflare Worker) · works
   for per-request pages too · a hosting change, and either the end of standalone `server.js` or a
   new edge runtime to operate · deferred. It is the answer if E-2 below ever needs closing.

## Decision
Option 4. The policy **shape** is ADR-0016's: an allowlist on cached routes, hashes for inline
scripts, no nonce in cached HTML, and nonces with `'strict-dynamic'` reserved for `no-store`
routes. Only the **mechanism** changes:

- The static `next.config.ts` header is **always** `Content-Security-Policy-Report-Only`. It is the
  evidence policy and the only policy on responses that are not cached documents.
- The enforcing `Content-Security-Policy` is written **per cached document** by
  `src/lib/csp-cache-handler.ts`, from `src/lib/csp-response.ts`, and hashes only Next's flight
  statements.
- `CSP_REPORT_ONLY=false` is read **at run time** by the server, so the flip is a restart, not a
  rebuild. That is what ADR-0016's "configuration act, not a deploy" needed on Railway, which never
  passed the key to the build.
- The handler **fails open** (page served, unenforced) rather than take the site down, and says so:
  `/api/health` reports `cspEnforce: report-only | ok | degraded` and logs a `warn` line when it is
  `degraded`.
- `/api/csp-report` logs each report's `disposition` and keeps **separate log budgets** for
  `enforce` and `report`, so the static policy's flight-block noise cannot starve a real block.

## Consequences and the trade-off accepted
Easier: every indexable page stays SSG/ISR at the edge with an enforceable policy; the flip is one
run-time variable; a stored injection is blocked rather than hashed; the e2e suite proves both
hydration and blocking on the real build on every `ci:full` run.

Harder, and the residual risks stated so no reviewer has to infer them:

- **R-1. An injected script that is itself a well-formed flight push is hashed.** It can only
  append JSON data to React's payload; it runs no code of its own. The worst case is a forged RSC
  row that changes what React renders (content spoofing). Markup it injects cannot run script:
  event-handler attributes and `javascript:` URLs need `'unsafe-hashes'` or `'unsafe-inline'`,
  which the policy never contains, and React does not execute `<script>` elements it creates.
- **R-2 (E-2). Per-request listing variants** (`?page=`, `?sort=`, facets via `_query`) stay
  Report-Only. They are edge-cached, so no nonce is allowed, and there is no cache entry to hash.
  The reviewer accepted this for Phase 0, since they are `noindex` and `X-Frame-Options: DENY`
  still applies. Revisit when those pages render user input such as search terms (option 5).
- **R-3 (E-3). Coupling to Next internals:** a deep import of `FileSystemCache`, the identity of
  the entry object between `set` and the response, the `routes-manifest.json` header format, and
  the flight statement shapes. A Next upgrade can break any of them. The failure mode is fail-open
  plus `cspEnforce: degraded`, and `tests/unit/csp-response.test.ts` (the handler over the real
  `FileSystemCache`) and `tests/e2e/csp-enforced.spec.ts` turn red. **Any `next` bump runs
  `ci:full`.** A new flight shape that is not hashed blocks hydration under enforcement, and that
  e2e catches it before merge.
- **R-4 (E-4). After the flip the static Report-Only header still reports the flight blocks** on
  every cached page view. The separate budgets keep `enforce` reports flowing. Stamping the
  Report-Only header with the same hashes, or dropping it from cached documents, is a precondition
  of the **production** flip (`docs/runbooks/csp-enforce.md`). It does not gate this ADR.
- **R-5. Vercel cannot enforce.** The cold fallback serves prerenders without the handler, so it
  runs Report-Only only.

Downstream: ADR-0016 is not edited. Its Status flips to `superseded-by ADR-0020 (in part)` only
when the founder accepts this record. `src/lib/csp.ts` and `docs/runbooks/csp-enforce.md` point
here.

## Rules
- Accepted ADRs are never edited. The only legal touch is flipping Status to `superseded-by`.
- `deferred` requires: guardrails while deferred, revisit trigger, cost of deferral.
- `not-applicable` requires a reason.
