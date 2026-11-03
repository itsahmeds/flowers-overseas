# TASK-360 — Spec 020a resend an email: `RESEND_RULES`, `resendableDeliveries`, `resendNotification`, the `notifications.resend` job, `resend_of`, the 3-in-24-hours limit, request 2 on spec 016's pipeline (a delivery row created outside the outbox, rendered from its original's context)

Row: `TASKS.md` → TASK-360. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-360`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-331, TASK-333.
- Spec 020a §2.5, §5.2 (resend table, `resendNotification`), §12 task 4 and request 2. Owns AC-24 to AC-26.
- A resend renders at send time in the audience's locale to the address resolved at send time; florist templates carry a freshly minted one-tap link; `idempotencyKey = admin:{actionId}:{template_key}:{recipient_ref}`; `test` orders get no buyer resend; with `notifications.email` off the row stays `queued`.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each template row of §5.2 with its condition true and false; the fourth resend in 24 hours; a buyer resend on `test`; `notifications.email` off; no `@` in the list's HTML; the florist link token differing from the original's.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.5, §5.2, AC-24 to AC-26
- `specs/016-routing-notifications.md` §5.2 (pipeline); `docs/tasks/TASK-331.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the implementer's self-review (2026-11-04, PR 483), handed on:**
  - **TASK-361 (the panel):** draws the emails list from `orderEmails(orderId, viewer)` (`src/modules/admin/order-actions/resend.ts`, import by path) and posts `resendEmailAction` (`deliveryId`, `actionId`, `expectedSeq`) in `src/app/admin/(signed-in)/orders/[id]/actions.ts`. Each row carries `templateKey`, `code` (B1 … V5, A1, W), `audience`, `partnerName` (florist rows, the "To" column), `status`, `held`, `createdAt`, `statusAt`, `resendOf` ("…, resent") and `resend` = allowed or one cause of `RESEND_CAUSES` plus `permission`; one admin key per cause (the artboard's reason lines: "Answered: not resent.", "Timed out: not resent.", "Reminders are not resent.", "Your own alerts are not resent.", "Resent 3 times in 24 hours.", "Held: email sending is off.", "Test order: buyer emails are not sent.", "Queued.", and one per condition). AC-24's "no `@` in the list's HTML" is asserted here on the list data; the HTML half is TASK-361's render test.
  - **Decision taken, spec owner to confirm (spec 020a §5.2 "once sent"):** a row still `queued` offers no Resend for any template (the artboard draws "Queued." and "Held: …" on such rows); `sent`, `delivered`, `delivery_delayed`, `bounced`, `complained` and `failed` count as sent, so a bounced or complained email may be resent (the address is read again at send time; Resend's own suppression list still guards a complainer).
  - **Not built (no spec line asks for it):** a sweep that re-enqueues a resend row whose `notifications.resend` enqueue failed after the commit (logged `alert=notifications.resend_enqueue_failed`; the admin resends the original again), and a resend row held longer than the job's 7 retries stays `queued` (the admin resends again once `notifications.email` is on). The job does not re-check the resend table at send time (a V1 resent seconds before its offer expires still goes).
  - **Request 2's B8 clause** holds without change: TASK-334's `invoice.email` reads the B1 row by `source_key = purchase:{id}`, which a resend (`admin:{actionId}`) never has.
  - **`runOrderAction`** now stamps `admin_order_action.created_at` with `clock_timestamp()` after the lock (TASK-357's history ordering carry-forward): two overlapping resends list in lock order. TASK-357's tie-break test now writes its tied rows directly.
  - **Not run (founder, 2026-11-04):** CI, `gates:cheap`, lint, build, Playwright, Lighthouse.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: needs the `notification_delivery` table and spec 016's pipeline (TASK-327, TASK-331, TASK-333); none exists on any branch. Not started. Answered 2026-11-04 (builder R360, from main 685f9c3ba): TASK-331 (PR 450), TASK-333 (PR 472) and TASK-357 (PRs 398, 448, 478) are merged; `resend_of` is in migration 0031.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04, builder R360: worktree `/Users/ahmed/dev/fo-wt-360` on `task/TASK-360-admin-resend` from main 685f9c3ba; row `in_progress`; draft PR. Next: `RESEND_RULES`, `resendableDeliveries`, `resendNotification`, the `notifications.resend` job, `adminResendNotification`, tests.
- 2026-11-04, builder R360: built on main 0e9e2ba7c (rebased after TASK-334), no migration. `RESEND_RULES`, `resendDecision`, `resendableDeliveries`, `resendNotification`, `runResendNotificationJob` (`src/modules/notifications/resend.ts`, in the barrel); `notifications.resend` registered and handled; `adminResendNotification` and `orderEmails` (`src/modules/admin/order-actions/resend.ts`); `resendEmailAction` on the page; `clock_timestamp()` in `runOrderAction`. Tests: unit 22 new + pins; integration 19 new (PG16) + roles matrix with resend. 22 mutations, each red. PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#483](https://github.com/itsahmeds/flowers-overseas/pull/483): spec 020a AC-24 to AC-26. The resend table as data (`RESEND_RULES`, ten templates; V2, V5, A1, W and spec 030a's emails never), `resendDecision` with 19 causes, `resendableDeliveries` (the order's rows and its purchase's B1, oldest first, no address), `resendNotification` (under `runOrderAction`'s lock: refuses a forged, stale or test-order buyer resend with `RESEND_NOT_ALLOWED` and a fourth in 24 hours with `RESEND_RATE_LIMITED`, writing nothing; else one `queued` row `admin:{actionId}` with `resend_of`), the `notifications.resend` job (held while `notifications.email` is off; the original's context rebuilt from its first row's outbox event, purchase or job; address, locale and a fresh one-tap link at send time; `sendOne` with `admin:{actionId}:{template}:{recipient}`), `adminResendNotification` (`orders.resend`, admin and ops) with the enqueue after commit, `orderEmails` for the page, the `resendEmailAction` server action, `clock_timestamp()` for action rows. No migration (`resend_of` is 0031's), no UI (TASK-361). Tests: unit `notifications-resend-rules` (22) plus pins in `jobs-registry`, `jobs-runtime`, `admin-order-action-guard-scan`; integration `admin-order-resend` (19, new) and `admin-order-action-roles` (resend in T-02 and T-03; the tie case rewritten). Handed on: see Carry-forwards.
