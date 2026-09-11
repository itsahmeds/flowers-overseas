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

- 2026-09-11 — Founder supplied Neon project `soft-darkness-33998532` and ran `neon login`/`neon mcp -y`; region to be verified as EU (Frankfurt) after `neon link` before any data lands.

_None recorded._

## Result

- 2026-09-11 — Neon linked: org `org-fragrant-violet-15013149`, project `old-moon-05172629` (Frankfurt, `aws-eu-central-1`), branch `production`. `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` in `fo-wt-013/.env.local` (never committed). US project `soft-darkness-33998532` unused, deletion recommended. R2: EU-jurisdiction buckets `flowersoverseas-media` (public dev URL `https://pub-92d8bd7f38564349a725f321388b8c9c.r2.dev`) and `flowersoverseas-backups` (30-day expiry rule); endpoint `https://15460f39387572e5939ed70691a49040.eu.r2.cloudflarestorage.com`; token `flowersoverseas-app` object rw on both buckets. DPAs: Neon (neon.com/dpa) and Cloudflare (customer DPA) still to be filed under `docs/compliance/`.

_Pending._
