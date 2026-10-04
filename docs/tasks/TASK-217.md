# TASK-217 — Spec 012 shared sign-in core and admin shell: `src/lib/auth/` (factory, adapter over `withSystemContext`, confirm step, send limit), the `Mailer` with Resend and the capturing mailer, the admin instance and its email, migration `NNNN_admin_identity`, `requirePermission` and `ADMIN_PERMISSIONS`, the admin layout and catalogue, `/admin`, `/admin/users`, `pnpm admin:grant`, env keys

Row: `TASKS.md` → TASK-217. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-217`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 1. Owns **AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9 (admin half: the emailed link carries no address; GET, GET, POST signs in and lands on `/admin`; a second POST and a token older than one hour land on the expired page; no URL carries the address; a florist session cookie sent to `/admin` authenticates nothing)**; tests **T-01–T-10, T-11 (admin half), T-24 and T-25 for the sign-in, home and users templates**. The florist-route half of AC-9 is TASK-212's (ruling R7).
- **Ruling R2: the one sign-in core** (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"), in `src/lib/auth/`: `createAuthSurface(AuthSurfaceSchema)` (base path, cookie prefix and path, session `maxAge` and rolling, pages, allow predicate, template tag) so TASK-212 adds the florist instance without editing the core; `adapter.ts`, every call one `withSystemContext('auth', …)` transaction (no raw client, spec 002 AC-3), tokens hashed with `AUTH_SECRET`; `confirm.ts` (spec 011's link design: `GET` renders "Continue", `POST` consumes in process, `ConfirmSignInSchema`); `send-limit.ts` (5 links per address per hour in `auth_email_send`, keyed by the SHA-256 of the normalised address, no IP). One `Mailer` in `src/modules/notifications/mailer.ts` (`resendMailer` in staging and production, `capturingMailer` elsewhere with `GET /api/internal/mail-capture` behind `INTERNAL_CRON_SECRET`, refused in production and staging; the tag registry). Env names `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `MAILER` only: no `AUTH_RESEND_KEY` or `ADMIN_MAIL_FROM` anywhere.
- **The admin instance:** `basePath` `/admin/api/auth`; `__Secure-fo-admin.session-token`, `.csrf-token`, `.callback-url`, each `Path=/admin`, `Secure`, `HttpOnly`, `SameSite=Lax`, no `__Host-` name; 12-hour sessions; allowlist = an active `admin_profile` and at least one `user_role`; identical page and no email otherwise.
- **Migration `NNNN_admin_identity`** (`admin_profile`, `auth_email_send`, RLS admin and system only) with `.down.sql`.
- **Guard and shell:** `requirePermission(…)` is the first statement of every admin server action and handler (T-02's scan); `ADMIN_PERMISSIONS` is §5.2's v0 matrix; the layout redirects by session state (`redirect()`), never by location, and `src/proxy.ts` stays redirect-free. Every `/admin` response carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store, private`, plus the meta; `Disallow: /admin/` stays. `/admin` (three counters as links), `/admin/users` (grant, revoke, deactivate, each deleting sessions in the same transaction; the own last admin role cannot be removed), `pnpm admin:grant`.
- **Admin copy** in `messages/admin/en.json` (+ meta), English only, loaded only by the admin layout, outside public reviewed shares; the banned-word scan in `tests/unit/design-docs.test.ts` exempts `messages/admin/` and `docs/design/wireframes/admin-*`, and only those. Auth.js's logger goes through `src/lib/logger.ts`; the redaction list gains `identifier`, `email`, `token`, `display_name`. WCAG 2.2 AA; targets at least 24 × 24 px.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Env keys (DoD §5; `/review 191` item 2):** this task is the first reader of `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `MAILER`, so it declares them in `.env.example` and `src/lib/env.schema.ts` (validated by `lib/env.ts`) in its own PR and reads them only through `lib/env`. TASK-223 adds them to `config/railway.json` and runs `pnpm env:check` and `pnpm railway:check`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): auth, a migration and security. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.2; §5.1 (`NNNN_admin_identity`); §5.2 (the ownership table, the permission matrix); §5.3; §5.4; §6; §7; §8 (logs, security, accessibility); §9 AC-1–AC-9; §10; §12 task 1 and "Founder actions".
- `specs/011-for-florists-vendor-inbox.md` §2 "Florist sign-in" and §5.2 (the link design the core adopts); ADR-0019 (one email sign-in for florists and admin); ADR-0013; ADR-0015; `docs/tasks/TASK-022.md`.
- Artboards: `docs/design/wireframes/admin-sign-in-{desktop,mobile}.dc.html`, `admin-home-{desktop,mobile}.dc.html`, `admin-users-{desktop,mobile}.dc.html`, and the Admin group of `system/components.dc.html` (not drawn yet; `/design` draws it before this task is dispatched).
- `docs/codebase-map.md`; `src/lib/db.ts`, `src/lib/env.schema.ts`, `src/proxy.ts`, `src/lib/logger.ts`, `tests/unit/design-docs.test.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** ready when TASK-022 and TASK-023 have merged, `/design 012` has drawn and merged the admin artboards, and the founder has done §12 founder actions 2–3: a Resend account in the EU region, the sending subdomain's SPF and DKIM records on Cloudflare, the DPA accepted and filed in `docs/compliance/`, and `AUTH_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` on Railway staging and production. After merge the founder runs `pnpm admin:grant` for themselves.

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
