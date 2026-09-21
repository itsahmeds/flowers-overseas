# TASK-138 — R2 media delivery **without the database** — the narrow path to zero placeholders. `media:variants` already derives the ladder locally and `seed/data/media-variants.json` already records all 118 rows, so Phase 0 needs no `media_variant` table, no jobs queue and no `media:upload` worker: an `r2Loader` behind the existing `setMediaLoader()` seam in `src/modules/ui/media/loader.ts`, a plain upload of the derived files to `flowersoverseas-media`, deletion of `public/media/` and `staticVariantLoader`, and the CSP `img-src` change. Removes `COMMITTED_MEDIA_BYTE_CAP` as a constraint so all 84 products can be photographed.

Row: `TASKS.md` → TASK-138. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-138`; keep it current by editing this file, not the row.

## Binding

**Why this task exists.** TASK-082 stopped and escalated: its three deliverables each rest on a
task that is still `todo` — `src/lib/storage.ts` (TASK-017, the file does not exist), migration
`0004`'s `media_variant` table (TASK-017), and the pg-boss jobs registry (TASK-024; `src/jobs/`
holds a `.gitkeep` and `pg-boss` is not a dependency). Delivering those means absorbing two
database tasks the founder deliberately deferred.

**The ruling that makes this task possible, recorded as a spec 006 §14 amendment:** *Phase 0 R2
delivery requires neither the database nor the jobs queue.* The variant ladder is already derived
locally by `pnpm media:variants` and already recorded in `seed/data/media-variants.json` — 118
rows, committed, checked by `seed:check`. That manifest is the source of truth in Phase 0. A
`media_variant` table and a `media.derive_variants` worker are Phase 1 groundwork that buy a
visitor nothing today.

**What to build, and it is deliberately small:**

1. An `r2Loader` installed through the existing `setMediaLoader()` seam in
   `src/modules/ui/media/loader.ts`. Read that file before anything else — it was written for
   exactly this swap, it is typed against `next/image`'s `ImageLoaderProps` with a type-only
   import, and `Media` reads it through `getMediaLoader()` at render time so module evaluation
   order cannot defeat the swap. **No call site changes.** Do not reshape the seam.
2. A plain upload of the already-derived files to the `flowersoverseas-media` bucket, idempotent
   by checksum. A script, not a worker. No queue, no database.
3. Deletion of `public/media/` and `staticVariantLoader`, and the CSP `img-src` change.
4. `COMMITTED_MEDIA_BYTE_CAP` stops governing shipped imagery. Say in `## Result` what now
   guards against unbounded media, because "nothing" is not an acceptable answer — per-asset
   caps and the manifest check must still hold.

**Verified for you, so do not re-litigate it.** A signed read-only `ListObjectsV2` against both
buckets returned 200 with `KeyCount 0`; a control bucket returned `404 NoSuchBucket`, so those
200s are real. The endpoint host ends `.eu.r2.cloudflarestorage.com` — the EU jurisdiction
ADR-0015 requires.

**Two defects you inherit; record them, do not silently absorb them.**

- **Bucket names deviate from binding text.** Spec 002 §13 Q7 binds `fo-media` /
  `fo-media-preview` / `fo-backups`; all three 404. What exists is `flowersoverseas-media` and
  `flowersoverseas-backups`, with **no preview bucket at all**. Names are configuration so
  nothing breaks, but §13 Q7 must be amended or the buckets renamed — and the missing preview
  bucket matters if preview environments are ever to serve images.
- **`R2_PUBLIC_BASE_URL` is a `pub-*.r2.dev` host.** Cloudflare rate-limits `r2.dev` and does not
  recommend it for production traffic, and it puts a third-party origin into CSP `img-src`
  against ADR-0016's intent. **A custom domain is a founder action.** Build against the
  configured value, make the origin a single configuration point, and state the risk plainly in
  `## Result` rather than shipping `r2.dev` as though it were the answer.

**Credential handling.** Use `.env.local` through the project's own env loader. Never print, log,
commit or paste a secret value anywhere — not into a file, a fixture, a commit message or a PR
body. `.env.example` carries key names only. If a key is missing, stop and name it.

**The honesty rule still governs.** `placeholderLoader` throws rather than inventing a URL, and
that is deliberate: a loader that returned a data URI or a stock image would put a photograph we
do not have onto the page. The 72 products without imagery keep their captioned placeholder until
their images exist. This task changes where images are served from; it does not invent any.

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
