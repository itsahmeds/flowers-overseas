# TASK-058 — CSP enforcement: make the policy enforceable with Next 16's React flight inline blocks — nonce propagation on `no-store` routes and/or hash-per-response on cached routes, the enforce-flip runbook (`CSP_REPORT_ONLY=false`), Report-Only evidence read with flight-block reports filtered, per-instance rate-limiter caveat

Row: `TASKS.md` → TASK-058. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-058-csp-enforce`. Created by the orchestrator from `/review 28` nit 1: the served document carries eleven inline scripts (bootstrap + ten `self.__next_f.push` blocks), so flipping enforcement today blocks hydration. Decide nonce vs hash-per-response in the PR body against ADR-0016's cached-HTML constraint; do not edit ADR-0016 (supersede if the shape changes). Also carries `/review 26` nits: `AcceptLanguageSchema` test-only note, logger reporting 200 for 204/4xx responses.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
