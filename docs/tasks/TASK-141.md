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

## Progress

- 2026-10-05: row `in_progress`, draft PR 192 opened.
- 2026-10-05: tests written red (11 unit cases, 2 CLI cases), then `briefShapeProblems` /
  `checkBriefShapes` in `scripts/tasks-brief.ts` and the call in `pnpm tasks:check`. On main the
  gate failed five briefs (TASK-112, 135, 136, 137, 192).
- 2026-10-05: the five briefs reshaped (placement only, verified line by line), gates green, PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/192. `pnpm tasks:check` now also
checks every committed `docs/tasks/TASK-*.md` (192 on main) and exits 1 on any brief out of shape,
naming the file. The heading list is read from `BRIEF_HEADINGS` in `scripts/tasks-brief.ts`; it is
not restated anywhere. `tasks-open-decisions.ts` loads `tasks-brief.ts` with a dynamic import,
because `tasks-brief.ts` already imports it and a static import back would read
`TASK_NOTES_LIMIT` before it is set.

**Where the line sits, and why.** A brief passes when (1) each `BRIEF_HEADINGS` heading appears
exactly once, (2) they appear in `BRIEF_HEADINGS` order, compared as a sequence, and (3) no
heading of any kind comes after `## Result`. Any other heading **above** `## Result` is allowed
(`## Progress`, `## Done when`, `## Class`, `## Files`, a narrative round), because briefs
legitimately grow and a gate that forbids that would be fought and switched off. The rule is
"nothing below Result" and not "nothing the review process writes below Result", because
heading text cannot tell review output from narrative: TASK-137's stranded section was titled
"Round 2", and it was the answer to a review. A reader who reaches the result stops there; that
is the whole defect. A template heading written twice also fails: `sectionOf` and a reader
both stop at the first one, so the second is never read. Headings inside fenced code are ignored.
The same reasoning is in the doc comment on `briefShapeProblems`.

**Briefs reshaped (on main):**
- TASK-112: `## Carry-forwards` moved from below `## Result` to above it; empty `## Escalations` added.
- TASK-135: everything sat under `## Binding`. `## Result` inserted before its `**PR:**` line; empty
  `## Read`, `## Carry-forwards`, `## Escalations` added between them.
- TASK-136: empty `## Read` added.
- TASK-137: `## Round 2 (finisher, 2026-09-21) …` moved from below `## Result` to just above it.
- TASK-192: `## Escalations` moved from below `## Result` to above `## Progress`; empty
  `## Carry-forwards` added.

"Empty" means the heading plus `_None recorded._` (`EMPTY_SECTION`), except TASK-192's
`## Escalations`, which was already empty and moved as is. **How content was proved unchanged:**
for each file, the non-blank lines were counted against `origin/main`. No line was lost; the only
lines added are the new headings and `_None recorded._`. For 112, 136, 137 and 192 every original
section (heading to next heading) appears verbatim in the new file. For 135, removing the one
inserted block gives back main's file byte for byte. None of the five has content that does not
fit the template. PR 191's new briefs (TASK-200 to 223) were run through the check from its
head and all pass. It needs nothing after rebasing, except taking these five files from main.

**Tests (unit layer).** `tests/unit/tasks-brief.test.ts` +12: template order passes; extra
heading above Result passes; a section below Result fails; a template section moved below Result
fails (order + below); missing heading fails; same set in the wrong order fails; duplicate fails;
fenced `## ` ignored; `tasks:migrate` output and `renderBrief` pass; `tasks:brief` scaffold
(with its `## Progress`) passes; `checkBriefShapes` names only the failing file; every committed
brief passes. `tests/unit/tasks-open-decisions.test.ts` +1, and one case extended: the CLI over a
copy of the repo exits 0, then exits 1 naming `docs/tasks/TASK-086.md` once its carry-forwards are
moved below Result. Every case asserts the exact problem list.

**Proof that the gate can fail.** (a) In this worktree, TASK-137's `## Round 2` was moved back
below `## Result`: `node scripts/tasks-open-decisions.ts` exited 1 naming it; the file was
restored and `cmp` showed it identical; exit 0 again. (b) Mutants in `briefShapeProblems`, each
restored after (`cmp`): order compared as a sorted set → "wrong order" and "moved below Result"
cases red (2 failed); below-Result loop emptied → 4 red; missing check disabled → 1 red.

**Gates.** No expensive gate run locally: the diff renders nothing.

```
gates:cheap · a6326667daea3077f53c265a26c39dfc9447697f · tree clean · base origin/main · 2026-10-04T21:56:37.827Z
typecheck             exit 0 · 2.8 s
lint                  exit 0 · 19.7 s
format:check          exit 0 · 13.2 s
i18n:check            exit 0 · 0.5 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.3 s
tests                 exit 0 · 29.5 s · changed 5 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

**Deviation from the brief.** The brief says not to touch `TASKS.md`, including this row. The work
order put the row in scope for its status and PR cells, so only those two cells changed.
