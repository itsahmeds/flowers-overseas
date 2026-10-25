# TASK-415: Account page with Google and Apple: the signed-out `/{locale}/account` in S.1's order (two `ProviderButton`s, each a `<button>` in a `<form method="post">`, the "or" divider, the email form), `ProviderButton` and `TextDivider` in `src/modules/ui`, the `confirm-email` state with "Back to your order" and the `provider-error` state, the account page's `form-action`, no provider script, the `auth.account.*` keys

Row: `TASKS.md` → TASK-415. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-415`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** carried by the feature PR's breaker class (auth, security); here the CSP and the no-script rule are the risk.
- **Feature PR.** Last task of TASK-413 to TASK-415 (`task/TASK-413-buyer-providers`).
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **AC-63 (T-63).** Cookie-less `GET /{locale}/account` with both flags on and both configurations present renders, in document order, `<button>` "Continue with Google", `<button>` "Continue with Apple", the divider and the email form, each provider button inside a `<form method="post">` submitting `startProviderSignIn`. No `<script>` or `<iframe>` from a Google or Apple host, and zero requests to such a host before a click (network log). CSP `form-action` on this `no-store` response exactly `'self' https://accounts.google.com https://appleid.apple.com`; public pages, the admin and the florist inbox stay `'self'` (step 3 of checkout is TASK-420's). One flag off or one configuration absent: that button is absent; both: the HTML equals C.13's signed-out page apart from ids. The C.6 nudge is unchanged.
- **S.1 and S.8 accessibility.** Both buttons the same size, each provider's mark as inline SVG in our HTML with `aria-hidden`, the label as text, at least 44 px, accessible name exactly the visible label, focus order as the visual order, JavaScript off works.
- **States.** `?state=confirm-email` (`auth.account.confirmEmail`, plus "Back to your order" to `/{locale}/checkout` when the sign-in started from checkout) and `?state=provider-error` (`auth.account.providerError`), as drawn.
- **Components.** `ProviderButton` (Google and Apple, primary and secondary sizes, hover, focus, pressed) and `TextDivider` in `src/modules/ui`, in step with `docs/design/system/components.dc.html` (group "Sign-in providers and express checkout"). TASK-420 reuses the secondary size at checkout.
- **AC-74, key set of this PR.** The six `auth.account.*` keys of S.9 in en, en-gb, de and pl, `proposed`, `reviewed: false`, no `relayMatches` hit; the de and pl button labels use each provider's own wording ("Weiter mit Google", "Kontynuuj z Google", "Mit Apple fortfahren", "Kontynuuj z Apple"), checked against the providers' current guidelines and recorded in the PR. Axe, target sizes and baselines are TASK-424's.
- **Design, no compromise (founder 2026-10-24).** Match `account-sign-in-desktop.dc.html` and `-mobile` pixel for pixel at 1440, 1280 and 390 px; screenshots at 1280 x 800 and 390 x 844 compared with the artboard before `gh pr ready`.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.1, S.2 (CSP), S.5, S.8, S.9, S.13; C.5, C.6, C.13
- `docs/codebase-map.md`
- `docs/design/wireframes/account-sign-in-desktop.dc.html`, `docs/design/wireframes/account-sign-in-mobile.dc.html`
- `docs/design/system/components.dc.html`, `docs/design/README.md` (rule 2 and its exception)
- `src/lib/csp.ts`, the account page TASK-344 builds under `src/app/[locale]/(account)/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **G1 (design PR 417, 2026-10-25): the button typeface.** Google's guidelines name Google Sans Medium for the label; the boards use our body face to stay inside the font budget. Default as drawn: our body face. Open: confirm with Google's current branding guidelines (or Google's review) and record the answer in the PR; the Google flag does not turn on in production (TASK-425) until it is settled.
- **G2 (design PR 417, 2026-10-25): provider colours.** They are not our tokens; the boards write them as OKLCH literals in one marked style block (design README rule 2's exception). Default as drawn: one marked block beside `ProviderButton`, nowhere else. If a colour lint or the design-docs test refuses it, stop and report rather than widen the rule.
- **G3:** the `provider-error` state also covers a cancelled consent (see TASK-414).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
