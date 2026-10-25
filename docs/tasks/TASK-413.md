# TASK-413: Buyer sign-in providers, data and configuration: migration `NNNN_buyer_providers` + down (`accounts.linked_at`, `auth_pending_link`, `buyer_email_claim`, system-only RLS, retention rows and sweep steps, flags `auth.provider.google` and `auth.provider.apple` off), the six `AUTH_GOOGLE_*` and `AUTH_APPLE_*` variables in `env.auth.ts` (all or none, P-256 key check), `appleClientSecret()`, the core extension (`oauthProviders`, the three transient cookies `SameSite=None`), the token-free `linkAccount`, the redaction list, the cookie register

Row: `TASKS.md` → TASK-413. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-413`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth, security, migrations.
- **Feature PR.** TASK-413 to TASK-415 are one feature PR built by one backend agent on branch `task/TASK-413-buyer-providers`; the description names all three IDs and each row gets the PR link.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **AC-67 (T-67).** `appleClientSecret()` in `src/lib/auth/providers/apple-secret.ts` signs an ES256 JWT with the `.p8` key: header `kid` = `AUTH_APPLE_KEY_ID`; `iss` = `AUTH_APPLE_TEAM_ID`, `sub` = `AUTH_APPLE_ID`, `aud` = `https://appleid.apple.com`, `exp - iat` = 3600; cached in memory, renewed five minutes before `exp` (injected clock). `validateEnv` in `staging` and `production` fails a partial Google or Apple group, or a key that is not a PKCS#8 P-256 private key, naming the keys and printing no value; with no group set it passes and no button renders. PR environments carry none of the six.
- **AC-71 (T-71).** Migration `NNNN_buyer_providers.sql` + `.down.sql` exactly as S.7, after TASK-352's `NNNN_buyer_account`: `accounts.linked_at`, `auth_pending_link`, `buyer_email_claim` (index on `user_id`), RLS `app.role = 'system'` only on both, `retention_policy` rows (delete one day after `expires_at`) with their sweep steps, `feature_flag` rows `auth.provider.google` and `auth.provider.apple` (global, off). Up, down, up; the sweep deletes at expiry plus one day and keeps at expiry minus one hour.
- **AC-47 as amended.** The buyer surface's providers are the core's email provider and, when S.6 allows, Google and Apple; the source scan admits OAuth provider configuration only under `src/lib/auth/`. Spec 012 AC-2, AC-3, AC-8, AC-9 and spec 011 AC-18 to AC-22 pass unmodified. TASK-351 and TASK-344 keep the rest of AC-47.
- **The core extension (S.2, additive, a requirement on spec 012's core).** `AuthSurfaceSchema` gains `oauthProviders?: ('google'|'apple')[]`, admitted only for `buyer`. Transient cookies `__Secure-fo-buyer.state`, `.pkce.code_verifier` and `.nonce`: `Secure; HttpOnly; SameSite=None; Path=/api/auth/buyer; Max-Age=900`; `callback-url` becomes `SameSite=None`; the session and CSRF cookies keep C.3's attributes. The adapter's `linkAccount` writes `userId`, `type`, `provider`, `providerAccountId` and `linked_at` only; every token column stays null. Admin and florist surfaces are unchanged.
- **Explicit scope with no AC id.** `.env.example` lists the six keys empty, one comment line each, and `src/lib/env.auth.ts` gains the resolvers `googleProviderConfig()` and `appleProviderConfig()` (a config or null, the existing "optional at boot, required at use" pattern). The logger's redaction list gains `id_token`, `access_token`, `code_verifier` and `providerAccountId` (S.8). The cookie register (`src/config/cookies.ts` and `docs/compliance/cookie-register.md` together) gains the three transient cookies (15 minutes) and `pending-link` (one hour), all essential, set only after a provider button is pressed, and `callback-url`'s `SameSite` change.
- Not here: the sign-in flow (TASK-414), the buttons (TASK-415), export and erasure of these rows (TASK-417), the RoPA (TASK-423).

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.2, S.6, S.7, S.8; C.3, C.4, C.11
- `docs/codebase-map.md`
- `specs/012-admin-v0.md` §2.2 (the core and its surfaces)
- `src/lib/auth/surface.ts`, `src/lib/auth/adapter.ts`, `src/lib/auth/schema.ts`, `src/lib/env.auth.ts`
- `src/config/cookies.ts`, `docs/compliance/cookie-register.md`
- the `NNNN_buyer_account` migration TASK-352 adds

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
