// AC-12 fixture (TASK-005): `no-console` is an error everywhere in `src/**` except
// `src/lib/logger.ts` (the single log writer) and `scripts/**`. `pnpm lint:fixtures` reports the
// violation below; `tests/unit/lint-fixtures.test.ts` asserts it.
export function report(count: number): void {
  console.log(`count: ${String(count)}`);
}
