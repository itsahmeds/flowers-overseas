/**
 * `pnpm railway:check` against recorded Railway API responses (spec 040 AC-9 / T-10, AC-11 /
 * T-11; TASK-098).
 *
 * A contract test rather than a unit test because the fixtures under `tests/fixtures/railway/`
 * are the shape of a boundary we do not own: if Railway renames `serviceInstances` or stops
 * returning `numReplicas`, the zod parse fails here, loudly, instead of the gate silently
 * reporting "no drift" on a response it no longer understands.
 *
 * The strongest assertion in the file is the negative one: **no line of output contains a
 * variable value**. Every value in the variable fixtures is the literal `SENTINEL-VALUE`, so the
 * check "stdout contains no sentinel" is mechanical rather than a judgement.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadDeclaredConfig,
  runRailwayCheck,
} from "../../scripts/railway-check.ts";
import {
  CONTRACT_VARIABLE_KEYS,
  PLATFORM_INJECTED_CONTRACT_KEYS,
  REQUIRED_VARIABLE_KEYS,
  railwayEnvironmentResponseSchema,
  railwayVariablesResponseSchema,
} from "../../src/lib/railway";

const repoRoot = resolve(__dirname, "../..");
const SENTINEL = "SENTINEL-VALUE";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(resolve(repoRoot, `tests/fixtures/railway/${name}`), "utf8"),
  );

const declared = loadDeclaredConfig(repoRoot);
const matching = railwayEnvironmentResponseSchema.parse(
  fixture("environment-staging.json"),
);
const drifted = railwayEnvironmentResponseSchema.parse(
  fixture("environment-drifted.json"),
);
const variables = (name: string) =>
  railwayVariablesResponseSchema.parse(fixture(name));

describe("the recorded Railway responses still parse (T-10)", () => {
  it("has the `web` service instance with the four AC-9 fields", () => {
    const node = matching.data.environment.serviceInstances.edges[0]?.node;
    expect(node?.serviceName).toBe("web");
    expect(node?.region).toBe("europe-west4");
    expect(node?.numReplicas).toBe(1);
    expect(node?.healthcheckPath).toBe("/api/health");
  });

  it("rejects a response missing the service list rather than passing it", () => {
    expect(
      railwayEnvironmentResponseSchema.safeParse({
        data: { environment: { name: "staging" } },
      }).success,
    ).toBe(false);
  });
});

describe("service drift (AC-9, T-10)", () => {
  it("passes on an environment that matches config/railway.json", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
    });
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("match config/railway.json");
  });

  it("fails naming each of the four wrong values", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: drifted,
    });
    expect(report.ok).toBe(false);
    const output = report.lines.join("\n");
    for (const field of [
      "region",
      "numReplicas",
      "healthcheckPath",
      "restartPolicyType",
      "restartPolicyMaxRetries",
    ]) {
      expect(output, field).toContain(field);
    }
    // The live value and the declared one are both named, so the fix is obvious.
    expect(output).toContain("numReplicas is 2");
    expect(output).toContain("declares 1");
    expect(output).toContain("healthcheckPath is unset");
  });

  it("fails when the environment has no `web` service at all", () => {
    const empty = railwayEnvironmentResponseSchema.parse({
      data: {
        environment: { name: "staging", serviceInstances: { edges: [] } },
      },
    });
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: empty,
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("not found");
  });
});

describe("the declared key set (AC-11)", () => {
  it("is AC-11's 28: the 26 of the env contract plus APP_ENV and NEXT_PUBLIC_APP_ENV", () => {
    expect(CONTRACT_VARIABLE_KEYS).toHaveLength(28);
    expect(CONTRACT_VARIABLE_KEYS).toContain("APP_ENV");
    expect(CONTRACT_VARIABLE_KEYS).toContain("NEXT_PUBLIC_APP_ENV");
  });

  it("requires 24 of them: the four Vercel keys are injected, never pasted", () => {
    expect(REQUIRED_VARIABLE_KEYS).toHaveLength(24);
    for (const key of PLATFORM_INJECTED_CONTRACT_KEYS) {
      expect(CONTRACT_VARIABLE_KEYS, key).toContain(key);
      expect(REQUIRED_VARIABLE_KEYS, key).not.toContain(key);
    }
  });
});

describe("variable key sets (AC-11, T-11)", () => {
  it("passes on the 28 contract keys plus the staging access switch", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("contract satisfied");
  });

  it("fails on a missing key, naming it", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-missing-key.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "missing key DATABASE_URL_UNPOOLED",
    );
  });

  it("fails on an extra key, naming it", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-extra-key.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "unexpected key STRIPE_SECRET_KEY",
    );
  });

  it("treats the staging switch as an extra key in production (AC-25: no wall there)", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "production",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "unexpected key STAGING_BASIC_AUTH",
    );
  });

  it("accepts the switch on a PR environment, which is gated like staging", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "pr-123",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(true);
  });

  it("never prints a variable value, on any of these runs", () => {
    for (const name of [
      "variables-staging.json",
      "variables-missing-key.json",
      "variables-extra-key.json",
    ]) {
      const report = runRailwayCheck({
        declared,
        environmentName: "staging",
        environment: drifted,
        variables: variables(name),
      });
      expect(report.lines.join("\n"), name).not.toContain(SENTINEL);
    }
  });
});
