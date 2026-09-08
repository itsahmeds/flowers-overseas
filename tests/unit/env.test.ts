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
  PSEUDO_LOCALES_KEY,
  placeholderHatchEnabled,
  pseudoLocalesEnabled,
  serverEnvSchema,
  validateEnv,
} from "../../src/lib/env.schema";
import { warnOnPlaceholderHatch } from "../../src/lib/env.assert";

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
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "",
  ALLOW_PLACEHOLDER_ENV: "",
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

/**
 * `ALLOW_PLACEHOLDER_ENV` (TASK-007): spec 001 §5/§12 require a production deploy from `main`
 * while the real Supabase values only arrive with spec 002, so production must be able to run on
 * the `.env.example` placeholders — but only when the escape hatch is set explicitly.
 */
describe("ALLOW_PLACEHOLDER_ENV escape hatch (TASK-007)", () => {
  it("rejects placeholders in production without the hatch", () => {
    const result = validateEnv({
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
    });
    expect(result.issues.map((issue) => issue.key)).toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(placeholderHatchEnabled(validEnv)).toBe(false);
  });

  it("accepts placeholders in production with ALLOW_PLACEHOLDER_ENV=true", () => {
    const source = {
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      ALLOW_PLACEHOLDER_ENV: "true",
    };
    expect(validateEnv(source).issues).toEqual([]);
    expect(placeholderHatchEnabled(source)).toBe(true);
  });

  it("accepts placeholders in preview with the hatch too", () => {
    const source = {
      ...validEnv,
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      ALLOW_PLACEHOLDER_ENV: "true",
    };
    expect(validateEnv(source).issues).toEqual([]);
  });

  it("rejects any value other than the exact string true", () => {
    for (const value of ["TRUE", "1", "yes", "false", "true "]) {
      const result = validateEnv({ ...validEnv, ALLOW_PLACEHOLDER_ENV: value });
      expect(
        result.issues.map((issue) => issue.key),
        `accepted ALLOW_PLACEHOLDER_ENV=${value}`,
      ).toContain("ALLOW_PLACEHOLDER_ENV");
    }
  });

  it("does not enable the hatch for a non-true value, so production still fails", () => {
    const source = {
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      ALLOW_PLACEHOLDER_ENV: "1",
    };
    const keys = validateEnv(source).issues.map((issue) => issue.key);
    expect(keys).toContain("ALLOW_PLACEHOLDER_ENV");
    expect(keys).toContain("DATABASE_URL");
    expect(placeholderHatchEnabled(source)).toBe(false);
  });

  it("covers the committed http://localhost:3000 origin, so a 001 production build passes", () => {
    const result = validateEnv({
      ...validEnv,
      VERCEL_ENV: "production",
      ALLOW_PLACEHOLDER_ENV: "true",
    });
    expect(result.issues).toEqual([]);
  });

  it("still rejects a non-placeholder http origin in production, hatch or not", () => {
    for (const hatch of ["", "true"]) {
      const result = validateEnv({
        ...validEnv,
        VERCEL_ENV: "production",
        ALLOW_PLACEHOLDER_ENV: hatch,
        NEXT_PUBLIC_SITE_URL: "http://flowers-overseas.vercel.app",
      });
      expect(result.issues.map((issue) => issue.key)).toContain(
        "NEXT_PUBLIC_SITE_URL",
      );
    }
  });

  it("is a no-op in development, where placeholders are accepted anyway", () => {
    expect(
      validateEnv({ ...validEnv, ALLOW_PLACEHOLDER_ENV: "true" }).issues,
    ).toEqual([]);
  });

  it("warns exactly once, at assert time, when the hatch is used (TASK-007)", () => {
    const lines: string[] = [];
    const source = {
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      ALLOW_PLACEHOLDER_ENV: "true",
    };
    warnOnPlaceholderHatch(source, (line) => lines.push(line));
    warnOnPlaceholderHatch(source, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(parsed["level"]).toBe("warn");
    expect(parsed["msg"]).toContain("ALLOW_PLACEHOLDER_ENV");
    expect(parsed["environment"]).toBe("production");
  });

  it("does not warn when the hatch is unset", () => {
    const lines: string[] = [];
    warnOnPlaceholderHatch(validEnv, (line) => lines.push(line));
    expect(lines).toEqual([]);
  });
});

describe("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (TASK-007)", () => {
  it("is an optional client key so the browser Sentry release can be set", () => {
    expect(Object.keys(clientEnvSchema.shape)).toContain(
      "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
    );
    expect(
      validateEnv(without("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA")).issues,
    ).toEqual([]);
  });

  it("is parsed when present and blank-as-absent when empty", () => {
    expect(
      validateEnv({
        ...validEnv,
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "deadbeef",
      }).client?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    ).toBe("deadbeef");
    expect(
      validateEnv(validEnv).client?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    ).toBeUndefined();
  });
});

/**
 * `ENABLE_PSEUDO_LOCALES` (T-29 / AC-29, TASK-042): the pseudo-locales are a development
 * affordance, and the env schema is what keeps them out of production.
 *
 * The build failure itself is this refusal — `next.config.ts` calls `assertEnv()` before Next
 * compiles anything — so what is pinned here is the verdict per environment and the fact that the
 * message names the key and prints no value (AC-10).
 */
describe("ENABLE_PSEUDO_LOCALES (TASK-042)", () => {
  it("is part of the environment contract", () => {
    expect(ENV_KEYS).toContain(PSEUDO_LOCALES_KEY);
    expect(PSEUDO_LOCALES_KEY).toBe("ENABLE_PSEUDO_LOCALES");
  });

  it("refuses `true` in production, naming the key", () => {
    const result = validateEnv({
      ...validEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      ALLOW_PLACEHOLDER_ENV: "true",
      ENABLE_PSEUDO_LOCALES: "true",
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([
      PSEUDO_LOCALES_KEY,
    ]);
    expect(result.issues[0]?.message).toContain("production");
    expect(result.issues[0]?.message).not.toContain("true`,");
  });

  it("accepts `true` on a preview and in development, and `false` anywhere", () => {
    for (const source of [
      { ...validEnv, ENABLE_PSEUDO_LOCALES: "true" },
      {
        ...validEnv,
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SITE_URL: "https://fo-preview.vercel.app",
        ALLOW_PLACEHOLDER_ENV: "true",
        ENABLE_PSEUDO_LOCALES: "true",
      },
      {
        ...validEnv,
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
        ALLOW_PLACEHOLDER_ENV: "true",
        ENABLE_PSEUDO_LOCALES: "false",
      },
    ]) {
      expect(validateEnv(source).issues).toEqual([]);
    }
  });

  it("rejects a value that is neither `true` nor `false`", () => {
    const result = validateEnv({
      ...validEnv,
      ENABLE_PSEUDO_LOCALES: "yes",
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([
      PSEUDO_LOCALES_KEY,
    ]);
  });

  it("treats anything but the exact string `true` as off", () => {
    expect(pseudoLocalesEnabled({ ENABLE_PSEUDO_LOCALES: "true" })).toBe(true);
    for (const value of ["false", "TRUE", "1", " true", "", undefined]) {
      expect(
        pseudoLocalesEnabled({ ENABLE_PSEUDO_LOCALES: value }),
        String(value),
      ).toBe(false);
    }
    expect(pseudoLocalesEnabled({})).toBe(false);
  });
});
