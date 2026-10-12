# TASK-225 — Prod advisories of 2026-10-12: `next`, `eslint-config-next`, `@next/env` to 16.3.8 (high GHSA-cjq9-62q9-8jv4), `sharp` 0.35.5 (GHSA-wq5f-xc86-pv6w), `source-map-js` 1.2.2 lockfile lift (GHSA-68fv-2mgg-jv7q), so `pnpm audit --prod --audit-level=high` exits 0 again

Row: `TASKS.md` → TASK-225. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-225`; keep it current by editing this file, not the row.

## Binding

`specs/001-*.md` AC-27 (T-28): `pnpm audit --prod --audit-level=high` exits 0 at merge. Three high advisories published by 2026-10-12 turned it red on every PR (205, 206, 208): next >=16.0.0 <16.3.8 (GHSA-cjq9-62q9-8jv4), sharp <0.35.5 (GHSA-wq5f-xc86-pv6w, via next), source-map-js >=1.0.0 <1.2.2 (GHSA-68fv-2mgg-jv7q, via next>postcss). The fix follows TASK-165: `next`, `eslint-config-next` and `@next/env` exact-pinned to 16.3.8; `sharp` 0.35.5 (direct dependency, exact pin); `source-map-js` by lockfile lift inside its existing range, an override only if the range forbids it. Nothing else changes.

## Read

- `specs/001-*.md` AC-27, T-28
- `package.json`, `pnpm-lock.yaml`

**Fence:** `package.json` (three pins), `pnpm-lock.yaml`, this brief, the row.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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
