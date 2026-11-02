# TASK-354 — Spec 026a the move to `/vendor` and the live policy: `FLORIST_BASE_PATH` `/vendor` and the route tree, `/demo/vendor-inbox` answering 404 with no redirect, `signInPolicy` production `["active", "paused"]`, the production 404 removed, the request-time status filter in `requireFloristContext`, `canAcceptFor` with the paused notice, the cookie register

Row: `TASKS.md` → TASK-354. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-354`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-212, TASK-214, TASK-215, PR 337 (design).
- Spec 026a §2 (mount point, who may sign in), §5.2, §5.4, §6, §12 task 1. Owns AC-1 to AC-6 and AC-12.
- `floristSurfaceOpen()` is removed with its callers. Status is read on every request; a refused accept raises `ASSIGNMENT_PARTNER_NOT_ACCEPTING`, writes nothing and renders spec 011's changed-state message; Decline is not gated. Every `/vendor` response, redirects and 404s included, carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; `robots.txt` keeps `Disallow: /vendor/`.
- **Same agent and feature PR as TASK-355 and TASK-356** (branch `task/TASK-354-vendor-live`, the PR names all three IDs).
- Copy: `floristInbox.paused.notice` in en, pl, de `reviewed: false` (florist scope).
- **Built from the merged artboards** of PR 337 (`florist-inbox-*`, `florist-sign-in-*`, `flows/florist-journey`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** five environments by five partner statuses by member or not, plus `"bogus"` (fails closed to production); a member of a demo and an active partner under production; a partner offboarded between two requests of one session; a forged accept from a paused shop under the row lock; the old path with every suffix (404, no `Location`); the locale proxy on `/vendor`, `/vendor/`, `/en/vendor`; public pages with and without the florist cookie (byte-equal).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/026a-florist-signin-live.md` (whole spec, 255 lines)
- `specs/011-for-florists-vendor-inbox.md` §5.2, §5.4; `docs/tasks/TASK-212.md`, `TASK-214.md`, `TASK-215.md`
- `src/config/florists.ts`, `src/lib/auth/florist.ts`, `config/cloudflare/edge.json`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

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

- 2026-11-02: base path `/vendor`, route tree moved (`git mv`), production policy `["active", "paused"]`, the proxy's environment 404 and `floristSurfaceOpen`/`floristGate` removed, `canAcceptFor` in `respondToOffer` under the lock and in `floristActionsFor`; unit tests updated. Draft PR 458.
- 2026-11-02: the paused notice (`InboxNotice tone="note"`, `InboxList` `notice` slot) on the list and on a paused shop's open offer; en/pl/de copy; review scope and queue. Paused by the coordinator (usage limit).
- 2026-11-03: integration T-03, T-05, T-06 green on a throwaway PG16 with three mutation runs red; the cookie register handed to TASK-356 (orchestrator, 2026-11-03); copy record script `.claude/state/record-approval-354.py`.

## Result

PR 458. Spec 026a task 1: `FLORIST_BASE_PATH` is `/vendor` (`src/config/florists.ts`), the tree is `src/app/vendor`, the Phase 0 path is spelled nowhere under `src/` and answers 404 with no redirect (Next has no route for it; the proxy passes it untouched). `signInPolicy("production")` is `["active", "paused"]`; the proxy's environment 404 is gone, so the surface answers everywhere with `noindex` and `private, no-store` from `floristHeaderRules()`. `resolveFloristContext` already filtered memberships by status on every request; that filter is now proven under production (T-05). `canAcceptFor(mode, status)` (`src/modules/orders/florist-actions/can-accept.ts`) gates Accept in `floristActionsFor` and in `respondToOffer` under the order and assignment locks (`ASSIGNMENT_PARTNER_NOT_ACCEPTING`, nothing written, the "changed" notice; log `florist_accept_refused`). The paused notice `floristInbox.paused.notice` (en human, pl and de machine, all `reviewed: false`) renders on the list and on a paused shop's open offer. Tests: unit `florist-surface.test.ts` (policy table with `bogus`, tree, source scan, proxy pass-through in five environments, robots), `florist-actions.test.ts` (+3: `canAcceptFor` table, paused offer, paused fulfilment), `florists-config.test.ts`; integration `florist-auth.test.ts` (T-03 production column, T-05 new), `florist-actions.test.ts` (T-06 new); e2e `florist-surface.spec.ts` (AC-2 old paths 404, AC-4 order redirect, AC-12 twelve pages with and without the cookie, link crawl, sitemap scan), written for CI and not run locally (no build, battery rule). No migration. No build or browser run locally. Handed on: the cookie register to TASK-356 (its AC-14); `setPartnerStatus` is TASK-221's and not on main, so T-05 offboards with the same admin `UPDATE` T-20 uses.
