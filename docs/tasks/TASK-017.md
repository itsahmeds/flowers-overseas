# TASK-017 — Schema media (migration `0004`) + R2 storage seam: `media_asset`, `media_variant`, `product_media` with one-primary partial index, `product_media_alt`; `src/lib/storage.ts` interface + `objectKey()` + `InMemoryStorage` fake

Row: `TASKS.md` → TASK-017. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-017-schema-media-storage-seam`. Keys, never bytes (ADR-0015): no `bytea` column anywhere, asserted by `db:check` in TASK-027. S3-API client, upload, EXIF stripping and variant generation are spec 006; this task ships only the interface, the key convention and the tables. §8 accessibility: `product_media_alt.alt` is `NOT NULL` per locale, never generated at render. Tests: T-11, T-22.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
