# TASK-082 — R2 storage, upload and the variant worker: `src/lib/storage.ts`'s real S3-API implementation over R2 (`put`, `head`, `getSignedUrl`, `delete`, `objectKey`) passing the same contract suite as `InMemoryStorage`, `pnpm media:upload` (originals to `originals/{assetId}`, idempotent by checksum, enqueuing per asset), and the `media.derive_variants` pg-boss worker

Row: `TASKS.md` → TASK-082. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-082-r2-storage-upload-derive-job`. **Blocked on TASK-013** (spec 002 provisioning parked 2026-09-08 by the founder: no Neon project, no Cloudflare account, no R2 bucket — waiting on the domain and business mailbox, `plan/09` §0 non-code critical path first). Also needs TASK-017 (`media_asset`/`media_variant`/`product_media` tables and the `lib/storage.ts` interface + `objectKey()` + `InMemoryStorage` fake) and TASK-024 (pg-boss, where `media.derive_variants` is already a *declared* handler this task fills). Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. **Founder actions gating it:** provision Cloudflare with an **EU-jurisdiction** media bucket and a scoped API token per spec 002 §12 founder action 2, using §13 Q7's binding names — buckets `fo-media` (public, EU jurisdiction), `fo-media-preview`, `fo-backups` (private, spec 002's) and public origin `https://media.flowersoverseas.com` as a Cloudflare custom domain, a first-party origin so `img-src` gains one entry and no third-party host; accept and file the Cloudflare DPA. **AC-24**: the `Storage` contract suite produces identical observable results against `InMemoryStorage` and a real bucket, and `objectKey()` output matches spec 002's fixtures exactly. **AC-25**: the worker produces the **same ladder and the same checksums as TASK-078's CLI** for the same original (which is why that CLI's encoder options are pinned in the manifest header), writes each `media_variant` row **exactly once per (asset, variant, format)**, and a second run inserts nothing and re-encodes nothing (ADR-0015: "size variants generated once by a job"). The fake stays for tests; R2 credentials are env-only and scoped to the media bucket. No object key, prompt, file path or asset id is logged at `info` in a request path. Gates: `lint`, `typecheck`, `test-unit`, `test-integration`, `test:contract`, `db:check`, `audit`, `build`. Tests: T-24, T-25.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/09`
- `seed/data/`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-20):** unblocked: TASK-017 (PR 184) and TASK-024 (PR 224) are done, so `src/lib/storage.ts`'s seam and the jobs registry exist. Spec 012b's photos task (TASK-299) builds on it.
- **From the implementer (2026-10-23), for later tasks:**
  - **AC-24 "against a real bucket"** ran against an in-process S3 endpoint that verifies every SigV4 signature itself, plus AWS's published examples and the TASK-138 uploader's signer; the work order forbade real credentials. One run of `describeStorageContract` against the real private bucket remains, once the private bucket of Escalations 1 exists (orchestrator or founder, with the R2 token in the environment).
  - **TASK-083 (importer):** write `media_asset.bucket = R2_PRIVATE_BUCKET` and `object_key = originalObjectKey(asset)` (exported from `scripts/media-originals.ts`), so the worker finds each original; then `pnpm media:upload --originals --backfill` enqueues the derives.
  - **TASK-083 (loader flip):** two variant-key conventions now exist. The Phase 0 manifest and bucket use `media/{assetId}/{w}.{fmt}` (TASK-078/138); the worker writes `media/{kind}/{assetId}/{w}.{fmt}` (spec 002's `objectKey()`, AC-24). The flip picks one source for `r2VariantLoader`.
  - **`sharp` at runtime.** The worker loads `sharp` in the web process; it is a devDependency, installed by the Docker deps stage and traced into the standalone output. If the Railway image loads another build, `assertPinnedEncoder()` fails the job by name and pg-boss retries; check the first production derive. Moving `sharp` to `dependencies` changes the lockfile and was left out.
  - **`reason: "reencode"`** has no distinct behaviour: a published variant URL is `immutable` for a year, so re-encoding means a new asset, never a rewrite.
  - **`retention.sweep`** still reports delivery photos `storage_unavailable` ("No storage yet" in `src/jobs/handlers.ts`); wiring `R2Storage` into it is TASK-025's area, not this task's.

## Escalations

Decisions taken inside the task (fail-closed, nothing blocked on them), each needing a founder or orchestrator act:

1. **Private bucket (founder action).** Originals are pre-strip files and delivery or partner objects are private, and the public bucket is served whole by `media.flowersoverseas.com`, so no prefix can make part of it private. `R2_PRIVATE_BUCKET` is added as an **absent-means-off switch** (like `CLOUDFLARE_API_TOKEN`: not one of the contract's keys, so no environment is made to require it; listed in `.env.example` commented and in `OPTIONAL_VARIABLE_KEYS` for `production`/`staging`). Founder: create `flowersoverseas-private` (R2, EU jurisdiction, no public access, no custom domain, no lifecycle rule), extend the scoped token to it, set `R2_PRIVATE_BUCKET` in `.env.local` and on Railway `production`. Until then `media:upload --originals` and any private derive are refused, never redirected to the public bucket.
2. **Slot of a non-seed upload (open question for TASK-299 and TASK-215).** `media_asset` has no slot column; the worker reads the slot from `seed/data/media.json` by the id in the original's key, and refuses `slot_unknown` for anything else. Spec 012b's admin photos and spec 011's delivery photo must say how an uploaded asset names its ladder: a `media_asset.slot` column (a schema change, needs a spec amendment) or a v2 `media.derive_variants` payload carrying it. Not decided here.

## Progress

- 2026-10-23: started on `task/TASK-082-r2-storage` (worktree `../fo-wt-082`); plan: R2Storage + fake S3 contract, derive worker, `media:upload --originals`.
- 2026-10-23: `R2Storage` (`src/lib/storage-r2.ts`) + in-process S3 endpoint (`tests/contract/support/fake-s3.ts`); the contract suite green against it, SigV4 pinned to AWS's published vectors and to the TASK-138 signer.
- 2026-10-23: `deriveVariants` moved verbatim to `seed/derive.ts` (CLI re-exports it); worker `src/jobs/media-derive-variants.ts` + handler; T-25 green on a scratch PG16.
- 2026-10-23: `pnpm media:upload --originals [--backfill]` (`scripts/media-originals.ts`); docs, `.env.example`, railway optional key, codebase map; 17 mutations each red; `gates:cheap` PASS. PR 349.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/349 · AC-24, AC-25 (spec 006).

- **AC-24:** `R2Storage` in `src/lib/storage-r2.ts` passes `describeStorageContract` (`tests/contract/storage-r2.test.ts`, 48 cases with placement, signing and error hygiene); `objectKey()` unchanged and shared.
- **AC-25:** `src/jobs/media-derive-variants.ts` + the `media.derive_variants` handler; T-25 `tests/integration/media-derive-variants.test.ts` (10 cases): ladder and checksums equal the CLI's, one row per (asset, variant, format), a second run reads, encodes, puts and inserts nothing, concurrent deliveries write once.
- **Upload:** `pnpm media:upload --originals [--backfill]` (`scripts/media-originals.ts`, 13 unit cases).
- No expensive gate run locally: no page, bundle or budget changed. `gates:cheap` PASS.
