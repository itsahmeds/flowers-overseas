/**
 * The indexing-environment gate (spec 007 §6 "The environment gate", §12 "Environments and
 * order", §13 Q5, AC-9, AC-12; TASK-090).
 *
 * One question, asked in one place: **may this deployment be indexed at all?** Everything else in
 * `modules/seo` — the robots directive, `robots.txt`, sitemap membership — takes its answer from
 * here, so the site cannot open to crawlers on one surface and stay shut on another.
 *
 * The answer is `true` only when both hold:
 *
 *  1. the deployment environment is `production` — `deploymentEnvironment()` in
 *     `src/lib/env.schema.ts` is the **single small predicate** that maps the raw environment onto
 *     that value, and it is the one line ADR-0018 / spec 040's `APP_ENV` swap has to change (the
 *     note in that function already records why: on the ADR-0012 fallback host `VERCEL_ENV` is
 *     unset and the answer is `development`, which fails closed); and
 *  2. `NEXT_PUBLIC_SITE_URL` resolves to the canonical host. A `*.vercel.app` production alias is
 *     a production deployment and is crawlable, but it is not the site: indexing it would publish
 *     a second copy of every URL under a host we would then have to de-index (`plan/02` §2,
 *     ADR-0001 "one domain").
 *
 * Pure: the caller passes both facts, nothing is read here, and `www.` is not accepted — the
 * canonical host is the apex (`plan/02` §7 "`www` → apex"). A malformed URL is not an indexing
 * environment rather than a throw: this function is on the path of `robots.txt`, and the safe
 * answer to "I cannot tell" is "stay closed".
 */
import {
  type DeploymentEnvironment,
  type EnvSource,
  deploymentEnvironment,
} from "../../lib/env.schema.ts";

/**
 * The one host whose production deployment may be indexed (ADR-0001, `plan/02` §2). It is not a
 * message key and not user-facing copy: it is the identity of the site, and the same literal is
 * what `scripts/seo/generate-hreflang-fixtures.ts` already pins for the fixture base URL.
 */
export const CANONICAL_HOST = "flowersoverseas.com";

/** The two facts the gate is a function of. Both come from `src/lib/env.ts` at the call site. */
export interface DeploymentDescriptor {
  /** `deploymentEnvironment(process.env)`, i.e. `environment` from `@/lib/env`. */
  readonly environment: DeploymentEnvironment;
  /** `NEXT_PUBLIC_SITE_URL`. */
  readonly siteUrl: string;
}

/**
 * The two facts, read from a raw environment. The one place `NEXT_PUBLIC_SITE_URL` and
 * `deploymentEnvironment()` are put together, so every caller (the `robots.txt` route today, the
 * corridor route and the sitemap builder next) describes the same deployment.
 *
 * The caller passes `process.env` — the pattern `devUiEnabled(process.env)` and
 * `ga4MeasurementId(process.env)` already use — rather than this module importing
 * `src/lib/env.server.ts`: that module is `server-only` and parses at load, which would make the
 * `seo` module unimportable from a unit test and from the edge runtime for no gain. The value is
 * validated by `clientEnvSchema` at build time; an absent one yields the empty string, which is
 * not the canonical host, so the gate fails closed.
 */
export function deploymentDescriptor(source: EnvSource): DeploymentDescriptor {
  return {
    environment: deploymentEnvironment(source),
    siteUrl: source["NEXT_PUBLIC_SITE_URL"] ?? "",
  };
}

/** The host of `siteUrl`, lowercased and without a `www.` prefix, or `undefined` if unparseable. */
function hostOf(siteUrl: string): string | undefined {
  try {
    const { hostname } = new URL(siteUrl);
    const lower = hostname.toLowerCase();
    return lower.startsWith("www.") ? lower.slice("www.".length) : lower;
  } catch {
    return undefined;
  }
}

/**
 * Whether this deployment may be indexed (spec 007 §6). See the module header for the two terms.
 */
export function isIndexingEnvironment(
  deployment: DeploymentDescriptor,
): boolean {
  if (deployment.environment !== "production") return false;
  return hostOf(deployment.siteUrl) === CANONICAL_HOST;
}
