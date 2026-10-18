# TASK-247 — Case-variant URLs never poison the page cache: `/EN`, `/en/Occasions`, `/en/poland/product/AMBER-HOUR` answer a real 404 (status 404, not 200) and never turn the lowercase page into a 404 for later visitors

Row: `TASKS.md` → TASK-247. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-247`; keep it current by editing this file, not the row.

## Binding

- **Spec 003 §2 "Canonical" (L217):** "exactly one URL form per (locale, path) is reachable — unknown case and unknown locale 404 rather than serving a duplicate". Spec 007 §2 "Canonical": lowercase; route params are parsed, never redirected (`notFound()`, ADR-0006).
- **The defect (QA-2 N-01, 2026-10-18, `.claude/state/qa-2026-10-18/QA-2.md`):** on a `next start` production build of main c8d3b334, requests to case variants (`/EN`, `/DE`, `/en/Occasions`, `/en/Poland/flowers`, `/en/send-flowers-to/POLAND`, `/en/poland/product/AMBER-HOUR`) first answer **HTTP 200 with a "Page not found" body**, and minutes later the **lowercase** page itself answers 404 until the server restarts. Nine real pages broke. The likely seat is the response/route cache key (Next 16 scoped response-cache keys, `src/lib/csp-cache-handler.ts`, ISR) being case-folded while the render is not, or the not-found render stored under the canonical key. Reproduce first; record the cause in `## Result`.
- **Done when:** every case variant of every page type answers status 404 with the localised not-found document and `noindex`, on the first and every later request; the lowercase page keeps answering 200 with its own content after any number of case-variant requests, including across its revalidate window; a regression test (integration or e2e on a production build) requests the variants, then the lowercase page, and fails on the old code (watch it red). Say whether Cloudflare (spec 040 edge rules, TASK-101) already folds case in production; the origin fix is required either way (defence in depth).
- **Not this task:** redirecting case variants (spec says 404; ADR-0006 forbids request-driven redirects).
- **Class:** keeps the breaker (SEO gate, cache).

## Read

- `specs/003-i18n-foundation.md` `## 0. Index`, §2 "Canonical", AC-13; `specs/007-corridor-pages.md` §2 "Canonical"; spec 004's response-cache amendments (grep `csp-cache-handler`).
- `src/lib/csp-cache-handler.ts`, the proxy/middleware, `src/app/[locale]/not-found.tsx`; `docs/codebase-map.md`.
- `.claude/state/qa-2026-10-18/QA-2.md` (N-01 and the server-damage note).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-18 frontend-247: guard in `src/lib/csp-cache-handler.ts` + `src/lib/cache-key-case.ts`, unit test (simulated case-insensitive volume, red with the guard removed: 8 cases), e2e `tests/e2e/case-variant-cache.spec.ts`; PR 261 draft. Next: reproduce on a local production build in the build slot (guard off, then on).
- 2026-10-18 frontend-247: reproduced (see Result); scoped keys live under `server/route-cache/`, not `app/`, so `responseCacheFiles` fixed and a scoped-key unit case added; unit simulation now models APFS case-preserving lookup; e2e visits the real pages first. Done; `in_review`.
- 2026-10-18 frontend-247 (finisher, breaker round 1 HOLES): tests for the real resolver (`realTrueCasePath`, links resolved, so red on Linux), the default probe's identity, the volume probe's insensitive branch through an injected `exists` (red on Linux), and `base === undefined`; manual e2e repro documented in `docs/runbooks/local-setup.md` §6.1 (chosen over a Mac-only backdating step inside the spec).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 261. **Cause:** Next 16.3's `FileSystemCache` names cache files after the request path; on a case-insensitive volume (macOS APFS) `/EN` and `/en` are one file. **Reproduction** (production build of this branch, `next start -p 3247`, build slot, guard switched off by mutation, prerenders backdated two hours with `touch -A -020000` to stand for a server up past the 3600 s window): (1) `/en`, `/en/occasions`, `/en/send-flowers-to/poland`, `/en/poland/flowers`, `/en/poland/product/amber-hour` twice: 200 (background regeneration writes `.next/server/route-cache/APP_PAGE/<owner>/$/en.html`); (2) `/EN`, `/en/Occasions`, `/en/send-flowers-to/POLAND`, `/en/Poland/flowers`, `/en/poland/product/AMBER-HOUR`: first request **200 with the real page**, then 404 (the variant's 404 regeneration is written into `$/en.html`; `en.meta` read `"status":404`); (3) lowercase pages still 200 from the memory cache; (4) **after a restart** `/en`, `/en/occasions`, `/en/poland/flowers`, the product: **404 "Page not found"** (`/en-gb` untouched). On a fresh build without the backdating nothing collides (variants 404, no files written). **Fix:** `src/lib/csp-cache-handler.ts` resolves a response entry's files (`src/lib/cache-key-case.ts`, plain and scoped keys plus the build seed) to their true spelling with `realpath`; a file stored under another spelling is a miss on read and a skipped write. Skipped on a case-sensitive volume (one `existsSync` per dist dir), so production on Linux is unchanged. Same sequence with the guard on: every variant 404 on every request, lowercase pages 200 before and after a restart. **Tests:** unit `tests/unit/cache-key-case.test.ts` (28: APFS model over Next's real `FileSystemCache` reproducing the defect, handler on plain and scoped keys, collision rule, volume probe; guard removed: 9 red); e2e `tests/e2e/case-variant-cache.spec.ts` (real pages, then 11 variants twice, then real pages; status 404, no `Location`, Next's not-found `noindex` meta, titles distinct; local run against the backdated build: red with the guard off at `/EN (round 1) expected 404 received 200`, green with it on, with `locale-routing.spec.ts` 43 passed). In CI (Linux) the e2e holds on old and new code alike: the defect needs a case-insensitive volume. **Cloudflare:** `config/cloudflare/edge.json` has no lowercase/URL-normalisation transform (cache rules, www redirect, rate limit, headers only; cutover still pending, TASK-104) and Cloudflare's cache key is case-sensitive, so production does not fold case at the edge; the origin on Railway is a case-sensitive Linux container, which is why production never showed N-01. **Carry-forward suggestion:** the nine `skipsOnCaseInsensitiveHost` skips (`tests/support/case-insensitive-host.ts`) can go now; left in place because they sit in files other tasks own tonight.
