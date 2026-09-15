/**
 * The indexing-environment gate (spec 007 §6 "The environment gate", §12, §13 Q5, AC-9, AC-12;
 * TASK-090).
 *
 * The gate is what makes the whole spec implementable today: everything is built, rendered and
 * tested while the answer is `false`, and the §12 flip is a configuration act (domain →
 * `NEXT_PUBLIC_SITE_URL` → this predicate → `robots.txt` opens and `noindex` lifts on the
 * qualifying set). So the cases that matter are the ones that must **not** open it: a preview, a
 * `*.vercel.app` production alias (a real production deployment on a crawlable host), a
 * look-alike host, and anything unparseable.
 */
import { describe, expect, it } from "vitest";

import { deploymentEnvironment } from "../../src/lib/env.schema.ts";
import {
  CANONICAL_HOST,
  deploymentDescriptor,
  isIndexingEnvironment,
} from "../../src/modules/seo/index.ts";

describe("isIndexingEnvironment() (spec 007 §6)", () => {
  it("is true only for production on the canonical host", () => {
    expect(
      isIndexingEnvironment({
        environment: "production",
        siteUrl: `https://${CANONICAL_HOST}`,
      }),
    ).toBe(true);
  });

  it("accepts the `www.` form, which 301s to the apex (plan/02 §7)", () => {
    expect(
      isIndexingEnvironment({
        environment: "production",
        siteUrl: `https://www.${CANONICAL_HOST}/`,
      }),
    ).toBe(true);
  });

  it("is false in every environment other than production", () => {
    for (const environment of ["development", "test", "preview"] as const) {
      expect(
        isIndexingEnvironment({
          environment,
          siteUrl: `https://${CANONICAL_HOST}`,
        }),
      ).toBe(false);
    }
  });

  it("is false for a production deployment that is not on the canonical host", () => {
    for (const siteUrl of [
      "https://flowers-overseas.vercel.app",
      "https://flowersoverseas.com.example.net",
      "https://staging.flowersoverseas.com",
      "https://flowersoverseas.co",
      "http://localhost:3000",
    ]) {
      expect(
        isIndexingEnvironment({ environment: "production", siteUrl }),
      ).toBe(false);
    }
  });

  it("fails closed on a value that is not a URL", () => {
    for (const siteUrl of ["", CANONICAL_HOST, "not a url"]) {
      expect(
        isIndexingEnvironment({ environment: "production", siteUrl }),
      ).toBe(false);
    }
  });
});

describe("deploymentDescriptor() (the one place the two facts meet)", () => {
  it("derives the environment through `deploymentEnvironment()` — the APP_ENV swap point", () => {
    const source = {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: `https://${CANONICAL_HOST}`,
    };
    expect(deploymentDescriptor(source)).toEqual({
      environment: deploymentEnvironment(source),
      siteUrl: `https://${CANONICAL_HOST}`,
    });
    expect(isIndexingEnvironment(deploymentDescriptor(source))).toBe(true);
  });

  it("treats an absent NEXT_PUBLIC_SITE_URL as closed rather than throwing", () => {
    expect(deploymentDescriptor({ VERCEL_ENV: "production" })).toEqual({
      environment: "production",
      siteUrl: "",
    });
    expect(
      isIndexingEnvironment(deploymentDescriptor({ VERCEL_ENV: "production" })),
    ).toBe(false);
  });

  it("is closed on a Vercel preview and on the fallback host (VERCEL_ENV unset)", () => {
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({
          VERCEL_ENV: "preview",
          NEXT_PUBLIC_SITE_URL: `https://${CANONICAL_HOST}`,
        }),
      ),
    ).toBe(false);
    // ADR-0012 fallback host: no `VERCEL_ENV`, so `deploymentEnvironment()` says `development`
    // and the gate stays shut — the safe direction, recorded in `env.schema.ts`.
    expect(
      isIndexingEnvironment(
        deploymentDescriptor({
          NEXT_PUBLIC_SITE_URL: `https://${CANONICAL_HOST}`,
        }),
      ),
    ).toBe(false);
  });
});
