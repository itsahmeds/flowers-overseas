# TASK-268 — Seed dry-run integration case is flaky: `tests/integration/seed.test.ts:295` expects the product table's `updated` to be 1 after `stem_count + 1` on FO-BQ-002 and sometimes reads 0; find the order or timing dependency and make the case deterministic

Row: `TASKS.md` → TASK-268. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-268`; keep it current by editing this file, not the row.

## Binding

- Spec 002 AC-29 and AC-32 (T-29, T-32) as built by TASK-026 (PR 245). The case is the `--dry-run` one at `tests/integration/seed.test.ts` L283 to L298.
- Find why the real run after the dry run reports `updated` 0 for `product` (the mutation not visible, a prior case reseeding the row, a fingerprint or ordering race), fix the cause, and prove it with the case run 20 times in a row on a throwaway PG16; no retry wrapper and no loosened assertion (DoD §4: the one value).
- **Class:** not review-only (seed and data flows); `/review` and `/break` both run.

## Read

- `specs/002-schema-v1.md` §9 AC-29, AC-32, §10 T-29, T-32; `docs/tasks/TASK-026.md`
- `tests/integration/seed.test.ts`, `seed/index.ts`, `seed/plan.ts`, `tests/integration/support/scratch-db.ts`
- CI run https://github.com/itsahmeds/flowers-overseas/actions/runs/39144827622

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

- 2026-10-19: cause found and reproduced on a throwaway PG16: the `source = 'real'` case flips the product with the lowest `gen_random_uuid()` id; one run in 84 that is FO-BQ-002, which the seed then rightly skips, so the dry-run case reads `updated` 0 (forcing the flip onto FO-BQ-002 gives the CI error at `seed.test.ts:295:71` exactly). Fix: fixed pick by natural key that excludes the edited SKUs, plus a precondition assertion. 10/10 green locally; next: 10 more, the mutation, CI.
- 2026-10-19: 20/20 green, three mutations red, `pnpm gates:cheap` PASS; PR 280 ready with `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 280, test only (`tests/integration/seed.test.ts`); no seed code changed. **Cause:** the `AC-29: a product row flipped to source = 'real'` case flipped the seeded product with the lowest `gen_random_uuid()` id; one run in 84 that was FO-BQ-002, which the seed then rightly skips, so the later `--dry-run` case read `updated` 0 (dry and real agreed, so only L295 failed). Forcing the flip onto FO-BQ-002 reproduces the CI error exactly (`expected +0 to be 1`, `seed.test.ts:295:71`). The failure was never on every run: main's e970a8ac run failed on lighthouse; the seed case failed on 6d4c40b7 (run 39210135573), PR 264 (39144827622) and TASK-241's 95a80e36 (39210777380). **Fix:** `REAL_PICK`, a fixed pick per table by natural key where it has one (country `iso2 <> 'PL' ORDER BY iso2`, product `sku NOT IN (FO-BQ-001, FO-BQ-002) ORDER BY sku`), and a precondition in the dry-run case (the edit returns exactly `[{ source: "seed" }]`); the `updated` 1 assertion is unchanged. **Proof** on a throwaway PG16 16.14 (`@embedded-postgres/darwin-arm64`): 20/20 runs of the file green (15 tests each). Mutations, each red: `differs` forced to `false` in `seed/index.ts` (L131 and the dry-run case's `updated` 1 go red); `stem_count` dropped from the `IS DISTINCT FROM` comparison (same two red); the product pick put back onto FO-BQ-002 (the new precondition goes red: `source: 'real'`). No build slot taken.
