# TASK-212 — Spec 011 florist sign-in on the shared core: the florist instance `florist.ts` (base path, `__Secure-fo-florist.*` cookies, 30-day rolling session, `signInPolicy`), the sign-in email template, `requireFloristContext`, `FLORIST_BASE_PATH` routing, the production 404, cookie register rows, the language switch

Row: `TASKS.md` → TASK-212. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-212`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 4. Owns **spec 011 AC-18, AC-19, AC-20, AC-21, AC-22, AC-32** and, by ruling R7 (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"), **spec 012 AC-9 (florist-route half: an admin session cookie sent to a `{FLORIST_BASE_PATH}` route authenticates nothing)**; tests **011 T-18–T-22, T-32; 012 T-11 (florist-route half)**.
- **ADR-0019 and ruling R2: one core.** Build the florist instance with TASK-217's `createAuthSurface`; no second Auth.js configuration, adapter or mailer (AC-22's scan). `src/lib/auth/florist.ts`: `basePath` `{FLORIST_BASE_PATH}/api/auth`, pages under `{FLORIST_BASE_PATH}/sign-in`, database sessions, 30 days rolling, cookies `__Secure-fo-florist.session-token`, `.csrf-token`, `.callback-url`, each `Path={FLORIST_BASE_PATH}`, `Secure`, `HttpOnly`, `SameSite=Lax`, no `__Host-` name; the allow predicate is `signInPolicy(environment)` with the `partner_member` lookup (`production` → `[]`). Same page for every address; no enumeration.
- **The link (the core's design):** no email address in any URL; a `GET` renders one "Continue" and consumes nothing; the `POST` consumes; single-use, one hour.
- **Context:** `requireFloristContext()` reads memberships on every request; `toDbContext` gives `role: "partner"`, `userId`, `partnerIds`; no membership sends to sign-in.
- **Routes:** every `{base}` path built from `FLORIST_BASE_PATH`; `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; 404 under `APP_ENV=production`; no GA4 or consent analytics path; Cloudflare bypass for `{base}/*` (add the rule if `pnpm cloudflare:check` shows it missing). Public responses are identical with and without a florist cookie (AC-21).
- **Language:** `partner_member.locale_code` with a switch that persists; before sign-in `hl` (registered in `src/config/url-keys.ts`), default `en`; never `Accept-Language`, never an IP. The sign-in email template under `emails/` with a plain-text part, tag `florist_sign_in`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): auth, cookies, robots and the production 404. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §2 "Florist sign-in"; §5.2 (sign-in, mail); §5.4; §6; §8 (cookies, logs, security); §9 AC-18–AC-22, AC-32; §12 task 4; §13 Q2, Q4.
- `specs/012-admin-v0.md` §2.2 and AC-9; `docs/adr/ADR-0019-one-florist-email-sign-in.md`; `docs/tasks/TASK-217.md`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/florist-sign-in-desktop.dc.html` and `docs/design/wireframes/florist-sign-in-mobile.dc.html` (drawn at 1440 too, the audit's decision 4; on the phone the language links sit under the card).
- `docs/codebase-map.md`; `src/lib/basic-auth.ts`, `src/config/cookies.ts`, `src/config/url-keys.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** ready when TASK-217 has merged (the sign-in artboards merged in PR 197). The one-sign-in decision of spec 011 §13 Q2 is recorded in `docs/adr/ADR-0019-one-florist-email-sign-in.md`; its spec 017 condition (order emails sign the florist in with one tap) is a requirement this task's link design must keep possible.

- **2026-10-22, from the implementer (self-review, PR 326), left for later tasks:**
  - *Cookie register rows not added.* `src/config/cookies.ts`'s schema refuses `writer: "server"` with `status: "set"` (spec 004's "no `Set-Cookie` on a cached response" invariant) and every row needs a public `consent.cookies.<id>.purpose` key, which counts in the indexable share. The three `__Secure-fo-florist.*` cookies (and admin's three, also unregistered) need that invariant restated for `no-store`, path-scoped surfaces; TASK-216's close-out names the cookie register.
  - *Cloudflare bypass for `/demo/*` not added to `config/cloudflare/edge.json`.* The zone caches documents on the production host only, where every florist route is a 404 in Phase 0; adding the path changes the live-probed e2e (`cloudflare-edge.spec.ts`), which would go red until the founder applies the rule. Add `/demo` to `bypass.paths` with the founder's apply step before production sign-in opens (spec 026).
  - *The sign-in card's notice link* is an unfilled `[slot]` on the artboard (Appendix A has no words and the notice is TASK-213's); not drawn.
  - *`signed-out` state* renders the plain form (the artboard draws no signed-out frame and Appendix A has no words for one).
  - *The sign-in email is not a React Email template under `emails/`*: plain strings in `src/modules/partners/auth/sign-in-email.ts`, the admin precedent (no new code root, no dependency).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22: florist instance `src/lib/auth/florist.ts` on the core's factory; core changes: `renderEmail(link, email)` may be async (the member's language), rolling sessions extended in `sessionUserId()`, session tokens bound to their surface (`admin.…`/`florist.…`; existing admin sessions end once); `src/config/florists.ts` (`FLORIST_BASE_PATH`, `signInPolicy`); routes under `src/app/demo/vendor-inbox/` (layout, inbox shell, sign-in, confirm, `api/auth/*`, `api/language`); proxy: production 404, `?hl=`, rolling cookie; header rules; `/demo/` in robots; `floristAuth`/`floristInbox`/`emails.floristSignIn` in en (unreviewed) and pl/de machine drafts; tests: `tests/unit/florist-surface.test.ts`, `tests/integration/florist-auth.test.ts`, `tests/e2e/florist-surface.spec.ts`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 326 (feature PR with TASK-211). The florist instance on the core, `src/config/florists.ts`, the route tree under `/demo/vendor-inbox`, the proxy's production 404, `?hl=` and rolling cookie, header rules, `/demo/` in robots, en/pl/de copy. Core: async localised `renderEmail`, rolling in `sessionUserId()`, surface-bound session tokens (existing admin sessions end once). Tests: unit `florist-surface.test.ts` (32), integration `florist-auth.test.ts` (10: T-18 table of 50 cells, T-19 ×3, AC-9 both ways, T-20 ×2, T-32, rolling, logs), e2e `florist-surface.spec.ts` (T-21 over six public pages, T-22, T-32 `lang`). Carry-forwards above (cookie register, Cloudflare `/demo`, notice slot).
