# TASK-333 — Spec 016 buyer templates (task 3, part b): B1 order received (hero, recap, "Your order terms" foot block, terms PDF), B2 being made, B3 on its way, B4 delivered with the photo first, B5 cancelled, B6 refund, B8 credit note, `firstNameOf`, the buyer label map, the shared refund-line formatter, the `RELAY_PATTERNS` scan over buyer keys and renders

Row: `TASKS.md` → TASK-333. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-333`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-332, design: B1 and B4 redraw (spec 016 §14 A-founder-2026-10-14b).
- Spec 016 §12 task 3, buyer half; §5.2 B rows, `firstNameOf`, label map, refund line, banned phrases; §7; §8 consumer law; §14 A-founder-2026-10-14 and 14b. AC-21 (buyer), AC-24, AC-25, AC-38, AC-40, AC-41, AC-42.
- B1 exact hero "Thank you, {firstName}." / "Your flowers arrive in {city} on {date}."; the legal items, `checkout.legal.cancellation` and `cancelHow` only after "Your order terms"; subject and preheader free of cancel, refund, 14-day, terms. B4: photo first, the two exact lines, links only tracking plus footer contacts, subject "Delivered in {city}. Here is your photo.". B5 exact sentences per actor. B6 not sent for row 32 on a `cancelled` order.
- The refund-line formatter is shared with spec 018's tracking page (TASK-339): whichever lands first puts it in `src/modules/orders/`, the other imports it.
- Copy headroom (spec 003 A17): keys under `email` may be added `reviewed: false`; report every new key's text in `## Result` for the founder's copy batch.
- **Design gate:** do not build B1 and B4 from the description; wait for the redrawn `email-buyer-*` boards (B2, B3, B5, B6, B8 may start on the merged boards).
- **ACs owned:** AC-21 (B1 to B6, B8), AC-24, AC-25, AC-38, AC-40, AC-41, AC-42 (T-21 for those templates, T-24, T-25, T-38, T-40, T-41, T-42).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** special characters: Zoë, "Dr. Anna Nowak", "  Anna  Kowalska ", "J Smith", Kraków, "Zażółć gęślą jaźń"; money: a zero-minor-unit refund is impossible, so test 1 minor unit, PLN and GBP partial and full refunds through `Intl` in `pl` and `en-gb`; a relay phrase planted in a temporary key (en, de, pl) turns the scan red; "our florist" passes; a `refunded_full` order never reads "cancelled"; subject lines with a marker name (none). Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2, §7, §8, §9 AC-21, AC-24, AC-25, AC-38, AC-40 to AC-42, §10 matching T, §14
- docs/design/wireframes/email-buyer-*.dc.html (and the redraw)
- `src/config/honesty.ts`; spec 041 §14 (relay definition); `docs/advice/2026-10-14-post-purchase-psychology.md`
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
