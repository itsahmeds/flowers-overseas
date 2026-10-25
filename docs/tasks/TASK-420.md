# TASK-420: Google and Apple at checkout: on step 3, for a guest in `test` or `live` with `account` on, the account row with AC-80's link and the secondary-size "Continue with Google" and "Continue with Apple" forms posting `startProviderSignIn` with `return=checkout`, step 3's `form-action` with the two provider origins, R2's prefill after a provider sign-in

Row: `TASKS.md` → TASK-420. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-420`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth. Awkward cases at least: a `return` other than `checkout`, an untrusted email started from checkout, a provider sign-in completed in another browser, the flag on with the configuration absent.
- **Feature PR.** Same agent and PR as TASK-419 (`task/TASK-419-checkout-accounts`).
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **Entry item 3 and spec 018 S.5.** On step 3, for a guest in `test` or `live` with `account` on, one row under the divider and above the email field holds AC-80's link and, for each provider whose flag is on and whose configuration is present, a secondary-size `ProviderButton` (TASK-415's) in a `<form method="post">` posting `startProviderSignIn` with `return=checkout`. Absent in `demo`, with a session, with `account` off. Guest checkout stays the default; nothing is gated.
- **AC-107 (T-107).** The presence matrix, the forms and `return`; after a fake-issuer Google sign-in started there, `GET /{locale}/checkout` renders step 3 with the account's email as read-only text and the profile's name, and every draft and line column except the two timestamps is byte-equal to before. An untrusted email lands on `/{locale}/account?state=confirm-email` with "Back to your order" and the draft untouched.
- **AC-12 as amended, provider half.** The allowed account elements gain the two provider buttons; T-12's scan admits exactly them.
- **CSP.** Step 3's `form-action` gains `https://accounts.google.com https://appleid.apple.com` (spec 018 S.2), on step 3 only. The full step 3 CSP assertion of spec 013 AC-2 as amended is TASK-422's, which adds the Stripe origins.
- **Design.** Match step 3 as a guest with the provider row, one provider off, and signed in after Google, at 1440, 1280 and 390 px.

## Read

- `specs/010-checkout.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a items 3 and 4; AC-12, AC-80, AC-107
- `docs/codebase-map.md`
- `specs/018-tracking-account.md` §14 A-founder-2026-10-25a S.1, S.2 (CSP), S.5
- `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`
- `src/lib/csp.ts`

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
