/**
 * The edge suite's target guard: `tests/e2e/cloudflare-edge.spec.ts` never runs against
 * production (spec 040 §12 step 4; TASK-101). Kept apart from the spec so the contract file can
 * pin it without Playwright.
 */

/** The hosts the edge suite refuses: production is never a target of its POST floods. */
export const PRODUCTION_HOSTS: readonly string[] = [
  "flowersoverseas.com",
  "www.flowersoverseas.com",
];

/** The host a URL names, as DNS resolves it: lower case, with no trailing root dot. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return "";
  }
}

/** Why the suite must not run against `url`, or `undefined` when it may. */
export function productionRefusal(url: string): string | undefined {
  const host = hostOf(url);
  return PRODUCTION_HOSTS.includes(host)
    ? `STAGING_URL names production (${host}): this suite never runs there`
    : undefined;
}

/**
 * One probe under every clause of the bypass: each path, bare and under every locale prefix
 * (`bypassClauses` in `scripts/cloudflare/edge.ts` builds the same set of clauses).
 */
export function bypassProbes(
  paths: readonly string[],
  locales: readonly string[],
  probe: string,
): string[] {
  return ["", ...locales.map((code) => `/${code}`)].flatMap((prefix) =>
    paths.map((path) => `${prefix}${path.replace(/\/$/, "")}/${probe}`),
  );
}
