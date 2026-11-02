# TASK-332 — Spec 016 email layout and the florist and ops templates (task 3, part a): React Email layout (`lang`, `dir`, logical spacing, trader footer), V1 offer, V2 reminder, V3 confirmed, V4 withdrawn, V5 photo reminder, A1 no-partner alert, the W WhatsApp copies (V1 and V4 only), plain-text parts, visual snapshots, `docs/runbooks/whatsapp-phase1.md`

Row: `TASKS.md` → TASK-332. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-332`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-331.
- Spec 016 §12 task 3, the non-buyer half; §5.2 table rows V1 to V5, A1, W; §5.3; §7. AC-21 (these templates), AC-22.
- No recipient name, street, phone or card message in any V or W template or subject; no sign-in token in a W copy (it carries the inbox address only). Payout in the florist's currency via `Intl`; answer-by and window times in the destination zone.
- `emails.ops.*` lives in `messages/admin/en.json` (English only). Florist emails are in `RELAY_EXEMPT`; do not scan them.
- Pixel-match `docs/design/wireframes/email-layout-*.dc.html`, `email-florist-*.dc.html`, `email-founder-*.dc.html`.
- **ACs owned:** AC-21 (layout, V1 to V5, A1, W), AC-22 (T-21 for those templates, T-22).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- Presentation and records: no breaker class, but still mutate each AC's subject once before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 template table, §5.3, §7, §9 AC-21, AC-22, §10 T-21, T-22
- docs/design/wireframes/email-layout-*, email-florist-*, email-founder-*
- `src/modules/notifications/`, TASK-331's template registry
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-02 (self-review, PR 454): **visual snapshots are markup snapshots.** T-21's "snapshot per locale" is a pinned HTML file per (template, language) under `tests/unit/__snapshots__/emails/` (18 files). Pixel baselines (a Playwright spec that loads those files at 600 and 375 px) need the build slot or the `visual-baselines` workflow; not taken (battery rule, NO CI WAIT). Owner: whoever next holds the slot for spec 016, or TASK-336.
- 2026-11-02: **logo is the inline SVG mark plus the text wordmark.** Gmail drops inline SVG; the artboard's proposed 2x PNG lockup is not committed anywhere, and no stable web-font URL exists (fonts are `next/font` hashed files), so the email uses the font stacks' fallbacks (Georgia, system sans). Both need an asset under `public/` first.
- 2026-11-02: **V1 has no delivery-window line**: the artboard draws it as a slot ("no data yet, as B3"); `order.delivery_window` is free text with no vocabulary.
- 2026-11-02: **A1's "automatic routing off" band is not built**: the artboard's "Nothing cancels automatically" contradicts AC-11 (the expiry is scheduled at `graceEnd` with `routing.auto` off too), so A1 always prints the `graceEnd` band. If the founder wants the artboard's state, AC-11 changes first.
- 2026-11-02: **dates and money are `Intl`'s, not the artboard's drawing**: `en` prints "Thu, 8 Oct" and "149.00 PLN", `de` "149,00 PLN", `pl` "149,00 zł", the same formatters as the florist inbox.
- 2026-11-02: **RoPA has no spec 016 Resend rows** (florist order email, ops alerts, W copies; spec 016 §8). Not in this task's brief; the pipeline (TASK-331) or TASK-333 owns the data-flow row.
- 2026-11-02: **main is red on two i18n tests not touched by this diff**: `i18n-messages-schema` (TASK-215's `floristInbox.declineReason.*` etc. missing from `AWAITING_FOUNDER_REVIEW`) and `i18n-review` (`en` unreviewed share 6.3 % > 5 %, the same keys). Owner: TASK-215's follow-up.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02: layout (`src/modules/notifications/emails/`, escaped strings, not React: `react-dom/server` throws under the `react-server` condition the job tick route runs in), V1 to V5 with facts loader and registration, A1 and W in `src/modules/admin/emails/` (admin catalogue), keys en/pl/de + admin, `email-florist.test.ts` green. Next: ops tests, theme test, relay exemption, review scope, integration test, runbook.
- 2026-11-02: A1 and W moved into `src/modules/notifications/emails/ops.ts` with their copy and the admin order path handed in by the worker (check 11 refuses email copy reachable from a page; the admin catalogue keeps one reader). Unit, theme and T-22 integration tests green; rebased on `b86e69a08` (TASK-213, TASK-215) as one commit; PR 454 ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 454. The email layout (three frames, `lang`/`dir` from the locale config, logical spacing, the buyer frame's trader footer gated on `isCompanyRegistered()`), V1 to V5 (V4 withdrawn and timed out), A1 and the W copies (offer and stop only), all with plain-text parts, as escaped HTML strings in `src/modules/notifications/emails/` (not React: `react-dom/server` throws under the `react-server` condition the job tick route runs in, the sign-in emails' reason), registered in the worker (`src/jobs/handlers.ts`). 34 keys in en, pl, de (`emails.layout.*`, `emails.florist.*`, `whatsapp.florist.*`, `reviewed: false`) and 43 English keys under `emails.ops.*` in the admin catalogue. Tests: unit `email-florist` (29), `email-ops` (10), `email-theme` (19); integration `email-templates` (4, run on a throwaway PG16); pinned-list updates in `relay-language`, `admin-scans`, `i18n-messages`, `i18n-messages-schema`, `i18n-review-scope`. Runbook `docs/runbooks/whatsapp-phase1.md`. No build slot used for a build: pixel visual baselines are a carry-forward.
