# TASK-029 — `neon.usage_probe` (daily): read the Neon API for compute-hours and storage this billing period, write one `db_usage_sample` row, `warn` + Sentry message at 70% and 90% of the free-tier cap, degrade to one `info` line when `NEON_API_KEY` is unset

Row: `TASKS.md` → TASK-029. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-029-neon-usage-probe`. **Founder prerequisite** (from TASK-013 item 4): `NEON_API_KEY` + `NEON_PROJECT_ID`; the job must degrade cleanly without them, so the task is not blocked. ADR-0015 makes the compute cap a monitored guardrail rather than a note, and §11 makes this the first alert with a business consequence: at 90% the founder chooses between throttling previews, an earlier Hetzner move, or paying. Idempotent per day. Tests: T-24.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
