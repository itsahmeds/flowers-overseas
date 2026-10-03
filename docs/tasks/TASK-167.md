# TASK-167 — Photo intake, batch 2: 142 of the 144 photos of TASK-144 for 71 products (spec 006 §14 A7 clause 5), staged as `pending`; FO-BQ-004 and the founder's approval are TASK-168

Row: `TASKS.md` → TASK-167. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-167`; keep it current by editing this file, not the row.

## Binding

- **What A7 clause 5 lists, split across two tasks (orchestrator, 2026-10-03).** This task lands
  everything that needs no founder decision and **merges with every new row `pending`**. TASK-168
  does the rest once the founder answers: the approval data edit, the sign-off instant(s), the
  upload, and FO-BQ-004. This task: `` `gpt-image` `` added as an exact token to
  `docs/compliance/imagery-generator-terms.md` answer 1, citing the manifests measured on
  2026-09-30; the 80 new ChatGPT prompt
  records with `generatorModel` `gpt-image`, re-hashed (82 less FO-BQ-004's two, which are
  TASK-168's with the pair the founder chooses); the 142 new `seed/data/media.json` rows (every CSV row but FO-BQ-004's two);
  the generator fields of the 31 Grok SKUs' prompt records, re-hashed; variants from
  `pnpm media:variants`; `.jpg`/`.jpeg` originals accepted wherever the CLI or the runbook
  assumes `.png`; `content/imagery/requirements-remaining.md` regenerated; and the sign-off case in
  `tests/unit/seed-media-manifest.test.ts` split so it still asserts the 31 batch-1 assets approved
  by the founder at one of the two 2026-09-18 instants, and asserts every batch-2 row `pending`
  with no `reviewedBy`. TASK-168 adds the batch-2 sign-off instant(s).
- **AC-29, AC-31 / T-31 and AC-32 / T-32** (A7 clause 2 and its Tests line): AC-29 reads "each
  generator's commercial-use terms are filed". Generalise `tests/unit/imagery-prompts.test.ts` into
  the `generator → { termsFile, models[] }` map. Each of these goes red, watched: a row naming an
  unmapped generator; a row naming a model not listed for its generator; a mapped terms file that
  is deleted or unfiled; a terms file missing its generator or a model as an exact token; mismatched
  delimiters; a terms file naming only `gpt-image 2.0` (red for `gpt-image`); one naming only
  `xAI Grok Imagine` (red for `Grok Imagine`); a Grok fixture row on `FO-BQ-007` and one on
  `FO-FN-011`; and a parsed Assets-row SKU count that differs from the row's stated 31. The
  `to-be-confirmed` assertion stays.
- **Size and shape** (A7 clause 3): 2:3 originals take A6 (3)'s centre crop to 4:5 with
  `withoutEnlargement: false`; the 828 `productHero` rung is an accepted enlargement for the 31 Grok
  heroes only. The 12 Grok details at 784×1168 take the same centre crop, but `productDetail` ships
  only 384, so no detail is enlarged. Restate the comment on rule 2 in `seed/schema/variants.ts` with
  that exception named.
- **The originals.** The zip is `~/Downloads/Flower Images -20260930T155221Z-1-001.zip` (148
  files, 72 of them in a `Saboor/` subfolder: 86 PNG at 1122×1402, 43 JPEG at 784×1168, 19 JPEG
  at 912×1136). Staging flattens the subfolder. `fo-ar-005-hero(1)` and
  `fo-ar-006-hero(1)` are byte-identical copies: drop them. Stage neither FO-BQ-004 pair and give
  FO-BQ-004 no rows: TASK-168 stages the pair the founder chooses. Stage the rest into the **main
  checkout's** git-ignored `/Users/ahmed/dev/flowers-overseas/.local/imagery/originals/`, where
  batch 1 lives, and read them from the worktree through a symlink (as TASK-138 did). Never
  commit an original. Read each file's generator from its C2PA manifest, never from its name.
- **No agent signs the founder's name.** Every new row lands `reviewState: "pending"` and this
  task never sets `approved`. The founder reviews the batch on
  https://claude.ai/artifact/SMqQmEETfD9UjB7n1byDvP, where each photo's number is its `n` in
  `content/imagery/remaining-images.csv`, every photo is shown in the 4:5 centre-cropped frame the
  site uses (so the 8 % margin can be judged there), and FO-BQ-004's pair is offered as **A** (the
  un-suffixed files) or **B** (the `(1)` files, which match CSV rows 41–42).
- **Upload nothing.** `pnpm media:upload` with no `--only` uploads every manifest row
  (`scripts/media-upload.ts`), which would publish unapproved photos. This task derives variants
  locally and does not run `media:upload` at all; TASK-168 uploads the approved ids with `--only`.
  `pending` rows render the placeholder (`src/modules/ui/media/resolve.ts:131`), and no check reads
  the bucket for them.
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
- `content/imagery/remaining-images.csv`, `docs/compliance/imagery-generator-terms.md`,
  `docs/runbooks/imagery.md`, `seed/media-variants.ts`, `scripts/media-upload.ts`,
  `seed/schema/media.ts`, `tests/unit/imagery-prompts.test.ts`,
  `tests/unit/seed-media-manifest.test.ts`, `docs/compliance/imagery-generator-terms-grok.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 129` round 2 (2026-10-03), nits for the intake:** `.jpeg` as well as `.jpg`; a
  `sku: null` row; the T-31/T-32 index line; TASK-138 named as the dependency.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — the founder's approval of batch 2 and the FO-BQ-004 pair (founder, `open`).**
  Asked on the approval page above. It is TASK-168's input, not this task's: this task merges with
  every row `pending`.
- **From `/review 139` (2026-10-03), answered by the orchestrator:** the PR merges unapproved; the
  approval, sign-off instant(s), upload and FO-BQ-004 move to TASK-168.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-03: C2PA manifests of all 148 zip files read (86 PNG `ChatGPT`/`gpt-image`, 62 JPEG `Grok Imagine`, split exactly on the Grok record's 31 SKUs); 142 originals staged in the main checkout's `.local/imagery/originals/` (173 files), worktree reads them through `.local/imagery` → main's `.local/imagery`; T-31/T-32 generalised and each failing case watched red; `` `gpt-image` `` filed in answer 1. Next: prompt records.
- 2026-10-03: prompt records (80 ChatGPT → `gpt-image`, 62 Grok → `xAI Grok Imagine` / `Grok Imagine`, FO-BQ-004 untouched); 142 `media.json` rows `pending` with `promptHash` from `promptHash()` and `originalSha256` of the staged original; sign-off case split, each split case watched red by mutating `media.json`. Next: `pnpm media:variants`.
- 2026-10-03: `pnpm media:variants` once (3 min 46 s, load 1.6): 686 rows (118 batch-1 rows byte-identical + 568), nothing under `public/media/` changed, every file inside its slot cap; `--check` and `catalogue:check` green. Rule-2 comment restated; sheet regenerated (script keeps each record's generator fields and lists products with no *approved* row, so the CSV is unchanged); runbook names `.jpeg`. **`seed:check` red: 568 × `media/alt-missing`** (142 new product assets × 4 locales) — escalated, see `## Escalations`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
