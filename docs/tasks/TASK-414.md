# TASK-414: Buyer sign-in with Google and Apple, flow and linking: `startProviderSignIn` (Zod `provider` and `return`), Auth.js's Google and Apple OpenID Connect providers (exact scopes, PKCE `S256`, `state`, `nonce`, Apple `form_post`), the two callbacks (`no-referrer`, a redirect without the query), S.3's linking without takeover (trust rules, the pending link with T14, same-browser confirm), the flag and configuration refusals, S.10's logs, alert and GA4 `login`

Row: `TASKS.md` → TASK-414. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-414`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth, security, data flows. Awkward cases at least: a changed email at the provider, a tampered `state` or `nonce`, a replayed callback, an untrusted Google email on an existing user, the Apple `"true"` string, a redacted customer, an `invalid` address, no email, a provider session at `/admin`.
- **Feature PR.** Same agent and PR as TASK-413 (`task/TASK-413-buyer-providers`).
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **The providers (S.2).** Auth.js's Google and Apple OpenID Connect providers, configured only in `src/lib/auth/buyer.ts` and `src/lib/auth/providers/`. Scopes exactly `openid email profile` and `name email`; code flow with PKCE `S256`, `state` and `nonce`; Apple `response_mode=form_post`. Read from the verified ID token only `sub`, `email`, `email_verified`, `hd` (Google) or `is_private_email` (Apple), and the name (Google's `name`; Apple's `user` form field on the first authorisation). Never the picture: `users.image` stays null. No Google or Apple API is called after sign-in. No provider script, ever.
- **`startProviderSignIn`** (`{ provider: z.enum(['google','apple']), return: z.enum(['account','checkout']).default('account') }`): Origin-checked by Next, maps `return` to C.4's allowed targets (AC-50's rule), answers Auth.js's redirect; works with JavaScript off. Flag off or configuration absent: 303 to `/{locale}/account?state=provider-error` with no provider request (`flag_off` or `config_missing`).
- **Callbacks.** `GET /api/auth/buyer/callback/google` and `POST /api/auth/buyer/callback/apple`, both `Referrer-Policy: no-referrer` and a redirect to a URL without the provider's query. No Origin check of ours on these two; their protection is `state`, PKCE and `nonce`.
- **Linking without takeover, S.3 items 1 to 8 exactly** (item 9, Disconnect, is TASK-416's). Trusted: Google `email_verified === true` with a `gmail.com` or `googlemail.com` address, or `hd` present and equal to the email's domain; Apple `email_verified` `true` or `"true"`. Untrusted: nothing linked or created, no session; one `auth_pending_link` (SHA-256 of the cookie and of the normalised email, one hour), the `__Secure-fo-buyer.pending-link` cookie, T14 through the core with its limits (same response whether or not sent), landing on `?state=confirm-email`; the `accounts` row is inserted in the `afterSignIn` transaction only when that link is confirmed in the same browser with the same email hash. The provider's name fills `customer.name` only while it is null. A provider link authenticates only the buyer surface.
- **ACs.** AC-64 (T-64), AC-65 (T-65, the fake-issuer matrix: MSW, ID tokens signed by a test key), AC-66 (T-66 integration half), AC-70 (T-70), AC-73 (T-73), and AC-49 as amended: its first-sign-in clauses hold for a trusted provider sign-in. The manual staging halves of T-65 and T-66 (real Gmail, real Apple in Safari) are TASK-425's.
- **Explicit scope with no AC id (S.10).** `auth.buyer.signed_in {method, first}` replaces C.17's form; `provider_start`, `provider_link {outcome}`, `provider_error {code}`; the alert at more than 10 non-`access_denied` errors in an hour; GA4 `login` with the one parameter `method`, consent-gated, where spec 023's layer exists (else a carry-forward in this brief). C.17's Q19 counters are retired.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.2, S.3, S.5, S.6, S.10; C.4, C.6, C.10, C.17, AC-49, AC-50
- `docs/codebase-map.md`
- `src/lib/auth/surface.ts`, `src/lib/auth/adapter.ts`, `src/lib/auth/tokens.ts`, `src/lib/auth/send-limit.ts`
- `docs/design/flows/buyer-journey.dc.html` (branches S1 to S5)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **G3 (design PR 417, 2026-10-25): where a cancelled consent (`access_denied`) lands.** Spec 018 does not say. Default the designer drew: `/{locale}/account?state=provider-error` with `auth.account.providerError`, logged `provider_error {code: 'access_denied'}`, which the alert excludes. Build the default; open with the founder through the orchestrator.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
