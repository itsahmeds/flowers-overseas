# TASK-370 — Spec 022a the review invitation: the `reviews` outbox target on `order.photo_uploaded` (`live`), `review_invite` rows, the `review.request` job, B9 `review-invite` through spec 016's pipeline in en, de and pl, the deterministic HMAC token, the Trustpilot BCC and snippet (`Mailer` `bcc` from env only), the florist-template scan

Row: `TASKS.md` → TASK-370. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-370`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-368, TASK-331, TASK-332, TASK-215, PR 338 (design).
- Spec 022a §2 (invitation), §5.2 (B9, jobs), §8 (verified by construction, no selective invitation, no incentives), §12 order (3) and the requests on specs 012 (`bcc`) and 016 (B9 row in `notificationsFor`). Owns AC-6 to AC-11.
- B9 copy is proposed, `reviewed: false` (`email.reviewInvite.*`); no recipient name, upsell, incentive, refund, problem or failure wording, no em dash. `reviews.invite` and `reviews.trustpilot` stay off until the founder's copy, policy and Trustpilot DPA.
- **Built from the merged artboards** of PR 338 (`email-buyer-*` B9); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the outbox row handled twice; `test` and `demo` photos; flag off until `expires_at`; two renders of one send byte-equal; every post-photo status and refund kind (invite still sent); opted-out, redacted, expired; the flag and env matrix for the BCC; planted "discount" or "sorry" turning the scan red; "rate us" planted in a florist template.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/022a-order-close-reviews.md` §2, §5.2, §7, §8, AC-6 to AC-11
- `docs/tasks/TASK-331.md`, `TASK-332.md`, `src/config/honesty.ts`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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
