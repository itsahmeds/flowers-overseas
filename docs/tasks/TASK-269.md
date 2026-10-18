# TASK-269 — Hub seed copy A7 and B2 (spec 004 AC-38's A7 and B2 cases): a hub-only closing sentence that spec 006 §7's one-`catalog.floristSentence` rule forbids today, and a restamp-only `i18n:draft` mode so `de`/`pl` drafts are not re-generated

Row: `TASKS.md` → TASK-269. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-269`; keep it current by editing this file, not the row.

## Binding

- From TASK-188's brief, Escalations (2026-10-18): B2 replaces the hub intros' closing sentence, but spec 006 §7 and `seed/copy.ts` decision 1 end every description with the one `catalog.floristSentence` (`seed:check`'s `floristSentence` rule). A7 and B2 also change `en` rows the `de`/`pl` drafts hash (`sourceHash`), and open item (v) keeps the `de`/`pl` hub intros byte-identical.
- Needs, in order: a spec 006 amendment (a hub-only sentence key and an entity-aware rule; a restamp-only draft mode) approved by the founder; then this row is re-planned for the build with AC-38's A7 and B2 cases.
- Copy headroom is zero; the new sentence is founder-approved copy before it ships.

## Read

- `docs/tasks/TASK-188.md` Escalations; `specs/004-*` §14 AC-38; `specs/006-*` §7; `seed/copy.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-18 (TASK-188 implementer, to the orchestrator; carried here 2026-10-19; `open`, for the founder and the spec writer). May a follow-up carry B2 and A7 with a spec 006 amendment for the closing sentence and a restamp-only draft mode?

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
