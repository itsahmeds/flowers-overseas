# TASK-139 — Linux visual baselines: the visual suite has **84 `darwin` baselines and 3 `linux`**, because until TASK-137 the `visual` job had never run on a CI runner — so 81 specs have no Linux reference at all and the job cannot pass. Establish the `linux/` set (the run-35611605977 artifact already holds the screenshots they would be made from), keep `darwin` as the local-development set, and decide and document which platform is authoritative when they disagree. Three specs (`country-shop` desktop/mobile, `listing` desktop) are additionally red on `darwin` at `origin/main` after `707aeaa` changed the shop root's imagery.

Row: `TASKS.md` → TASK-139. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-139`; keep it current by editing this file, not the row.

## Binding

**The state, counted.** `tests/visual/__screenshots__/visual/darwin` holds **84** baselines;
`.../visual/linux` holds **3**. `pseudo-rtl` holds one each. Until TASK-137 landed, the `visual`
job had never executed on a CI runner in this project's history, so the Linux set was never
built. PR 90's `visual` job is red for that reason and no other: 42 specs have no Linux baseline,
3 mismatch the stale ones.

**What to produce.** The `linux/` baseline set, so `visual` can pass on CI and start protecting
against regressions. Run 35611605977's `visual` job published a 104 MB artifact containing the
screenshots those baselines would be made from; using it is legitimate and cheaper than
regenerating, but see the review rule below.

**Three decisions to make and write down, not to leave implicit:**

1. **Which platform is authoritative when the two disagree?** CI runs Linux and is the gate of
   record for anything timing-sensitive, so the honest answer is probably Linux, with `darwin`
   kept as the local-development convenience. Whatever you choose, say it in
   `docs/runbooks/` and make the test configuration express it.
2. **What happens when a UI change lands?** Today a developer on a Mac can only regenerate
   `darwin`, so the Linux set goes stale silently and the next PR pays for it. Give the project a
   documented way to refresh Linux baselines — a `workflow_dispatch` input, a label, a committed
   script — and say how a reviewer can tell a legitimately-updated baseline from an accidental
   one.
3. **The 0.1 % threshold.** Confirm it is still right across platforms, or propose a different
   one with the measured cross-platform delta beside it. Do not widen it silently to make red
   go green; an inflated threshold is a gate that has stopped working.

**The review rule, and it is the whole risk of this task.** A baseline is a *pinned picture of
what the product looks like*. Committing one you have not looked at pins whatever was on screen,
including a bug, and every future run then defends that bug. **Look at every image you commit.**
If an image shows something that seems wrong, stop and escalate rather than pinning it — that is
a finding for the task that owns the page, not a baseline to accept.

**Three specs are additionally red on `darwin` at `origin/main`**: `country-shop` desktop and
mobile, and `listing` desktop. Cause is known — `707aeaa` (TASK-080) changed `seed/data/media.json`
so the shop root renders real photographs, regenerated the nine `listing-*` baselines, and said in
its own commit message that it deliberately left the shop route's baselines alone because they
were under an in-review PR. TASK-112's PR 88 has since regenerated the two `country-shop-*` ones.
**Check whether PR 88 has merged before you touch those three**, and do not duplicate its work.

**Do not chase these; they are not yours.** Two `e2e` cases fail on macOS only, from the
case-insensitive filesystem, and pass on CI.

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
