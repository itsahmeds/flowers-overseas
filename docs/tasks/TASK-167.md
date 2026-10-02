# TASK-167 — Photo intake, batch 2: the 144 photos of TASK-144 for 72 products (spec 006 §14 A7 clause 5), staged as `pending`, approved only on the founder's word

Row: `TASKS.md` → TASK-167. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-167`; keep it current by editing this file, not the row.

## Binding

- **What A7 clause 5 lists, all of it, in this one task:** `` `gpt-image` `` added as an exact
  token to `docs/compliance/imagery-generator-terms.md` answer 1; the 82 new ChatGPT prompt
  records with `generatorModel` `gpt-image`, re-hashed; the 144 new `seed/data/media.json` rows;
  the generator fields of the 31 Grok SKUs' prompt records, re-hashed; variants from
  `pnpm media:variants`; `.jpg`/`.jpeg` originals accepted wherever the CLI or the runbook
  assumes `.png`; `content/imagery/requirements-remaining.md` regenerated; the FO-BQ-004 pair the
  founder chooses; the sign-off case in `tests/unit/seed-media-manifest.test.ts` updated to the new
  count and the founder's sign-off instant(s) for this batch.
- **AC-31 / T-31 and AC-32 / T-32** (A7 clause 2, and the T-31/T-32 line under A7): generalise
  `tests/unit/imagery-prompts.test.ts` into the `generator → { termsFile, models[] }` map, with
  exact-token matching (matched delimiters) and every failing case A7 names, including the
  `gpt-image 2.0`-only and `xAI Grok Imagine`-only terms files, and the `FO-BQ-007` and
  `FO-FN-011` Grok fixtures. Each must be watched red.
- **Size and shape** (A7 clause 3): 2:3 originals take A6 (3)'s centre crop to 4:5 with
  `withoutEnlargement: false`; the 828 rung is an accepted enlargement for the 31 Grok heroes and
  the 12 Grok details at 784×1168. Restate the comment on rule 2 in `seed/schema/variants.ts` with
  that exception named.
- **The originals.** The zip is `~/Downloads/Flower Images -20260930T155221Z-1-001.zip` (148
  files: 86 PNG at 1122×1402, 43 JPEG at 784×1168, 19 JPEG at 912×1136). `fo-ar-005-hero(1)` and
  `fo-ar-006-hero(1)` are byte-identical copies: drop them. Stage the rest into the **main
  checkout's** git-ignored `/Users/ahmed/dev/flowers-overseas/.local/imagery/originals/`, where
  batch 1 lives, and read them from the worktree through a symlink (as TASK-138 did). Never
  commit an original. Read each file's generator from its C2PA manifest, never from its name.
- **No agent signs the founder's name.** Every new row lands `reviewState: "pending"`. A row
  becomes `approved` (`reviewedBy: "founder"`, `reviewedAt` the instant of the founder's message)
  only when the orchestrator records the founder's chat approval under `## Escalations` here, and
  only for the numbers approved. The founder reviews the batch on
  https://claude.ai/artifact/SMqQmEETfD9UjB7n1byDvP, where each photo's number is its `n` in
  `content/imagery/remaining-images.csv`, and chooses FO-BQ-004's pair there: **A** = the
  un-suffixed files, **B** = the `(1)` files, which match the brief (CSV rows 41–42).
- **Upload only what is approved.** Derive variants locally for every row, but upload to the
  public bucket (`pnpm media:upload`) only the variants of `approved` rows. If any gate or CI job
  needs an R2 object for a `pending` row, stop and report; do not upload it to make a gate pass.
- **Grok assets are demo imagery** (founder, 2026-10-03; A7 clause 5): no credit line, no PDF
  prints, and no gate, clause, test or reminder that ties them to go-live, selling or
  replacement.
- **Gates.** `pnpm seed:check`, `pnpm media:variants --check`, `pnpm catalogue:check`, the unit
  files touched, then `pnpm gates:cheap`. The 6 MB committed-media cap and `committed-slot` (spec
  006 §14 A8) must stay green: no variant of an R2 slot is committed. New visual baselines only
  where a page this task changes renders a photo it did not before; take the build slot only for
  that, and say so in `## Result`.

## Read

- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, then §14 A6, A7 and A8.
- `docs/codebase-map.md` — the `seed/` and `src/modules/ui/media/` rows.
- `docs/runbooks/imagery.md`, `seed/media-variants.ts`, `scripts/media-upload.ts`,
  `seed/schema/media.ts`, `tests/unit/imagery-prompts.test.ts`,
  `tests/unit/seed-media-manifest.test.ts`, `docs/compliance/imagery-generator-terms-grok.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 129` round 2 (2026-10-03), nits for the intake:** `.jpeg` as well as `.jpg`; a
  `sku: null` row; the T-31/T-32 index line; TASK-138 named as the dependency.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — the founder's approval of batch 2 and the FO-BQ-004 pair (founder, `open`).**
  Asked on the approval page above. Until answered, every row stays `pending` and nothing is
  uploaded.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
