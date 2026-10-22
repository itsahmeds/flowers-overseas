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
