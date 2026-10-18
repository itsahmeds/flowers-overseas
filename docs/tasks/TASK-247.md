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

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
