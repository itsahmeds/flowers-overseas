# TASK-143 — Assertion-strength sweep over `main`: six defects of the "passes with its subject removed" class were found in one day (PRs 84, 87, 89 ×2, 93 ×2, 94 ×2), and **two are already merged** — `tests/unit/catalog-shop-page.test.tsx:173` and `tests/e2e/country-shop.spec.ts:111` carry the same weak LCP shape PR 89 round 3 fixed, comparing counts to a nomination's own length so a page nominating nothing passes. Sweep the committed suites for the shapes now catalogued in `CLAUDE.md`'s definition of done, fix what is real, and record what is deliberate. Each fix is proved by mutating the subject and watching the case go red.

Row: `TASKS.md` → TASK-143. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-143`; keep it current by editing this file, not the row.

## Binding

**Six in one day.** Every one was found by a reviewer *mutating* the subject, never by reading:

| Where | The shape |
|---|---|
| PR 84 | an AC "proved" in prose instead of the fixture flip its brief bound |
| PR 87 | `seo:validate` passed a document with breadcrumb positions `0, 7`, an unnamed `ListItem` and a nameless `Organization` |
| PR 89 | `expect([200, 404]).toContain(status)` where those are the only reachable statuses |
| PR 89 | LCP counts compared to a nomination's own length, so zero-vs-zero passes |
| PR 93 | a descriptor term deletable at two separate links with the whole suite green, **fail-open** |
| PR 94 | an uploader's size cap and watermark refusal both neutered with 4,357 cases green |

**Two are already merged** and are your starting point, not your scope:
`tests/unit/catalog-shop-page.test.tsx:173` and `tests/e2e/country-shop.spec.ts:111` carry the
same weak LCP shape PR 89 round 3 fixed. Read that fix first —
`tests/support/lcp-nomination.ts` on the TASK-110 branch — and reuse it rather than inventing a
second idiom.

**The catalogue of shapes to sweep for**, from `CLAUDE.md`'s definition of done:

- a `toContain` over a set that covers every reachable value
- a count compared against a collection derived from the same page (`x.length` on both sides)
- a universal over `… ?? []` or `match(…) ?? []`, which zero elements satisfy
- an optional field whose omission silently leaves a conjunction — **fail-open is the worst of these**
- a grep of source text standing in for behaviour, which catches deletion but not neutering
- `toBeDefined()` / `toBeGreaterThan(0)` on something that cannot be otherwise
- an assertion true for the wrong reason, because two states coincide in Phase 0

**The rule that makes this task safe, and it is not optional.** A weak assertion is a **finding**.
Do not widen a gate, loosen a threshold, or delete a case to turn red green. If a sweep turns up
something that is red for a real reason, that is a defect in the code, and it stops being this
task's business the moment you have identified whose it is — record it in `## Escalations` with
the owning task and move on.

**Prove every fix.** Mutate the subject, watch the case go red, restore, and say so. A
strengthened assertion that was never observed failing is the same defect wearing a new coat, and
would be the seventh instance — in the task written to stop the class.

**Judgement, not a regex.** `expect([301, 308])` was *inspected and kept*, and that is the line
for the whole codebase: the rule is not "never assert over a set", it is **"the assertion must be
able to fail"**. `[200, 404]` covered the entire outcome space of its request; `[301, 308]` is a
tolerance across two acceptable implementations that still excludes 200, 404, 302 and 307, with a
separate `Location` assertion carrying the substance. Expect to keep things. Record why.

**Scope discipline.** Tests and test helpers only. If a sweep would require a production change
to become falsifiable, that is an escalation, not a licence — say so and leave it.

**Report a count, not a vibe.** `## Result` says how many files were swept, how many shapes were
found, how many were fixed, how many were kept deliberately and why.

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
