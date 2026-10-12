# TASK-225 — Prod advisories of 2026-10-12: `next`, `eslint-config-next`, `@next/env` to 16.3.8 (high GHSA-cjq9-62q9-8jv4), `sharp` 0.35.5 (GHSA-wq5f-xc86-pv6w), `source-map-js` 1.2.2 lockfile lift (GHSA-68fv-2mgg-jv7q), so `pnpm audit --prod --audit-level=high` exits 0 again

Row: `TASKS.md` → TASK-225. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-225`; keep it current by editing this file, not the row.

## Binding

`specs/001-*.md` AC-27 (T-28): `pnpm audit --prod --audit-level=high` exits 0 at merge. Three high advisories published by 2026-10-12 turned it red on every PR (205, 206, 208): next >=16.0.0 <16.3.8 (GHSA-cjq9-62q9-8jv4), sharp <0.35.5 (GHSA-wq5f-xc86-pv6w, via next), source-map-js >=1.0.0 <1.2.2 (GHSA-68fv-2mgg-jv7q, via next>postcss). The fix follows TASK-165: `next`, `eslint-config-next` and `@next/env` exact-pinned to 16.3.8; `sharp` 0.35.5 (direct dependency, exact pin); `source-map-js` by lockfile lift inside its existing range, an override only if the range forbids it. Nothing else changes.

## Read

- `specs/001-*.md` AC-27, T-28
- `package.json`, `pnpm-lock.yaml`

**Fence:** `package.json` (four exact pins: next, eslint-config-next, @next/env, sharp), `pnpm-lock.yaml`, this brief, the row.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-13, to the orchestrator, `open`:** `sharp` 0.35.5 loads libvips 8.18.7, but `seed/schema/variants.ts` pins `PINNED_SHARP_VERSION = "0.35.4"` and `PINNED_LIBVIPS_VERSION = "8.18.6"`, and `seed/data/media-variants.json` records both in its header. `tests/unit/media-variants.test.ts` fails (9 cases) and `pnpm media:variants --check` would refuse. Fixing it is a source change outside this task's fence. Measured in a scratch copy (not committed): with the two constants bumped, `pnpm media:variants` over the 175 originals re-derived 862 variants and the manifest differs from the committed one only in its two header lines (sharp, libvips); the committed `public/media/home-hero/*` bytes are identical. So the fix is the two constants plus the two manifest header lines, no re-derivation. Needs the fence widened to `seed/schema/variants.ts` and `seed/data/media-variants.json` (and possibly the TASK-078/080 test expectations if any hard-code the numbers).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-13: four pins and the lockfile lift done (`pnpm update sharp source-map-js -r --depth 99` moved `source-map-js` 1.2.1 to 1.2.2 and the stale `sharp` 0.35.4 under next to 0.35.5; no override needed). `pnpm audit --prod --audit-level=high` exits 0; with `next` back at 16.3.6 on the same lock it exits 1. typecheck, lint, format, i18n, no-db, map exit 0. Unit tests red on the sharp pin: see Escalations. Next: once the fence is widened, bump the two constants and the manifest header, rerun `pnpm media:variants --check`, open the draft PR, rebase, ready, `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
