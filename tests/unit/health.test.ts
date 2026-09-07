/**
 * `src/lib/health.ts` (spec 001 §5.2, AC-14, TASK-006): the `HealthResponse` contract and the
 * builder. The over-the-wire shape is covered by `health-route.test.ts` (unit) and T-15 (e2e,
 * TASK-008).
 */
import { describe, expect, it } from "vitest";

import {
  HEALTH_VERSION_FALLBACK,
  HealthResponse,
  buildHealthResponse,
} from "../../src/lib/health";

describe("HealthResponse schema (spec 001 §5.2)", () => {
  it("accepts the documented body", () => {
    expect(
      HealthResponse.parse({ status: "ok", version: "abc123", env: "preview" }),
    ).toEqual({ status: "ok", version: "abc123", env: "preview" });
  });

  it("rejects a status other than ok", () => {
    expect(
      HealthResponse.safeParse({
        status: "degraded",
        version: "abc123",
        env: "preview",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown environment", () => {
    expect(
      HealthResponse.safeParse({
        status: "ok",
        version: "abc123",
        env: "staging",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing or non-string version", () => {
    expect(
      HealthResponse.safeParse({ status: "ok", env: "production" }).success,
    ).toBe(false);
    expect(
      HealthResponse.safeParse({ status: "ok", version: 1, env: "production" })
        .success,
    ).toBe(false);
  });
});

describe("buildHealthResponse", () => {
  it("reports the commit sha as the version", () => {
    expect(
      buildHealthResponse({ environment: "production", version: "deadbeef" }),
    ).toEqual({ status: "ok", version: "deadbeef", env: "production" });
  });

  it("falls back to a placeholder version when VERCEL_GIT_COMMIT_SHA is absent", () => {
    expect(
      buildHealthResponse({ environment: "preview", version: undefined })
        .version,
    ).toBe(HEALTH_VERSION_FALLBACK);
  });

  it("reports a test run as development, the schema having no `test` value", () => {
    expect(buildHealthResponse({ environment: "test", version: "x" }).env).toBe(
      "development",
    );
    expect(
      buildHealthResponse({ environment: "development", version: "x" }).env,
    ).toBe("development");
  });
});
