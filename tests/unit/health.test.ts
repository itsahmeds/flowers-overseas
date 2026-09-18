/**
 * `src/lib/health.ts` (spec 001 §5.2, AC-14, TASK-006; spec 040 §5.6, AC-31 / T-31, TASK-098):
 * the `HealthResponse` contract and the builder. The over-the-wire shape is covered by
 * `health-route.test.ts` (unit), the latency and no-PII half by
 * `tests/integration/health-endpoint.test.ts`, and T-15 / T-31's live half by
 * `tests/e2e/health.spec.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  HEALTH_REGION_FALLBACK,
  HEALTH_VERSION_FALLBACK,
  HealthResponse,
  buildHealthResponse,
} from "../../src/lib/health";

/** A complete body; each test below breaks exactly one thing about it. */
const BODY = {
  status: "ok",
  version: "abc123",
  env: "preview",
  commit: "abc123",
  appEnv: "preview",
  region: "europe-west4",
} as const;

describe("HealthResponse schema (spec 001 §5.2, spec 040 AC-31)", () => {
  it("accepts the documented body", () => {
    expect(HealthResponse.parse(BODY)).toEqual(BODY);
  });

  /** The body without one field — `delete` on a copy, so no unused binding is introduced. */
  function without(field: keyof typeof BODY): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...BODY };
    delete copy[field];
    return copy;
  }

  it("requires every AC-31 field: status, commit, appEnv, region", () => {
    for (const field of ["status", "commit", "appEnv", "region"] as const) {
      expect(HealthResponse.safeParse(without(field)).success, field).toBe(
        false,
      );
    }
  });

  it("rejects a status other than ok", () => {
    expect(
      HealthResponse.safeParse({ ...BODY, status: "degraded" }).success,
    ).toBe(false);
  });

  it("rejects an unknown environment", () => {
    // `staging` became a real value with spec 040 §5.2 (TASK-097), so the unknown value here is
    // one that is genuinely not an environment. `test` is excluded on purpose: a test run is a
    // local run and reports `development` (see `reportedEnvironment`).
    for (const env of ["qa", "prod", "test", ""]) {
      expect(HealthResponse.safeParse({ ...BODY, env }).success, env).toBe(
        false,
      );
    }
  });

  it("accepts staging, which spec 040 §5.2 added to the environment set", () => {
    expect(
      HealthResponse.safeParse({ ...BODY, env: "staging", appEnv: "staging" })
        .success,
    ).toBe(true);
  });

  it("lets appEnv — unlike env — report a test run as itself", () => {
    expect(HealthResponse.safeParse({ ...BODY, appEnv: "test" }).success).toBe(
      true,
    );
    expect(HealthResponse.safeParse({ ...BODY, appEnv: "qa" }).success).toBe(
      false,
    );
  });

  it("rejects a missing or non-string version", () => {
    expect(HealthResponse.safeParse(without("version")).success).toBe(false);
    expect(HealthResponse.safeParse({ ...BODY, version: 1 }).success).toBe(
      false,
    );
  });
});

describe("buildHealthResponse", () => {
  it("reports the commit sha as both `commit` and spec 001's `version`", () => {
    expect(
      buildHealthResponse({
        environment: "production",
        version: "deadbeef",
        region: "europe-west4",
      }),
    ).toEqual({
      status: "ok",
      version: "deadbeef",
      env: "production",
      commit: "deadbeef",
      appEnv: "production",
      region: "europe-west4",
    });
  });

  it("falls back to a placeholder commit when no platform injects a SHA", () => {
    const body = buildHealthResponse({
      environment: "preview",
      version: undefined,
    });
    expect(body.version).toBe(HEALTH_VERSION_FALLBACK);
    expect(body.commit).toBe(HEALTH_VERSION_FALLBACK);
  });

  it("falls back to `local` when no platform names a region", () => {
    expect(
      buildHealthResponse({ environment: "development", version: "x" }).region,
    ).toBe(HEALTH_REGION_FALLBACK);
  });

  it("reports a test run as development in `env` and as itself in `appEnv`", () => {
    const body = buildHealthResponse({ environment: "test", version: "x" });
    expect(body.env).toBe("development");
    expect(body.appEnv).toBe("test");
    expect(
      buildHealthResponse({ environment: "development", version: "x" }).env,
    ).toBe("development");
  });

  it("reports staging as itself in both fields (the florist demo environment)", () => {
    const body = buildHealthResponse({
      environment: "staging",
      version: "x",
      region: "europe-west4",
    });
    expect(body.env).toBe("staging");
    expect(body.appEnv).toBe("staging");
  });
});
