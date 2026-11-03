# TASK-437 — Copy fixes TASK-436 refused: `infoPages.company.notRegistered` still says the company is being registered in Estonia (false since ADR-0021, Wyoming LLC); `occasionHub.dateUnknown` carries an em dash; the admin payout period renders an en dash ("19–25 Oct 2026"). True, dash-free wording, recorded under the delegation

Row: `TASKS.md` → TASK-437. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-437`; keep it current by editing this file, not the row.

## Binding

- `infoPages.company.notRegistered` must be true: Flowers Overseas LLC is registered in Wyoming,
  USA (ADR-0021, founder 2026-10-23). Say that, and that the full details are published here before
  the first order. No person's name, no registry number, address or VAT id (plan/07 §6: never
  invent a fact). Rename the key if "notRegistered" no longer fits, updating every reader.
  `src/config/company.ts` stays `registered: false` until the founder supplies the facts.
- `occasionHub.dateUnknown`: same meaning, no em or en dash (founder 2026-10-05, no dash anywhere).
- Admin payout period (TASK-367, `src/modules/partners/payouts` / admin payout pages): render the
  range without an en dash (e.g. "19 to 25 Oct 2026" through the admin catalogue, still `Intl`).
- Write `.claude/state/record-approval-437.py` (pattern `record-approval-436.py`) for the en texts;
  the orchestrator reads and runs it. de/pl drafts updated as drafts.
- Founder rules 2026-11-04: no CI, no reviewer agents, typecheck and your own test files only.

## Read

- `docs/adr/ADR-0021-operating-entity-wyoming-llc.md`, `src/config/company.ts` (header)
- `src/modules/content/components/InfoPage.tsx`, `src/modules/catalog/ui/OccasionHubPage.tsx`,
  `src/modules/catalog/ui/ListingChrome.tsx`, `docs/tasks/TASK-367.md` (Result)

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
