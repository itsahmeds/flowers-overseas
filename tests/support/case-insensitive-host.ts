/**
 * When a mis-cased URL is testing the *host filesystem* instead of this repository.
 *
 * Next resolves a prerendered route by reading `.next/server/app/<path>.html`, so on a
 * case-insensitive volume — macOS APFS, the founder's machine — `pnpm start` serves `/en/EN/Roses`
 * shapes out of the correctly-cased file and answers 200. On the case-sensitive Linux of CI, the
 * preview and production, the segment is simply not in `generateStaticParams`,
 * `dynamicParams = false` refuses it at the routing layer, and the 404 document answers.
 * `experimental.caseSensitiveRoutes` was tried and does not change the prerender lookup (16.3.4).
 *
 * The predicate is therefore about the **target host**, not about the machine Playwright runs on:
 * a suite run from a Mac against the preview or Railway is testing Linux and must run the case.
 * Lifted verbatim from `tests/e2e/locale-routing.spec.ts:45` (TASK-034), which is the repo's
 * precedent for this; `tests/e2e/corridor.spec.ts` is **not** — its mis-cased case has no skip at
 * all and is red on any local macOS run (carried forward for the orchestrator in
 * `docs/tasks/TASK-110.md`).
 */
export function skipsOnCaseInsensitiveHost(
  baseURL: string | undefined,
): boolean {
  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  return process.platform === "darwin" && local;
}
