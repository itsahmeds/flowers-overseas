# TASK-503 — Staging builds again: client files stop importing server code

Row: `TASKS.md` → TASK-503. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-503`; keep it current by editing this file, not the row.

## Context

Staging (Railway) has failed every deploy since PR 476 (685f9c3ba, 2026-11-04). Local `pnpm build` on main ec41cb020+ fails with 10 Turbopack errors. Import traces end at `src/modules/ui/admin/AdminSelectionSummary.tsx` (`"use client"`, imports `formatMoney` from `@/modules/i18n`, whose barrel reaches `src/modules/i18n/review-ledger.ts` -> `db/ledger.ts` -> `src/lib/db.ts` -> `env.ts`, plus `src/lib/auth/surface.ts` (`after`), `src/lib/cache.ts` (`revalidatePath`), `src/lib/env.server.ts` (`server-only`), and `fs`/`net`/`tls`/`perf_hooks`). `src/app/admin/(signed-in)/orders/[id]/refund-form.tsx` (`"use client"`) imports `formatMoney` from the same barrel. Module boundary lint (`eslint/modules.js`) lets modules import other modules only via `index.ts`.

Done when: `pnpm build` exits 0 on the branch (inside the build slot), typecheck and lint pass, and a cheap check (lint rule or unit test) fails if a `"use client"` file imports a barrel that reaches `server-only` code. Founder rule: no review steps; PR description is a short AC list.

## Binding

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

## Progress

- 2026-11-08: `src/modules/i18n/client.ts` added, both client files moved to it, boundary zones allow `client.ts`, graph test added; typecheck 0, `pnpm build` 0 in the build slot; PR #510.

## Result

PR #510. A module may publish a client-safe `client.ts` beside `index.ts` (`eslint/modules.js`); i18n's re-exports only `format.ts` and `collate.ts`, and `AdminSelectionSummary.tsx` and the refund form import `formatMoney` from it. `tests/unit/client-server-graph.test.ts` (4 unit tests, about 3 s) walks every `"use client"` file and every `modules/*/client.ts` through static, re-export and dynamic imports and fails on server packages, Node built-ins, `src/lib/db.ts` and `src/lib/env.server.ts`; `module-boundaries.test.ts` updated. `pnpm build` was run locally inside the build slot (load average about 7) because the task is a build failure: exit 0. Carry-forward: the graph test parses imports with regexes, not a TS parser; a file that builds an import specifier at runtime is not followed.
