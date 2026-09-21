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

### E-1 (2026-09-21, blocking) — the seam, the queue and the table this task fills do not exist yet

TASK-082 was re-dispatched on the finding that its *provisioning* blocker was stale. That finding is
correct and is confirmed below (E-3). But the row's `Deps` cell lists only TASK-078 and TASK-013,
while the `## Binding` clause above also names **TASK-017** and **TASK-024** — and both are still
`todo`. Every one of this task's three deliverables rests directly on one of them, so there is no
honest slice of TASK-082 to build today:

| TASK-082 deliverable | What it needs | State on `origin/main` (f6da9a6) |
|---|---|---|
| R2 `Storage` implementation "passing the same contract suite as `InMemoryStorage`" | `src/lib/storage.ts` — the `Storage` interface, `ObjectKind`, `StorageObject`, `objectKey(kind, id, variant)`, the `InMemoryStorage` fake and the contract suite (spec 002 §5.2 L142, AC-22, T-22 → **TASK-017**) | **File does not exist.** No `Storage` interface, no `objectKey()`, no fake, no contract suite anywhere in `src/`, `seed/`, `tests/`. There is nothing for a real implementation to implement, and nothing to run "the same suite" against. |
| `pnpm media:upload` "enqueuing one job per asset" | `src/jobs/index.ts` registry, `MediaDeriveVariantsPayload`, pg-boss bootstrapped by migration `0012` (spec 002 §5.2 L143, AC-21 → **TASK-024**) | **`src/jobs/` contains only `.gitkeep`.** `pg-boss` is not in `package.json` at all; there is no `pgboss` schema on the Neon database. Nothing to enqueue onto. |
| `media.derive_variants` worker writing `media_variant` rows once per (asset, variant, format) | migration `0004` + `media_asset` / `media_variant` / `product_media` / `product_media_alt` and their Drizzle schema (spec 002 §5.1, AC-11 → **TASK-017**) | **Migration `0004` does not exist** (`db/migrations/` stops at `0003`, whose own header says "…is migration `0004`"). `db/schema/` has `catalog`, `geo`, `i18n` and no media module. AC-25's "exactly one row per (asset, variant, format)" has no table to be a row in, and T-25 has no schema to integrate against. |

Building these would mean taking TASK-017 and TASK-024 wholesale — two migrations with their rollback
files and RLS policies, a Drizzle schema module, a jobs registry, and two new runtime dependencies
(`@aws-sdk/client-s3` and `pg-boss`) — i.e. a second and third task's scope, plus a schema change this
task's spec sections do not list. `CLAUDE.md` and the implementer contract both forbid that, so this
task is stopped rather than improvised.

**What unblocks it:** dispatch **TASK-017** (migration `0004` + the `src/lib/storage.ts` seam, fake and
contract suite) and **TASK-024** (pg-boss + the `src/jobs/index.ts` registry with the declared
`media.derive_variants` payload) first; TASK-082 then becomes exactly what it says it is — one real
implementation behind an existing interface, one CLI, one worker. Note TASK-017's own dep, TASK-016,
is `in_review` (PR open), and `0003`'s tables are **not yet applied** to the Neon database (see E-2).

Alternatively the founder/orchestrator may deliberately widen TASK-082 to absorb TASK-017 and
TASK-024. That is a scope decision, not an implementer's call, and it should be written into the row
and this brief before anyone starts.

### E-2 (2026-09-21, informational) — the Neon database is live but only `0001`/`0002` are applied

A direct connection with the `.env.local` `DATABASE_URL` succeeds. `public` holds exactly the `0001`
and `0002` tables (`locale`, `message_catalog`, `currency`, `country*`, `region`, `city*`,
`postcode_zone`, `country_holiday`, `occasion*`, `fx_rate`, `schema_migrations`). The `0003`
catalogue/pricing tables are committed as SQL but **not migrated**, and there is no `pgboss` schema.
Whoever picks up TASK-017 should expect to run `db:migrate` for `0003` first.

### E-3 (2026-09-21, resolved) — the R2 blocker really was stale; verified against the live bucket

Verified with a read-only SigV4-signed `ListObjectsV2(max-keys=0)` using the `.env.local` credentials
via `node --env-file`. No credential value was printed, written to a file or committed; the probe
script lived in the session scratchpad and was deleted.

- `R2_BUCKET` = `flowersoverseas-media` → **HTTP 200**, `<Name>flowersoverseas-media</Name>`, `KeyCount 0` (empty bucket).
- `R2_BACKUPS_BUCKET` = `flowersoverseas-backups` → **HTTP 200**.
- Control: a bucket name that should not exist → **HTTP 404 `NoSuchBucket`**, so the 200s are real and not a permissive endpoint.
- Endpoint host ends `.eu.r2.cloudflarestorage.com` → the **EU-jurisdiction** endpoint the binding clause requires.
- All four env keys are present and the credential pair authenticates.

**Two deviations from the binding clause the founder should confirm before TASK-083:**
1. The buckets are named `flowersoverseas-media` / `flowersoverseas-backups`, not spec 002 §13 Q7's
   binding `fo-media` / `fo-media-preview` / `fo-backups` (`fo-media`, `fo-media-preview` and
   `fo-backups` all answer `404 NoSuchBucket`). There is no separate preview bucket. Names are config,
   so nothing in code breaks — but §13 Q7 is binding text and should be amended or the buckets renamed.
2. `R2_PUBLIC_BASE_URL` is a `https://pub-….r2.dev` development URL, **not** the binding first-party
   custom domain `https://media.flowersoverseas.com`. That is TASK-083's problem, not this one, but it
   is load-bearing there: `r2.dev` is a third-party host (so CSP `img-src` gains a third-party entry,
   against ADR-0016's one-first-party-origin intent) and Cloudflare rate-limits and does not recommend
   it for production traffic. The custom domain is a founder action.


## Result

**Stopped and escalated on 2026-09-21 — no code written.** See E-1: `src/lib/storage.ts` (the
interface, `objectKey()`, `InMemoryStorage` and the contract suite), the `media_asset`/`media_variant`
tables of migration `0004`, and pg-boss with the `src/jobs/index.ts` registry are all still unbuilt
(TASK-017 and TASK-024, both `todo`), so all three of this task's deliverables have nothing to build
on. The branch `task/TASK-082-r2-storage-upload-derive-job` carries this brief update only.

**R2 exercised against the real bucket, not the fake** — and that is the whole of what was exercised.
A read-only signed `ListObjectsV2` against `flowersoverseas-media` returned 200 with a matching
`<Name>` and `KeyCount 0`, and a nonexistent control bucket returned 404 `NoSuchBucket` (E-3). **No
`put`, `head`, `getSignedUrl` or `delete` was exercised against R2, and no worker or upload path was
run at all, because none of them exist yet.** The declared gap is the entire task: everything below
"the bucket answers a signed read" is unverified because it is unwritten.

Gates: not run — the diff is one documentation file and touches no `src/`, `seed/`, `scripts/` or
`tests/` path, so `typecheck`, `lint`, `i18n:check`, `check:no-db` and `codebase:map --check` have
nothing in it to judge. No build slot was taken. No dependency was added.
