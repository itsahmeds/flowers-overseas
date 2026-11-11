# TASK-352 — Spec 018 account details, preferences and saved recipients (row A): migration `NNNN_buyer_account` + down (the five `customer` columns, `saved_recipient`, `occasion_reminder`, RLS, three retention rows, flags `account.recipients` and `account.reminders`), `saveDetails`, the "Sign out on all devices" page, `saveRecipient`, `removeRecipient`, `buyerCheckoutProfile`, the saved-recipient sweep step, the DSAR runbook SQL, the LIA draft

Row: `TASKS.md` → TASK-352. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-352`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-344, TASK-337, PR 336 (design).
- Spec 018 §14 A-founder-2026-10-22 C.7.2, C.7.3, C.11, C.12, C.13 (details, recipients rows) and advisor memo "New row A". Owns AC-53, AC-54, AC-55, AC-61. The migration also creates `occasion_reminder` and the reminder columns, which TASK-353 uses.
- Saved recipients: unticked box, signed-in buyer only, never for place kinds `hospital`, `funeral_home`, `cemetery`; columns exactly C.11's (no card message, delivery note, place kind or email; `db:check`'s recipient-email rule extended to the table); at most 20 per customer; 730 days after `last_used_at`. The order's own `recipient` keeps the 90-day sweep with no exemption (AC-27 as amended).
- `buyerCheckoutProfile` is the only seam checkout reads; checkout touchpoints R1 to R4 (C.8) need a spec 010 amendment first and are not in this row.
- A preference never redirects or changes a URL; saving a currency sets `fo_currency` on that `no-store` response only.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Built from the merged artboards** of PR 336 (`account-details-*`, `account-recipients-*`, `account-order-detail-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** another customer's saved recipient id (RLS zero rows) and `app.role = 'public'`; the 21st save; a hospital-address order; the sweep at 729 and 731 days (injected clock); the DSAR SQL deleting by phone across two customers and nothing else; an invalid E.164 phone; admin and florist cookies on `buyerCheckoutProfile`; down file with rows present.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/018-tracking-account.md` §14 A-founder-2026-10-22 C.7.2, C.7.3, C.8, C.11 to C.13, C.16, AC-53 to AC-55, AC-61
- `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md`, `docs/runbooks/dsar.md`, `docs/tasks/TASK-344.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._
- 2026-11-08 (from TASK-344, PR 503): `customer.last_signed_in_at` shipped in migration `0036_buyer_sign_in`; `NNNN_buyer_account` adds only the other four `customer` columns of C.11, and its down file must not drop `last_signed_in_at`.
- 2026-11-11 (TASK-352, PR 540, left open by the implementer):
  - **Migration number.** The file is `0047_buyer_account` (orchestrator's number). Until 0045 and 0046 merge, `pnpm db:check` and the migration runner refuse the set (`version 0047 does not continue the sequence (expected 0045)`), so CI's db:check and integration jobs are red on this PR alone. If 0045/0046 never land, renumber to the next free version (file names, header comment, `tests/fixtures/schema-foreign-keys.ts`, and the `--to 0046` of the rollback test in `tests/integration/buyer-account.test.ts`). Locally the suites ran with two empty placeholder migrations 0045/0046 that were never committed.
  - **`buyer_account_inactive`** is seeded (730 days, pseudonymise) with no sweep handler: the sweep reports it `no_handler` until TASK-345 adds C.9's inactive-account step.
  - **Checkout seam.** `buyerCheckoutProfile(request)` and `takeSavedRecipientForCheckout(request, id)` live in `src/modules/customers/checkout-profile.ts` (imported by path, not through the barrel, so the barrel stays free of the sign-in surface). R1 to R4 are TASK-419's.
  - **Cookie register.** The details page now writes `fo_currency` from the server (on the `no-store` save response only); `src/config/cookies.ts` still says `writer: "browser"`. The register and RoPA rows for the account, saved recipients and preferences are TASK-346's (C.16).
  - **LIA.** `docs/compliance/lia-saved-recipients.md` is a draft; `account.recipients` stays off in production until the founder signs it (TASK-346 checks it).
  - **Browser gates.** No Playwright, axe or visual baseline for the two new pages in this PR: axe and keyboard on the account pages are TASK-346's (AC-33); T-53's two-browser sign-out is proven at the session layer in the integration suite.
  - **Copy.** 24 new `en` texts under `account.*` wait for `.claude/state/record-approval-352.py` (passes `--check`); de and pl are machine drafts (the English text). The remove dialog's sentence is gender-neutral ("We delete these details."), where the board drew "her". Two admin texts (`admin.flags.description.account.recipients`, `.reminders`) ship unreviewed by rule.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11: migration 0047 + down, mirror, RLS classes, flags, sweep step, module (`buyer-account.ts`, `checkout-profile.ts`), details and recipients pages, save box on the order detail, keys; draft PR 540.
- 2026-11-11: integration suite (19 tests) and unit tests green on scratch PG16; DSAR runbook SQL, LIA draft; rebased on main 57068da04; clean-env build green in the slot; ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 540: migration `0047_buyer_account` with a guarded rollback (`BUYER_ACCOUNT_DATA_EXISTS`); the four
`customer` columns, `saved_recipient` (C.11's columns only, 20 per customer by a serialised constraint
trigger), `occasion_reminder` (calendar and lead checks, 50 per customer), customer-scoped RLS, three
retention rows, two flags off; the buyer update guard now also pins the reminder columns and
`last_signed_in_at`. `/{locale}/account/details` (save, refusals, `fo_currency` on the save response,
"Sign out on all devices") and `/{locale}/account/recipients` (list, Remove with a native dialog), the
save box on the order detail, `buyerCheckoutProfile`, the `saved_recipient` sweep step, the DSAR
runbook's recipient SQL, the LIA draft. Tests: integration 19 (`buyer-account.test.ts`), unit 6
(`account-details-form.test.ts`) plus the extended `db-check-recipient-email` (7 more cases),
`feature-flags` and the pinned review queue. The clean-env `next build` ran in the build slot because
the work order requires it before ready (exit 0). Carry-forwards above.
