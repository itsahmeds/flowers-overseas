# TASK-142 — Live corridor corpus for the first go-live country: `content/corridors/en/pl-live.md` (and its `en-gb` override) — the copy a corridor page shows once Poland has a confirmed florist, as distinct from the `-guide` state TASK-088 authored. **Nobody owns this today**: TASK-088 is `done` and authored the guide corpus only, TASK-124 lands PL's `operations` block but no content, and `corridor:check`'s `live-operations` rule refuses a live file until that block exists — so the two must land together or the gate fails. Until both exist, `corridorState("PL","en")` stays `guide` and TASK-114's AC-15 tripwire cannot fire.

Row: `TASKS.md` → TASK-142. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-142`; keep it current by editing this file, not the row.

## Binding

**Why this row exists.** `/review 93` round 3 asked an agent to place a carry-forward on whichever
task lands the two files a go-live tripwire depends on. It found that only one has an owner, and
**it declined to invent a task row** — which is the correct behaviour and is why this row is
written by the orchestrator instead.

- PL's `operations` block in `src/config/countries.ts` belongs to **TASK-124** (spec 009 §12
  step 4 / §13 Q3), which now carries the dated instruction.
- `content/corridors/en/pl-live.md` belongs to **nobody**. TASK-088 is `done` and authored the
  guide corpus explicitly excluding `de`/`pl` and the live state; no other row names it.

**The two must land together.** `corridor:check`'s `live-operations` rule refuses a live content
file until the `operations` block exists, so a lone `pl-live.md` fails the gate and a lone
`operations` block leaves the corridor with nothing to render in its live state. Until both
exist, `corridorState("PL", "en")` stays `guide`, and TASK-114's AC-15 tripwire
(`expect(corridorState("PL","en")).toBe("guide")`) stays green — which is exactly what it is for:
it goes red the day this task lands, and tells whoever is doing go-live that AC-15's assertion can
finally move onto the shop root where the criterion actually bites.

**What the content is.** The `-live` state is what a corridor page says once Poland has a
confirmed florist, as against the `-guide` state it shows today. Read `docs/tasks/TASK-088.md`
and the shipped guide corpus first: the live copy must be **≥70 % token-distinct** from its guide
twin, carry 8–12 FAQ entries, and keep `relatedIso2` reciprocal across the set, exactly as the
guide corpus does. An `en-gb` override is required on the same terms as the seven TASK-088 wrote.

**This is founder-gated and honesty-gated, and that is not a formality.** The live state says a
florist exists. Do not write it, and do not merge it, before one actually does — the whole
product is a trust promise, and a corridor page claiming a confirmed florist we have not confirmed
is the single most damaging untruth this site could tell. If you reach this task and no Polish
florist is confirmed, stop and say so.

**Phase 1.** Nothing a Phase 0 visitor sees depends on this. It is recorded now so that the
ownership gap is not rediscovered on go-live day, which is the worst possible time to find it.

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
