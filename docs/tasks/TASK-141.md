# TASK-141 — Brief-shape gate: nothing validates a **committed** brief's headings, which is how two review rounds were lost. `scripts/tasks-brief.ts` exports `BRIEF_HEADINGS` in order, but `tests/unit/tasks-brief.test.ts` only checks briefs the generator writes into a fixture repo, and `scripts/tasks-open-decisions.ts` checks the 400-character cap and that the file exists. So a carry-forward appended **below `## Result`** — where nobody reads it — passes every gate; that is exactly how `/review 84`'s `commitlint` carry-in was missed and cost PR 90 a round. The check the reviewer named: a committed brief's H2 set equals `BRIEF_HEADINGS`, in that order.

Row: `TASKS.md` → TASK-141. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-141`; keep it current by editing this file, not the row.

## Binding

**The cost this has already had.** `/review 84` round 2 raised a `commitlint` defect. The finisher
appended it to `docs/tasks/TASK-137.md` **below `## Result`** instead of under
`## Carry-forwards`. Nobody read it there, the next round did not fix it, and `/review 90` failed
PR 90 on exactly that. One misplaced heading cost a full review round. It is the second
documentation-placement failure to do so.

**Why no gate caught it.** `scripts/tasks-brief.ts` already exports `BRIEF_HEADINGS` in order —
the knowledge exists. But `tests/unit/tasks-brief.test.ts` only checks briefs *the generator
writes* into a fixture repo, so it verifies the template and never a committed file; and
`scripts/tasks-open-decisions.ts` checks the 400-character notes cap and that the brief exists.
A brief can therefore carry any headings, in any order, with anything appended after
`## Result`, and pass every gate in the repository.

**The check, which `/review 90` round 2 named precisely:** a committed brief's H2 set equals
`BRIEF_HEADINGS`, in that order. Read `BRIEF_HEADINGS` from the generator rather than restating
it — two lists that must agree is the defect this task exists to prevent, and duplicating it here
would be a small instance of the same mistake.

**Judgement you must exercise, not skip.** Briefs legitimately grow. `docs/tasks/TASK-137.md`
currently carries a seventh, non-template `## Round 2 …` heading after `## Result` — narrative,
harmless, and nothing is stranded behind it. A gate that forbids all extra headings will be
fought and then disabled; a gate that permits anything is what we have now. Decide where the line
sits, implement it, and **write the reasoning into the brief** so the next person does not have
to re-derive it. A defensible answer is that the template's headings must all be present, in
order, and that nothing the *review process* writes — carry-forwards, escalations — may appear
after `## Result`.

**Apply it to every committed brief, and expect existing ones to fail.** Those failures are the
point: each is a place where something was written where it would not be read. Fix the placement,
never the check. If a brief's content genuinely does not fit the template, that is a finding to
report in `## Result`, not a reason to widen the gate.

**Scope discipline.** This is a dev-os gate. Do not reshape `tasks-brief.ts`'s template, do not
edit the substance of any brief while relocating its sections, and do not touch `TASKS.md` —
including its own row. A relocation must be provably content-preserving; say in `## Result` how
you established that.

**Prove the gate is not vacuous.** Per `CLAUDE.md`'s definition of done: move a section below
`## Result` in a scratch copy, watch the gate go red, and restore it. Say so in `## Result`. Four
defects of the vacuous-assertion class have shipped in this project, and a gate that cannot fail
would be a fifth — in the very check meant to stop the class.

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
