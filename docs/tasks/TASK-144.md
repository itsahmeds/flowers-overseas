# TASK-144 — Prompt records for the remaining **72 products (144 assets)**, so the founder can generate every photograph the catalogue needs and no card ships a placeholder. `scripts/imagery-prompts-remaining.ts` derives each prompt from the product's own facets in `seed/data/products.json` — never from a description and never from memory, per `content/imagery/style-guide.md` §6 — with the wrap and greenery mappings **read off the twelve records the founder already approved** rather than invented. Mother's Day products are ordered first, because `/{locale}/{country}/occasions/mothers-day` is the only occasion page the catalogue has and renders **no photograph at all** (spec 008 §14 A11). Ships the generation sheet `content/imagery/requirements-remaining.md`.

Row: `TASKS.md` → TASK-144. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-144`; keep it current by editing this file, not the row.

## Binding

**What this task is, and what it is not.** It produces the **prompt records and the generation
sheet** for the 72 products that have no imagery — 144 assets. **It does not generate the images.**
That is the founder's, and the sheet exists so it is paste-and-go rather than authorship.

**The rule that shaped it.** `content/imagery/style-guide.md` §6 says the bracketed parts of a
prompt are substituted from the product's own facets **"never from a description, and never from
memory"**. Seventy-two hand-written prompts cannot keep that promise; a generator can, and is
auditable. `scripts/imagery-prompts-remaining.ts` derives every clause from a named field in
`seed/data/products.json`, and its two judgement tables were **read off the twelve records the
founder has already approved**, not chosen:

- **Wrap** — every `premium`/`luxury` *bouquet* ships white paper (FO-BQ-002, 015, 019) and every
  `essential`/`classic` one kraft (FO-BQ-001, 009, 023, 028). FO-GS-001 is `premium` and kraft, so
  the rule is keyed on bouquets alone.
- **Greenery** — per flower, from the approved set; a flower with no entry takes no greenery clause
  rather than an invented one.

**Where the data does not support a word, the prompt does not say it.** `mixed` and `seasonal` are
palette words, not species, so a plant carrying one is "flowering plant" and not a guessed
species — naming a flower the catalogue does not claim is exactly the "from memory" failure the
style guide forbids.

**Ordering is deliberate.** Mother's Day products come first because
`/{locale}/{country}/occasions/mothers-day` is the only occasion page the catalogue has and it
renders **no photograph at all** — spec 008 §14 A11 rules that honest, but it is also the page a
buyer is most likely to land on from search.

**Seeds come from the repository's own `promptSeed()`** in `seed/schema/prompts.ts`. The first
draft of the generator carried a second implementation; that is two sources for one number, and
`tests/unit/imagery-prompts.test.ts` caught the disagreement immediately.

**The test change, and why it is a strengthening rather than an accommodation.**
`imagery-prompts.test.ts` asserted `skuFiles).toHaveLength(12)`. Twelve was correct while only the
demo dozen had records, but a literal count has to be edited every time the catalogue moves —
a test that tracks the answer instead of checking it. It now derives the expected set from the
active products in `seed/data/products.json`, so **adding a product without a prompt record
fails**, which is the fact worth knowing. Proved non-vacuous per `CLAUDE.md` definition-of-done
item 4: removing `FO-BQ-007.json` turns it red (1 failed / 36 passed), restoring it turns it green
(37 passed).

**What remains the founder's, and must not be faked:**
- The 144 generations, reviewed against the checklist in the sheet.
- **The rejection tally.** ADR-0014 asks for the reject rate as a risk measure and the first run
  recorded none, so that measure is *unmeasured*, not zero. The sheet asks for a count per product.
- Approval is a data edit — `reviewState`, `reviewedBy`, `reviewedAt` in `seed/data/media.json`.
  **No agent may sign the founder's name**; TASK-112 caught a previous run doing exactly that.

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
