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

**Merged as PR 142 (`f057d09b`) on 2026-10-03; every new row `pending`, nothing uploaded.**

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
- **From `/review 142` and `/break 142` round 1 (2026-10-03, head `dfe307ac`):** review required
  1 / break HOLE 5 — `pnpm media:upload` and `--verify` act only on variants of `approved` assets
  (`publishableRows()` in `scripts/media-upload.ts`), with the skipped count in the summary, and
  the runbook rows 9–10, L144 and the sheet name `--only <ids>` for a batch; review required 2 /
  HOLE 1 — `media/alt-empty` refused on a `pending` and on an `approved` product asset; HOLE 2 — an
  approved `brand` asset with no alt passes `alt-missing` beside a product asset that fails;
  HOLE 3 — a `rejected` product asset with no alt passes; HOLE 4 — an Assets-row SKU written
  without backticks is not counted. Nits logged, not done: `existingGenerators()` parsing through
  `ImageryPromptFileSchema` and catching only `ENOENT`; the spec index still points T-31/T-32 at
  the A7 heading (a `specs:index` fix).
- **From `/break 142` round 2 (2026-10-03, head `680ac756`; `/review 142` round 2 PASS on the
  same head):** the upload filter's edges, tests only in `tests/unit/media-upload.test.ts`. HOLE 5
  remainder: a `rejected` asset is never PUT and never verified. HOLE 6: `--force` never widens the
  set. HOLE 7: `runVerify()` rejects on a missing approved object and on a byte-count disagreement
  (and `main()`'s catch exits 1). HOLE 8: `--verify --only` HEADs only the named approved objects.
  HOLE 9: the whole `runVerify()` success line is pinned, and the skipped count is taken over the
  `--only` selection, for upload and verify.
- **From `/review 142` round 2 (2026-10-03), HOLE 10 ACCEPTABLE (copied by the orchestrator after
  merge):** the explanatory end of the upload summary line ("only an approved asset is published")
  is not asserted; the counts, the skipped count and the published set are. Nit for the next task
  that touches `tests/unit/media-upload.test.ts`: assert the whole upload line once.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — the founder's approval of batch 2 and the FO-BQ-004 pair (founder, `open`).**
  Asked on the approval page above. It is TASK-168's input, not this task's: this task merges with
  every row `pending`.
- **From `/review 139` (2026-10-03), answered by the orchestrator:** the PR merges unapproved; the
  approval, sign-off instant(s), upload and FO-BQ-004 move to TASK-168.
- **2026-10-03 — alt text for `pending` rows (orchestrator; raised by the implementer). Answered 2026-10-03: option (A), recorded as spec 006 §14 A9 (`dc204224` after the orchestrator's rebase; was `580387c4`); the fence widened to `seed/check.ts` (that one condition), `tests/unit/seed-check.test.ts` and `tests/unit/ui-media-manifest.test.ts`; the two out-of-fence changes (`scripts/imagery-prompts-remaining.ts`, `seed/snapshot/*`) accepted.**
  `pnpm seed:check` family 7 (`media/alt-missing`, `seed/check.ts` ~L1708) requires alt text in
  all four launch locales for **every** `depicts: "product"` asset, whatever its `reviewState`.
  The 142 pending rows therefore raise 568 problems (142 × 4 locales, nothing else), and the same
  rule turns 29 cases of `tests/unit/seed-check.test.ts` red (every case built on the committed
  tree) plus 2 of `tests/unit/ui-media-manifest.test.ts` (it asserts one alt row per asset and that
  *every* asset, not only approved ones, is displayable). Spec 006 is split: §2.3 rule 7 reads "a
  **rendered** asset lacking alt text in a launch locale"; §6 reads "four locales × every committed
  asset … the gate refuses a missing or empty alt for a product image". None of `seed/check.ts`,
  `seed/data/alt/*` or `ui-media-manifest.test.ts` is in this task's fence. **(A)** the alt rule
  covers approved product assets only — rule 7's "rendered", and AC-18 renders only approved ones:
  one condition in `seed/check.ts`, a `seed:check` case pair (a pending product asset with no alt
  passes; an approved one fails), each watched red, and `ui-media-manifest.test.ts` scoped to
  approved assets. TASK-168 then writes four-locale alt for each asset the founder approves, and
  the gate bites at that moment. **(B)** author the 568 alt strings now in
  `seed/data/alt/{en,en-gb,de,pl}.json`, each describing its own photograph (flower and colour,
  never the product name), `de`/`pl` included — copy for photographs the founder may still reject.
  Recommendation: **A**. Everything else in Binding is done and pushed; the PR stays draft.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-03: C2PA manifests of all 148 zip files read (86 PNG `ChatGPT`/`gpt-image`, 62 JPEG `Grok Imagine`, split exactly on the Grok record's 31 SKUs); 142 originals staged in the main checkout's `.local/imagery/originals/` (173 files), worktree reads them through `.local/imagery` → main's `.local/imagery`; T-31/T-32 generalised and each failing case watched red; `` `gpt-image` `` filed in answer 1. Next: prompt records.
- 2026-10-03: prompt records (80 ChatGPT → `gpt-image`, 62 Grok → `xAI Grok Imagine` / `Grok Imagine`, FO-BQ-004 untouched); 142 `media.json` rows `pending` with `promptHash` from `promptHash()` and `originalSha256` of the staged original; sign-off case split, each split case watched red by mutating `media.json`. Next: `pnpm media:variants`.
- 2026-10-03: `pnpm media:variants` once (3 min 46 s, load 1.6): 686 rows (118 batch-1 rows byte-identical + 568), nothing under `public/media/` changed, every file inside its slot cap; `--check` and `catalogue:check` green. Rule-2 comment restated; sheet regenerated (script keeps each record's generator fields and lists products with no *approved* row, so the CSV is unchanged); runbook names `.jpeg`. **`seed:check` red: 568 × `media/alt-missing`** (142 new product assets × 4 locales) — escalated, see `## Escalations`.
- 2026-10-03: `seed/snapshot/{product_media,media_variant}.json` regenerated (`pnpm seed:diff --write`: 142 + 568 inserts). `gates:cheap` on `e072a2cd` (pre-rebase SHA): six gates exit 0, `tests` exit 1 — 31 failures, all the alt cascade. Row → `blocked`; escalation above. A finisher: apply the ruling, then gates, rebase, ready, `ci:full`.
- 2026-10-03 (A9): `media/alt-missing` now fires for `approved` product assets only; the merged-tree alt count asserts the 31 approved assets; two A9 cases (pending with no alt passes; approved with no `pl` alt fails), red when the condition is reverted (8 cases red) or disabled (the approved case red); `ui-media-manifest.test.ts` asserts alt keys equal the approved ids, red when widened to pending. The main checkout was at `da13b397`, behind the TASK-167 row, so the edit guard refused; I fast-forwarded it to `origin/main` `636fbd42` (clean tree, untracked `.claude/launch.json` untouched).
- 2026-10-03 (round 2, on the orchestrator's rebase `dfe307ac`): upload/verify approved-only with three `media-upload` cases (red with the filter removed; two red with only `loadUploadSet` unfiltered, one with only `runVerify` unfiltered); runbook and sheet; five A9 cases (`rejected`, brand filter, two `alt-empty`), red under the breaker's A4–A7; the unbackticked-SKU case, red under M16.
- 2026-10-03 (round 3): ten `media-upload` cases closing `/break 142` round 2's holes 5–9; the breaker's surviving mutations U5, U6, U8, U10, U12 and U13 each turn at least one of them red, then restored; no production change.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**For TASK-168 (from `/break 142` round 1).** The batch split in
`tests/unit/seed-media-manifest.test.ts` reads `content/imagery/remaining-images.csv`, and
`scripts/imagery-prompts-remaining.ts` regenerates that CSV from approval state. Approving a
batch-2 row and regenerating the sheet therefore moves the row into "batch 1", and the 2026-09-18
sign-off case goes red. TASK-168 must handle that: either do not regenerate the CSV in the
approval change, or change the case to key the batches on something stable (e.g. the sign-off
instant).

**In review (2026-10-03, round 2).** PR [#142](https://github.com/itsahmeds/flowers-overseas/pull/142),
ready, `ci:full`. Round 2 adds the approved-only upload and verify (`scripts/media-upload.ts`, three cases) and six cases closing the round-1 holes. Unit layer: T-31/T-32 in `tests/unit/imagery-prompts.test.ts` (generator → terms
map; 14 new cases, every failing case watched red by mutation); the sign-off split in
`tests/unit/seed-media-manifest.test.ts` (batch 1: 31 approved at the two 2026-09-18 instants;
batch 2: 142 `pending`, no reviewer; each half watched red by mutating `media.json`); two A9
cases in `tests/unit/seed-check.test.ts` and the approved-only alt assertion in
`tests/unit/ui-media-manifest.test.ts`, each watched red. Data: `` `gpt-image` `` filed in
`imagery-generator-terms.md` answer 1; 142 prompt records (80 ChatGPT `gpt-image`, 62 Grok
`xAI Grok Imagine` / `Grok Imagine`, each from its original's C2PA manifest); 142 `media.json`
rows `pending`, re-hashed; 686 variant rows (118 unchanged + 568), all inside their slot caps,
nothing new under `public/media/`, nothing uploaded; rule-2 comment restated; the sheet
regenerated; `.jpeg` in the runbook; `seed/snapshot/*` regenerated. `seed:check`,
`media:variants --check`, `catalogue:check` and `gates:cheap` green. No build slot taken; no
visual baseline can move (pending rows render the same placeholder box; the two home trending
tiles' `data-fo-media-placeholder` reads `unapproved` instead of `unknownAsset`). Handed to
TASK-168: the approval data edit with four-locale alt text per approved asset (A9 clause 4), the
FO-BQ-004 pair, the sign-off instant(s), `media:upload --only` for approved ids. The derived tree
is in `/Users/ahmed/dev/fo-wt-167/.local/media/` (git-ignored).
