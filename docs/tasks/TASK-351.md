# TASK-351 — Spec 018 buyer surface, the core extension: the additive changes of §14 C.3 to spec 012's sign-in core (`name` `buyer`, `mailTags` `buyer_sign_in` and `occasion_reminder`, `cookiePath` `/`, `pagesFor(locale)`, `renderEmail` with a locale, the stored and validated return path, `signOutEverywhere`, the `afterSignIn` hook), with the admin and florist suites unmodified

Row: `TASKS.md` → TASK-351. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-351`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: TASK-212, TASK-217.
- Spec 018 §14 A-founder-2026-10-22 C.3 "Core extension" and C.4 (return path), C.10; `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md` (the split). Owns AC-47's core half; TASK-344 owns the buyer surface half (cookies, expiry, cross-surface checks).
- Additive only: the admin and florist surfaces' configuration, cookies and tests are not edited. The return-path validator admits only the surface's `returnTo` pattern; another origin, `//`, a backslash or an encoded scheme falls back to home (AC-50 is TASK-344's, but its unit cases may land here).
- Spec 012's `Mailer` is not changed here (the `headers` field is TASK-353's).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** spec 012's and 011's suites run unmodified before and after (paste both counts); `cookiePath` `/` with a page under `/en/account`; a return path `https://evil`, `//evil`, `/\evil`, `%2F%2Fevil`, `/en/admin`; `afterSignIn` throwing (the confirm must not half-commit); `signOutEverywhere` on a user with sessions on two surfaces.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/018-tracking-account.md` §14 A-founder-2026-10-22 C.2 to C.4, C.10, AC-47; `specs/012-admin-v0.md` §5.2 (the core)
- `src/lib/auth/`, `docs/tasks/TASK-212.md`, `docs/tasks/TASK-217.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, for TASK-344, AC-48): the core's `SignInRequestSchema` (spec 012's, unchanged here) refuses `redacted+x@invalid` (single-label domain) and a unicode local part (`zoë@example.test`) with a bare `303` to the sign-in page, no `?state=sent`, no stored return path, no mail. AC-48 wants the same bytes as `?state=sent` for `redacted+x@invalid`; the buyer route (or a surface-level form schema, which would be a further core change) must decide it. Proven in `tests/integration/auth-core-extension.test.ts` "plus addressing ...".
- 2026-11-04 (self-review, for TASK-344): `signOutEverywhere(userId)` deletes every `sessions` row of the user on every surface (C.3's words, AC-53), so a founder who is admin, florist and buyer is signed out of admin and the vendor inbox too. If the founder wants only buyer sessions, it is a one-line scope on the token prefix.
- 2026-11-04 (self-review, not this task's scope): `tests/integration/auth-adapter.test.ts` "the keys into users exist with their delete rules" fails on `origin/main` before and after this change (the FK list lacks `admin_order_action_actor_user_id_users_id_fk` and later keys); it needs its own row.
- 2026-11-04 (for the orchestrator): spec 012 §2.2's surface table gains the `buyer` row (spec 018 C.18); the spec text was not edited here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 B351: core extension built in `src/lib/auth/{schema,surface}.ts` and two mail tags in `mailer.ts`; tests `tests/unit/auth-core-extension.test.ts` (55) and `tests/integration/auth-core-extension.test.ts` (16) green on a local PG16; spec 012's and 011's suites unmodified and green. Next: self-review mutations, PR ready.
- 2026-11-04 B351: 26 mutations, each red; one survivor (pagesFor `//` check) closed by a stronger case. PR opened and marked ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 500](https://github.com/itsahmeds/flowers-overseas/pull/500): the additive core extension of spec 018 §14 C.3 and C.4 in `src/lib/auth/schema.ts` (`name` `buyer`, `cookiePath` `/` covering every path, optional `pagesFor`, `returnTo`, `afterSignIn`) and `src/lib/auth/surface.ts` (`pagesOf`, `isSafeReturnPath`, locale-aware `requestSignIn`/`confirm`/`signOut`/`signInLocation`, `renderEmail(link, email, { locale })`, the return path stored in and read from the surface's `callback-url` cookie and kept from Auth.js, `afterSignIn` undone on failure, `signOutEverywhere`), plus the mail tags `buyer_sign_in` and `occasion_reminder`. Tests: unit 55 (`tests/unit/auth-core-extension.test.ts`), integration 16 (`tests/integration/auth-core-extension.test.ts`, local PG16). Spec 012's `auth-core.test.ts` (23) and spec 011's `florist-auth.test.ts` (17), `auth-after` (1) and the auth unit files (139) pass unmodified before and after. No migration. `src/lib/auth/buyer.ts`, its route, pages and T14 are TASK-344's. No build, browser or CI run (work order 2026-11-04).
