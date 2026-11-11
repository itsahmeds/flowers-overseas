/**
 * Request each URL once, so the edge holds its HTML before a buyer asks (spec 012b §2.3, §5.4
 * "CWV"; TASK-296). The function behind `pnpm cache:warm` and the publish job's last step after a
 * run is `verified` (AC-7: "every added URL is requested exactly once").
 *
 * Node-runnable (no imports beyond Node's own): `scripts/cache-warm.ts` runs it directly.
 *
 * One `GET` per distinct path, in order, one at a time: a publish adds tens of URLs, not
 * thousands, and a serial walk never competes with buyers for the single replica. A failure is
 * counted, never thrown: the publish is already live, and a cold page only costs its first
 * visitor a render. Paths only, never a query string; no URL is logged by this module.
 */

/** What a warm did: the paths answered 2xx, and the rest. */
export interface WarmOutcome {
  readonly ok: number;
  readonly failed: number;
}

/** Each path must be site-relative: `/` and no scheme, host, query or fragment. */
const SITE_PATH = /^\/[^\s?#]*$/u;

/** Request each distinct path of `paths` once, through `baseUrl`. */
export async function warmUrls(
  paths: readonly string[],
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<WarmOutcome> {
  let ok = 0;
  let failed = 0;
  for (const path of new Set(paths)) {
    if (!SITE_PATH.test(path) || path.startsWith("//")) {
      failed += 1;
      continue;
    }
    try {
      const response = await fetchImpl(new URL(path, baseUrl), {
        method: "GET",
        redirect: "manual",
      });
      if (response.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}
