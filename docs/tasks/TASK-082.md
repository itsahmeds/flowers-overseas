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

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
