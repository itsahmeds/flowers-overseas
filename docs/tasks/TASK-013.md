# TASK-013 — Provisioning and env contract: Neon (Frankfurt) + R2 buckets wired into `lib/env.ts` and `.env.example`; delete `ALLOW_PLACEHOLDER_ENV` and the three Supabase keys; widen logger redaction to `*name` + the §8 field list

Row: `TASKS.md` → TASK-013. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-013-provisioning-env-contract`. **Founder actions (do first):** (1) Neon project in Frankfurt eu-central-1, copy pooled + direct URLs; (2) Cloudflare account, EU-jurisdiction R2 media bucket + private backups bucket, scoped API token; (3) put the real values in `.env.local` and both Vercel environments and **delete `ALLOW_PLACEHOLDER_ENV` from Vercel preview + production** once this merges; (4) Neon API key + project id (optional, for TASK-029); (5) accept and file the Neon and Cloudflare DPAs in `docs/compliance/`. §12 item 7 is already satisfied — `db/` is a protected root in `.claude/hooks/task-guard.sh` and `CLAUDE.md` today, so no hook edit is needed for Q2 option A. New keys: `DATABASE_URL_UNPOOLED`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`, `NEON_API_KEY?`, `NEON_PROJECT_ID?`, `INTERNAL_CRON_SECRET`. Also in this PR (first task of spec 002, so it carries the small ledger/doc debts): (the `2 / 12` pin in `scripts/tasks-open-decisions.ts` and its test was already flipped by the orchestrator when the plan landed) fix the README/local-setup Next 16 deprecation symptom cell together with its pin in `tests/unit/docs.test.ts` (log 2026-09-08). Tests: T-03, T-04. §8: logger list gains `*name`, `card_message`, `phone_e164`, `postal_code`, `session_token`, `public_token`, `object_key` (`/review 5` carry-forward). **PARKED 2026-09-08 by founder:** provisioning (Neon, Cloudflare R2) waits until the domain and business mailbox exist; work on the plan/09 §0 non-code critical path first.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/compliance/`
- `scripts/tasks-open-decisions.ts`
- `tests/unit/docs.test.ts`

## Carry-forwards

_None recorded._

## Escalations

- 2026-09-15 — **Key-name reconciliation (decided, not escalated).** The brief's key list names `R2_BUCKET` only; the founder's `.env.local` also carries `R2_BACKUPS_BUCKET`, `R2_S3_ENDPOINT` and `NEON_BRANCH`, and spec 002 §2 requires a private backups bucket (AC-25) and an S3 endpoint for the storage seam. All three were kept and added to the schema and `.env.example` rather than dropped, so the file and the schema agree in both directions (AC-1) and nothing the founder already pasted is orphaned. 26 keys in total.
- 2026-09-15 — **`*name` is read as a word boundary, not a blind suffix.** A blind `*name` suffix also matches `filename`, and `src/lib/sentry.ts` puts stack-frame `filename` values through `isRedactedKey`, so spec 001 AC-13's "type and stack are kept" would have become `[REDACTED]` frames — protecting no one and blinding every future stack trace. `isNameKey()` therefore matches the exact key `name` or `name` as the last token after `_`, `-`, space or a camel-case break: `full_name`, `legal_name`, `recipient_name`, `recipientName` are caught (the three the spec names), `filename` / `hostname` / `pathname` are not. Recorded here as an interpretation of spec 002 §8 for the reviewer to confirm.
- 2026-09-15 — **RoPA row numbers.** Spec 002 §8/AC-33 and TASK-031 call the Neon and Cloudflare rows "3–4", but rows 3, 4 and 5 were taken by spec 004 (consent records, GA4, reminder signup) after spec 002 was written. They are **rows 6 and 7**; the placeholder tail row is retained and re-worded for TASK-031, which owns the RoPA close.
- 2026-09-15 — **The Next 16 deprecation cell is already gone.** TASK-032 (PR #13) deleted it from `README.md` and `docs/runbooks/local-setup.md` together with its pin in `tests/unit/docs.test.ts`; `grep -i deprecat` finds nothing in any of the three. No debt left to discharge here.
- 2026-09-11 — Founder supplied Neon project `soft-darkness-33998532` and ran `neon login`/`neon mcp -y`; region to be verified as EU (Frankfurt) after `neon link` before any data lands.

## Result

- 2026-09-11 — Neon linked: org `org-fragrant-violet-15013149`, project `old-moon-05172629` (Frankfurt, `aws-eu-central-1`), branch `production`. `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` in `fo-wt-013/.env.local` (never committed). US project `soft-darkness-33998532` unused, deletion recommended. R2: EU-jurisdiction buckets `flowersoverseas-media` (public dev URL `https://pub-92d8bd7f38564349a725f321388b8c9c.r2.dev`) and `flowersoverseas-backups` (30-day expiry rule); endpoint `https://15460f39387572e5939ed70691a49040.eu.r2.cloudflarestorage.com`; token `flowersoverseas-app` object rw on both buckets. DPAs: Neon (neon.com/dpa) and Cloudflare (customer DPA) still to be filed under `docs/compliance/`.

- 2026-09-15 — **Implemented (AC-1, AC-2).** `src/lib/env.schema.ts` carries the Neon + R2 contract:
  `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (Postgres-URL shape), `R2_ACCOUNT_ID` (32-hex),
  `R2_BUCKET` / `R2_BACKUPS_BUCKET` (bucket-name shape), `R2_S3_ENDPOINT` and `R2_PUBLIC_BASE_URL`
  (https-only), `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (secret, shape-free by design — the
  founder's current secret is a known-bad paste and must not be rejected by a guessed format),
  optional `NEON_API_KEY` / `NEON_PROJECT_ID` / `NEON_BRANCH`, required `INTERNAL_CRON_SECRET`.
  The placeholder escape hatch and the three Supabase keys are deleted from the schema, the client
  env, the barrel, `.env.example`, the env fixtures, `PLACEHOLDER_VALUES`, `REAL_VALUE_REQUIRED`,
  `docs/architecture.md` §4 (row removed; its absence is now pinned), `docs/runbooks/vercel-setup.md`
  and the `env-build-failure` CI job. `pnpm env:check` passes against `.env.example` **and** against
  the worktree's `.env.local` (26 keys each); `validateEnv` on the real `.env.local` reports zero
  issues in `development`, so every real Neon and R2 value satisfies its shape.
- Logger: `REDACTED_KEYS` gains `phone_e164`, `postal_code`, `session_token`, `public_token`,
  `object_key` (`card_message` is already covered by the `card*` prefix) and `isNameKey()` adds
  `*name`; tests assert every widened key at nesting depth in objects and arrays, and that the log
  context fields and `filename` / `hostname` / `pathname` pass through.
- Docs and records: `README.md` and `docs/runbooks/local-setup.md` §3.1 say where every Neon and R2
  value comes from and that the buckets are EU-jurisdiction and the backups bucket private;
  `docs/compliance/ropa.md` gains rows 6 (Neon, Frankfurt) and 7 (Cloudflare R2, EU) plus a
  "DPAs still to be filed" table recording that **neither DPA is accepted or filed** (and that the
  Vercel one is accepted but unfiled), with the Art. 28(3) reason for declaring both now.
- Gates (all local, no CI): `lint` ✓ · `typecheck` ✓ · `format:check` ✓ · `test` 3108 passed,
  5 skipped (gitleaks absent locally), 143 files ✓ · `env:check` ✓ (both files) · `check:no-db` ✓ ·
  `tasks:check` ✓ · `codebase:map --check` ✓ · `specs:index --check` ✓ · cold `pnpm build` ✓ ·
  `budget:client-js` ✓ (unchanged; no client code touched).
