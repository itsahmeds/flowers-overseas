/**
 * Spec 040 T-07 (AC-7), TASK-097 — `isIndexingEnvironment()` after the `APP_ENV` swap.
 *
 * The truth table is spec 007 T-13's, reproduced here rather than restated: the point of AC-7 is
 * that the *semantics* did not move when the source did. Two terms, both required —
 * `appEnvironment() === "production"` and the canonical-host comparison — and the fail-closed
 * answer to anything else, including a malformed URL.
 *
 * The rows spec 040 adds are the ones the old implementation could not express: `staging` (a new
 * value, non-`production`, therefore never indexable) and a `production` deployment on a host
 * that injects no `VERCEL_ENV` at all, which used to resolve to `development` and made the gate
 * permanently false off Vercel — the defect ADR-0018 named as the blocker for the whole move.
 *
 * NOTE for the merge: `src/modules/seo/environment.ts` is also created by PR #65 (spec 007
 * TASK-090). The file here is that file with `deploymentEnvironment()` replaced by
 * `appEnvironment()`; when #65 lands, the conflict resolution is that one import and one call.
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  deploymentDescriptor,
  isIndexingEnvironment,
} from "../../src/modules/seo/environment.ts";
import { deploymentEnvironments } from "../../src/lib/env.schema";

const CANONICAL = `https://${CANONICAL_HOST}`;

/** Spec 007 T-13's table: environment × host match. */
const TRUTH_TABLE: readonly {
  name: string;
  deployment: DeploymentDescriptor;
  indexable: boolean;
}[] = [
  {
    name: "production on the canonical host",
    deployment: { environment: "production", siteUrl: CANONICAL },
    indexable: true,
  },
  {
    name: "production on the canonical host with a trailing path",
    deployment: { environment: "production", siteUrl: `${CANONICAL}/en` },
    indexable: true,
  },
  {
    name: "production on www, which resolves to the apex",
    deployment: {
      environment: "production",
      siteUrl: `https://www.${CANONICAL_HOST}`,
    },
    indexable: true,
  },
  {
    name: "production on a Vercel alias",
    deployment: {
      environment: "production",
      siteUrl: "https://flowers-overseas.vercel.app",
    },
    indexable: false,
  },
  {
    name: "production on a Railway URL (spec 040's new host)",
    deployment: {
      environment: "production",
      siteUrl: "https://flowers-overseas-web.up.railway.app",
    },
    indexable: false,
  },
  {
    name: "preview on the canonical host",
    deployment: { environment: "preview", siteUrl: CANONICAL },
    indexable: false,
  },
  {
    name: "staging on the canonical host (spec 040's new value)",
    deployment: { environment: "staging", siteUrl: CANONICAL },
    indexable: false,
  },
  {
    name: "development on the canonical host",
    deployment: { environment: "development", siteUrl: CANONICAL },
    indexable: false,
  },
  {
    name: "test on the canonical host",
    deployment: { environment: "test", siteUrl: CANONICAL },
    indexable: false,
  },
  {
    name: "production with an unparseable site URL",
    deployment: { environment: "production", siteUrl: "not-a-url" },
    indexable: false,
  },
  {
    name: "production with no site URL at all",
    deployment: { environment: "production", siteUrl: "" },
    indexable: false,
  },
];

describe("isIndexingEnvironment truth table (spec 007 T-13, spec 040 AC-7)", () => {
  it.each(TRUTH_TABLE)("$name → $indexable", ({ deployment, indexable }) => {
    expect(isIndexingEnvironment(deployment)).toBe(indexable);
  });

  it("is false for every environment except production, on the canonical host", () => {
    for (const environment of deploymentEnvironments) {
      expect(
        isIndexingEnvironment({ environment, siteUrl: CANONICAL }),
        environment,
      ).toBe(environment === "production");
    }
  });
});

describe("the descriptor answers from appEnvironment (AC-7)", () => {
  it("reads APP_ENV, so a Railway production deployment can be indexable at all", () => {
    // The pre-spec-040 defect: with `VERCEL_ENV` unset this resolved to `development` and the
    // gate could never be true off Vercel (ADR-0018).
    expect(
      deploymentDescriptor({
        APP_ENV: "production",
        NEXT_PUBLIC_SITE_URL: CANONICAL,
        RAILWAY_ENVIRONMENT_NAME: "production",
      }),
    ).toEqual({ environment: "production", siteUrl: CANONICAL });
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({
          APP_ENV: "production",
          NEXT_PUBLIC_SITE_URL: CANONICAL,
          RAILWAY_ENVIRONMENT_NAME: "production",
        }),
      ),
    ).toBe(true);
  });

  it("still answers from the VERCEL_ENV fallback while Vercel stays linked", () => {
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({
          VERCEL_ENV: "production",
          NEXT_PUBLIC_SITE_URL: CANONICAL,
        }),
      ),
    ).toBe(true);
  });

  it("fails closed when nothing is set: unset APP_ENV is development", () => {
    expect(
      deploymentDescriptor({ NEXT_PUBLIC_SITE_URL: CANONICAL }).environment,
    ).toBe("development");
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({ NEXT_PUBLIC_SITE_URL: CANONICAL }),
      ),
    ).toBe(false);
  });

  it("fails closed when NEXT_PUBLIC_SITE_URL is absent", () => {
    expect(deploymentDescriptor({ APP_ENV: "production" }).siteUrl).toBe("");
    expect(
      isIndexingEnvironment(deploymentDescriptor({ APP_ENV: "production" })),
    ).toBe(false);
  });

  it("refuses staging even when it is configured with the canonical host", () => {
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({
          APP_ENV: "staging",
          NEXT_PUBLIC_SITE_URL: CANONICAL,
        }),
      ),
    ).toBe(false);
  });
});
