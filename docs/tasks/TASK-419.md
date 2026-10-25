# TASK-419: Spec 010 checkout touchpoints for accounts (A-founder-2026-10-22b, approved and drawn, never planned): R1's "Have an account? Sign in" on step 3, R2's signed-in prefill with "Not you? Sign out" (`signOutFromCheckout`), R3's saved recipients for the line's country (`useSavedRecipient`) and the unticked save box, placement on the session's customer, the six keys

Row: `TASKS.md` → TASK-419. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-419`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 010 §14 A-founder-2026-10-22b, approved on 2026-10-22 as a consequence of the founder's approval of spec 018 §14 A-founder-2026-10-22 ("specs ok"). Its row was never planned: the 2026-10-22 plan said the touchpoints needed this amendment first, and none followed when it merged. Planned on 2026-10-25 because AC-107 (TASK-420) builds on it. Read it with spec 010 §14 A-founder-2026-10-25a item 1: "the buyer's screen" is step 3 "Your details".
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth, personal data, order ownership. Awkward cases at least: a session that ends between the last save and placement, a crafted POST with another email, a saved-recipient id of another customer or another country, a ticked box for a hospital, the 20-recipient limit, sign-out on a shared device.
- **Feature PR.** TASK-419 and TASK-420 are one feature PR by one frontend agent on branch `task/TASK-419-checkout-accounts`.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **Items 1 to 11 of the 22b entry** and its ACs: AC-80 as amended by A-founder-2026-10-25a (the link renders on step 3 only), AC-81, AC-82, AC-83, AC-84, AC-85, and AC-86 whole (keys, axe, keyboard run, 44 px, baselines), as that entry's §15 assigns (T-80 to T-86).
- **Seams.** The `(checkout)` page and actions call only spec 018's `buyerCheckoutProfile`, `saveRecipient` and the buyer surface's sign-out; nothing under `src/modules/checkout` reads a cookie or an account table (AC-85's source scan). No password, account creation, profile write or opt-in anywhere in checkout. A `demo` checkout ignores any session.
- **Dependencies to check before starting.** TASK-344 ships item 3's `return=checkout` mapping in its sign-in form and a sign-out callable from checkout; TASK-352 ships `buyerCheckoutProfile` and `saveRecipient`. If either lacks them, stop and report.
- TASK-204 keeps AC-12 as rewritten by 22b (its guest assertions); TASK-418 and TASK-420 own its 2026-10-25 readings.
- **Design.** Artboards in PR 336 (the guest link, the signed-in screen with "Not you? Sign out", saved recipients, the box hidden for a hospital) and PR 417 (step 3 after the split, signed in). Match pixel for pixel at 1440, 1280 and 390 px.

## Read

- `specs/010-checkout.md`: `## 0. Index` first, then §14 A-founder-2026-10-22b and A-founder-2026-10-25a items 1 and 3
- `docs/codebase-map.md`
- `specs/018-tracking-account.md` C.7.2, C.7.3, C.8, C.12, AC-36, AC-50, AC-54, AC-61
- `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`, `docs/design/system/components.dc.html`

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
