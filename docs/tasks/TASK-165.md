# TASK-165 — Prod advisories of 2026-09-30: `next`, `eslint-config-next`, `@next/env` pinned to 16.3.6 (critical GHSA-vcvr-r3jv-pc5j), `brace-expansion` 5.0.12 and `fast-uri` 3.1.8 lockfile lifts, so `pnpm audit --prod --audit-level=high` exits 0 again

Row: `TASKS.md` → TASK-165. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-165`; keep it current by editing this file, not the row.

## Binding

`specs/001-*.md` AC-27 (T-28): `pnpm audit --prod --audit-level=high` exits 0 at merge. Five advisories published on 2026-09-30 turned it red on every PR: next <16.3.6 (critical, GHSA-vcvr-r3jv-pc5j), brace-expansion <5.0.12 (GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr) and fast-uri <3.1.8 (GHSA-hrr3-gc8f-f4qj). The fix is the first patched `next` (16.3.6, not the hours-old 16.3.8) and lockfile-only lifts inside existing ranges; nothing else changes.

## Read

- `specs/001-*.md` AC-27, T-28
- `package.json`, `pnpm-lock.yaml`

**Fence:** `package.json` (three pins), `pnpm-lock.yaml`, this brief, the row.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 128` (2026-09-30), PASS on `1fdbe2c`:** nits only — five advisories, not four (title fixed); `brace-expansion` 1.1.18 → 1.1.21 on the dev-only 1.x line also moves; `@next/env` becomes an exact pin. `/break 128` HOLDS on `1fdbe2c`: reverting only `fast-uri` still passes the gate (moderate, below the gate's level); no e2e pins `Cache-Control` on the ISR home and hub pages.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
