// The counterpart of `console.ts`: application code logs through `src/lib/logger.ts`, so no
// `no-console` violation is reported here.
export function report(count: number): { count: number } {
  return { count };
}
