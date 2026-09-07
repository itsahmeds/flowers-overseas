/**
 * `src/lib/env.ts` behaviour (spec 001 AC-10, TASK-005).
 *
 * The build-time gate itself is exercised by the `env-build-failure` CI job (T-11); these tests
 * pin the schema semantics and the "no value in the message" guarantee that AC-10 depends on,
 * using a sentinel value that must never appear in any output.
 */
import { describe, expect, it } from "vitest";

import {
  ENV_KEYS,
  EnvValidationError,
  clientEnvSchema,
  deploymentEnvironment,
  formatEnvIssues,
  parseEnv,
  serverEnvSchema,
  validateEnv,
} from "../../src/lib/env.schema";

const SENTINEL = "sentinel-do-not-print-3f9a2c";

/** Copy of `validEnv` without `key`, without an unused destructuring binding. */
function without(key: string): Record<string, string> {
  const copy = { ...validEnv };
  delete copy[key];
  return copy;
}

const validEnv: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  NEXT_PUBLIC_VERCEL_ENV: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-role-key",
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  INTERNAL_CRON_SECRET: "placeholder-cron-secret",
  LOG_LEVEL: "info",
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_SHA: "",
};

describe("env schema", () => {
  it("accepts the .env.example placeholders in development", () => {
    const result = validateEnv(validEnv);
    expect(result.issues).toEqual([]);
    expect(result.server?.LOG_LEVEL).toBe("info");
  });

  it("splits keys into a NEXT_PUBLIC_ client schema and a server schema", () => {
    expect(
      Object.keys(clientEnvSchema.shape).every((k) =>
        k.startsWith("NEXT_PUBLIC_"),
      ),
    ).toBe(true);
    expect(
      Object.keys(serverEnvSchema.shape).some((k) =>
        k.startsWith("NEXT_PUBLIC_"),
      ),
    ).toBe(false);
    expect(ENV_KEYS).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(ENV_KEYS).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("treats an empty value as absent for optional keys", () => {
    const result = validateEnv({ ...validEnv, SENTRY_DSN: "  " });
    expect(result.issues).toEqual([]);
    expect(result.server?.SENTRY_DSN).toBeUndefined();
  });

  it("reports a missing required key by name (AC-10)", () => {
    const result = validateEnv(without("NEXT_PUBLIC_SUPABASE_URL"));
    expect(result.issues.map((issue) => issue.key)).toContain(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("reports a malformed value by name and never echoes it (AC-10)", () => {
    const result = validateEnv({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_URL: SENTINEL,
    });
    const message = formatEnvIssues(result.issues, "development");
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain(SENTINEL);
  });

  it("keeps every other variable's value out of the error message (AC-10)", () => {
    const source = {
      ...without("NEXT_PUBLIC_SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: SENTINEL,
    };
    let thrown: unknown;
    try {
      parseEnv(source);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EnvValidationError);
    const error = thrown as EnvValidationError;
    expect(error.keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(error.message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(error.message).not.toContain(SENTINEL);
    expect(error.message).not.toContain("placeholder-service-role-key");
  });

  it("rejects a DATABASE_URL that is not a postgres connection string", () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: "mysql://x/y" });
    expect(result.issues.map((issue) => issue.key)).toEqual(["DATABASE_URL"]);
  });

  it("rejects an unknown LOG_LEVEL and defaults it when absent", () => {
    expect(
      validateEnv({ ...validEnv, LOG_LEVEL: "chatty" }).issues[0]?.key,
    ).toBe("LOG_LEVEL");
    expect(validateEnv(without("LOG_LEVEL")).server?.LOG_LEVEL).toBe("info");
  });

  it("derives the deployment environment from VERCEL_ENV, then NODE_ENV", () => {
    expect(deploymentEnvironment({ VERCEL_ENV: "production" })).toBe(
      "production",
    );
    expect(deploymentEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(deploymentEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(deploymentEnvironment({})).toBe("development");
  });

  it("rejects .env.example placeholders and non-https origins in preview and production", () => {
    for (const environment of ["preview", "production"] as const) {
      const result = validateEnv({ ...validEnv, VERCEL_ENV: environment });
      const keys = result.issues.map((issue) => issue.key);
      expect(keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(keys).toContain("DATABASE_URL");
      expect(keys).toContain("NEXT_PUBLIC_SITE_URL");
      expect(formatEnvIssues(result.issues, environment)).not.toContain(
        "placeholder-anon-key",
      );
    }
  });

  it("accepts real values in production", () => {
    const result = validateEnv({
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://real.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "real-anon",
      DATABASE_URL: "postgresql://u:p@db.example.com:5432/fo",
      SUPABASE_SERVICE_ROLE_KEY: "real-service-role",
      INTERNAL_CRON_SECRET: "real-cron",
    });
    expect(result.issues).toEqual([]);
  });
});
