/**
 * `src/lib/env.ts` behaviour (spec 001 AC-10, TASK-005; spec 002 AC-1 / AC-2 / T-03 / T-04,
 * TASK-013).
 *
 * The build-time gate itself is exercised by the `env-build-failure` CI job (T-11, spec 002 T-04);
 * these tests pin the schema semantics and the "no value in the message" guarantee that AC-10
 * depends on, using a sentinel value that must never appear in any output.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEV_UI_KEY,
  ENV_KEYS,
  EnvValidationError,
  clientEnvSchema,
  deploymentEnvironment,
  devUiEnabled,
  formatEnvIssues,
  parseEnv,
  PLACEHOLDER_VALUES,
  PSEUDO_LOCALES_KEY,
  pseudoLocalesEnabled,
  serverEnvSchema,
  validateEnv,
} from "../../src/lib/env.schema";
import { parseEnvFileKeys } from "../../scripts/env-check";

const SENTINEL = "sentinel-do-not-print-3f9a2c";

/** Copy of `validEnv` without `key`, without an unused destructuring binding. */
function without(key: string): Record<string, string> {
  const copy = { ...validEnv };
  delete copy[key];
  return copy;
}

const validEnv: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_VERCEL_ENV: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
  DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5432/fo_direct",
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  INTERNAL_CRON_SECRET: "placeholder-cron-secret",
  LOG_LEVEL: "info",
  R2_ACCOUNT_ID: "00000000000000000000000000000000",
  R2_BUCKET: "placeholder-bucket",
  R2_BACKUPS_BUCKET: "placeholder-backups-bucket",
  R2_S3_ENDPOINT:
    "https://00000000000000000000000000000000.eu.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "placeholder-r2-access-key-id",
  R2_SECRET_ACCESS_KEY: "placeholder-r2-secret-access-key",
  R2_PUBLIC_BASE_URL: "https://placeholder.r2.dev",
  NEON_API_KEY: "",
  NEON_PROJECT_ID: "",
  NEON_BRANCH: "",
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_SHA: "",
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "",
};

/** Real-looking values for every key the deployed environments must not see a placeholder in. */
const realValues: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/fo",
  DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/fo",
  INTERNAL_CRON_SECRET: "real-cron",
  R2_ACCOUNT_ID: "15460f39387572e5939ed70691a49040",
  R2_BUCKET: "flowersoverseas-media",
  R2_BACKUPS_BUCKET: "flowersoverseas-backups",
  R2_S3_ENDPOINT:
    "https://15460f39387572e5939ed70691a49040.eu.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "real-access-key-id",
  R2_SECRET_ACCESS_KEY: "real-secret-access-key",
  R2_PUBLIC_BASE_URL: "https://media.flowersoverseas.com",
};

const productionEnv: Record<string, string> = {
  ...validEnv,
  ...realValues,
  VERCEL_ENV: "production",
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
    expect(ENV_KEYS).toContain("DATABASE_URL_UNPOOLED");
    expect(ENV_KEYS).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("treats an empty value as absent for optional keys", () => {
    const result = validateEnv({ ...validEnv, SENTRY_DSN: "  " });
    expect(result.issues).toEqual([]);
    expect(result.server?.SENTRY_DSN).toBeUndefined();
  });

  it("reports a missing required key by name (AC-10)", () => {
    const result = validateEnv(without("R2_BUCKET"));
    expect(result.issues.map((issue) => issue.key)).toContain("R2_BUCKET");
  });

  it("reports a malformed value by name and never echoes it (AC-10)", () => {
    const result = validateEnv({
      ...validEnv,
      R2_S3_ENDPOINT: SENTINEL,
    });
    const message = formatEnvIssues(result.issues, "development");
    expect(message).toContain("R2_S3_ENDPOINT");
    expect(message).not.toContain(SENTINEL);
  });

  it("keeps every other variable's value out of the error message (AC-10)", () => {
    const source = {
      ...without("R2_BUCKET"),
      R2_SECRET_ACCESS_KEY: SENTINEL,
    };
    let thrown: unknown;
    try {
      parseEnv(source);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EnvValidationError);
    const error = thrown as EnvValidationError;
    expect(error.keys).toContain("R2_BUCKET");
    expect(error.message).toContain("R2_BUCKET");
    expect(error.message).not.toContain(SENTINEL);
    expect(error.message).not.toContain("placeholder-r2-secret-access-key");
  });

  it("rejects a DATABASE_URL that is not a postgres connection string", () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: "mysql://x/y" });
    expect(result.issues.map((issue) => issue.key)).toEqual(["DATABASE_URL"]);
  });

  it("rejects a DATABASE_URL_UNPOOLED that is not a postgres connection string", () => {
    const result = validateEnv({
      ...validEnv,
      DATABASE_URL_UNPOOLED: "https://neon.tech/fo",
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([
      "DATABASE_URL_UNPOOLED",
    ]);
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
      for (const key of [
        "DATABASE_URL",
        "DATABASE_URL_UNPOOLED",
        "INTERNAL_CRON_SECRET",
        "R2_ACCOUNT_ID",
        "R2_BUCKET",
        "R2_BACKUPS_BUCKET",
        "R2_S3_ENDPOINT",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_PUBLIC_BASE_URL",
        "NEXT_PUBLIC_SITE_URL",
      ]) {
        expect(keys, key).toContain(key);
      }
      expect(formatEnvIssues(result.issues, environment)).not.toContain(
        "placeholder-r2-access-key-id",
      );
    }
  });

  it("accepts real values in production", () => {
    expect(validateEnv(productionEnv).issues).toEqual([]);
  });
});

/**
 * Spec 002 AC-1 / AC-2 (TASK-013): the Neon + R2 contract, and the shapes that make a wrong paste
 * a build failure rather than a runtime 401.
 */
describe("Neon + R2 contract (spec 002 AC-1)", () => {
  it("carries both Neon URLs, the R2 keys and the optional Neon control-plane keys", () => {
    for (const key of [
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_BACKUPS_BUCKET",
      "R2_S3_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_BASE_URL",
      "NEON_API_KEY",
      "NEON_PROJECT_ID",
      "NEON_BRANCH",
      "INTERNAL_CRON_SECRET",
    ]) {
      expect(ENV_KEYS, key).toContain(key);
    }
  });

  it("treats the three Neon control-plane keys as optional (AC-24 degrades, never fails)", () => {
    for (const key of ["NEON_API_KEY", "NEON_PROJECT_ID", "NEON_BRANCH"]) {
      expect(validateEnv(without(key)).issues, key).toEqual([]);
    }
  });

  it("requires INTERNAL_CRON_SECRET (the /api/internal/* header secret)", () => {
    expect(
      validateEnv(without("INTERNAL_CRON_SECRET")).issues.map(
        (issue) => issue.key,
      ),
    ).toEqual(["INTERNAL_CRON_SECRET"]);
  });

  it("rejects an R2_ACCOUNT_ID that is not 32 hex characters, naming only that key", () => {
    for (const value of [
      "not-an-account-id",
      "15460F39387572E5939ED70691A49040",
      "15460f39387572e5939ed7069",
      "https://15460f39387572e5939ed70691a49040.eu.r2.cloudflarestorage.com",
    ]) {
      const result = validateEnv({ ...validEnv, R2_ACCOUNT_ID: value });
      expect(
        result.issues.map((issue) => issue.key),
        value,
      ).toEqual(["R2_ACCOUNT_ID"]);
      expect(
        formatEnvIssues(result.issues, "development"),
        value,
      ).not.toContain(value);
    }
  });

  it("requires https for the R2 endpoint and the public media base URL", () => {
    for (const key of ["R2_S3_ENDPOINT", "R2_PUBLIC_BASE_URL"]) {
      const result = validateEnv({ ...validEnv, [key]: "http://example.com" });
      expect(
        result.issues.map((issue) => issue.key),
        key,
      ).toEqual([key]);
    }
  });

  it("rejects a bucket name that is not a bucket name", () => {
    for (const value of ["FlowersOverseas", "a", "bucket_name", "-lead"]) {
      expect(
        validateEnv({ ...validEnv, R2_BUCKET: value }).issues.map(
          (issue) => issue.key,
        ),
        value,
      ).toEqual(["R2_BUCKET"]);
    }
  });

  it("never echoes an R2 secret in any message (AC-10)", () => {
    const result = validateEnv({
      ...validEnv,
      R2_SECRET_ACCESS_KEY: SENTINEL,
      R2_BUCKET: "NOT A BUCKET",
    });
    expect(formatEnvIssues(result.issues, "development")).not.toContain(
      SENTINEL,
    );
  });
});

/**
 * Spec 002 AC-2 / T-03 / T-04 (TASK-013): `ALLOW_PLACEHOLDER_ENV` and the three Supabase keys are
 * gone. The hatch existed for spec 001 only, when there was no database to point at; now that Neon
 * and R2 are provisioned, a deployed environment carrying a placeholder is a misconfiguration and
 * the build must fail for it.
 */
describe("no placeholder escape hatch, no Supabase keys (spec 002 AC-2)", () => {
  const repoRoot = resolve(__dirname, "../..");
  const read = (relative: string): string =>
    readFileSync(resolve(repoRoot, relative), "utf8");

  it("does not know the key at all, so setting it is an unknown-variable mistake", () => {
    expect(ENV_KEYS).not.toContain("ALLOW_PLACEHOLDER_ENV");
    expect(Object.keys(serverEnvSchema.shape)).not.toContain(
      "ALLOW_PLACEHOLDER_ENV",
    );
  });

  it("rejects placeholders in preview and production even when the old hatch is set", () => {
    for (const environment of ["preview", "production"] as const) {
      const keys = validateEnv({
        ...validEnv,
        VERCEL_ENV: environment,
        NEXT_PUBLIC_SITE_URL: "https://flowers-overseas.vercel.app",
      }).issues.map((issue) => issue.key);
      expect(keys, environment).toContain("DATABASE_URL");
      expect(keys, environment).toContain("R2_ACCESS_KEY_ID");
    }
  });

  it("keeps no Supabase key in either schema (AC-2)", () => {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(ENV_KEYS, key).not.toContain(key);
    }
    expect(PLACEHOLDER_VALUES.join(" ")).not.toContain("supabase");
    expect(PLACEHOLDER_VALUES.join(" ")).not.toContain("service-role");
  });

  it("has no ALLOW_PLACEHOLDER_ENV or Supabase key in the source, env files or workflows (AC-2)", () => {
    const files = [
      ".env.example",
      "src/lib/env.schema.ts",
      "src/lib/env.assert.ts",
      "src/lib/env.client.ts",
      "src/lib/env.ts",
      "scripts/env-check.ts",
      "tests/fixtures/env/valid.env",
      "tests/fixtures/env/extra-key.env",
      "tests/fixtures/env/missing-key.env",
      ".github/workflows/ci.yml",
      "docs/runbooks/vercel-setup.md",
      "docs/runbooks/local-setup.md",
      "docs/architecture.md",
      "README.md",
    ];
    for (const file of files) {
      const contents = read(file);
      expect(contents, file).not.toContain("ALLOW_PLACEHOLDER_ENV");
      expect(contents, file).not.toContain("SUPABASE");
    }
  });

  /**
   * T-03: `.env.example` and `ENV_KEYS` are equal **in both directions**, and neither mentions the
   * deleted keys. `pnpm env:check` enforces the same contract at the command line (T-12).
   */
  it("T-03: .env.example and ENV_KEYS are equal in both directions", () => {
    const fileKeys = parseEnvFileKeys(read(".env.example"));
    expect([...fileKeys].sort()).toEqual([...ENV_KEYS].sort());
    expect(new Set(fileKeys).size).toBe(fileKeys.length);
  });

  /**
   * T-04 (the unit half; the `env-build-failure` CI job runs the real `pnpm build`): a deployed
   * environment whose `DATABASE_URL` is still the `.env.example` placeholder fails, and the report
   * names **only** that key — the failure must be readable, not a wall of every key at once.
   */
  it("T-04: a placeholder DATABASE_URL in production fails, naming only that key", () => {
    const result = validateEnv({
      ...productionEnv,
      DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
    });
    expect(result.issues.map((issue) => issue.key)).toEqual(["DATABASE_URL"]);
    const report = formatEnvIssues(result.issues, "production");
    expect(report).toContain("DATABASE_URL");
    expect(report).not.toContain("user:pass");
  });

  it("T-04: the same placeholder is accepted in development and test", () => {
    expect(validateEnv(validEnv).issues).toEqual([]);
    expect(validateEnv({ ...validEnv, NODE_ENV: "test" }).issues).toEqual([]);
  });

  it("still rejects a non-https origin in a deployed environment", () => {
    const result = validateEnv({
      ...productionEnv,
      NEXT_PUBLIC_SITE_URL: "http://flowers-overseas.vercel.app",
    });
    expect(result.issues.map((issue) => issue.key)).toContain(
      "NEXT_PUBLIC_SITE_URL",
    );
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
      ...productionEnv,
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
        ...productionEnv,
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SITE_URL: "https://fo-preview.vercel.app",
        ENABLE_PSEUDO_LOCALES: "true",
      },
      {
        ...productionEnv,
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

/**
 * `ENABLE_DEV_UI` (T-30 / AC-28, TASK-045): the same contract for the component gallery.
 *
 * `/dev/components` is a development surface (spec 004 §2 "Component gallery", §12
 * "Environments"), so the schema refuses it in production for the same reason it refuses the
 * pseudo-locales: `next.config.ts` calls `assertEnv()` before Next compiles anything, which turns
 * "the gallery cannot be served from the production alias" into a build failure rather than a code
 * review. The route's own 404 with the flag off is asserted end to end
 * (`tests/e2e/dev-components.spec.ts`).
 */
describe("ENABLE_DEV_UI (TASK-045)", () => {
  it("is part of the environment contract", () => {
    expect(ENV_KEYS).toContain(DEV_UI_KEY);
    expect(DEV_UI_KEY).toBe("ENABLE_DEV_UI");
  });

  it("refuses `true` in production, naming the key and printing no value", () => {
    const result = validateEnv({
      ...productionEnv,
      ENABLE_DEV_UI: "true",
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([DEV_UI_KEY]);
    expect(result.issues[0]?.message).toContain("production");
    expect(result.issues[0]?.message).toContain("/dev/components");
    expect(result.issues[0]?.message).not.toContain("true`,");
  });

  it("accepts `true` on a preview and in development, and `false` anywhere", () => {
    for (const source of [
      { ...validEnv, ENABLE_DEV_UI: "true" },
      {
        ...productionEnv,
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SITE_URL: "https://fo-preview.vercel.app",
        ENABLE_DEV_UI: "true",
      },
      {
        ...productionEnv,
        ENABLE_DEV_UI: "false",
      },
    ]) {
      expect(validateEnv(source).issues).toEqual([]);
    }
  });

  it("rejects a value that is neither `true` nor `false`", () => {
    const result = validateEnv({ ...validEnv, ENABLE_DEV_UI: "yes" });
    expect(result.issues.map((issue) => issue.key)).toEqual([DEV_UI_KEY]);
  });

  it("treats anything but the exact string `true` as off", () => {
    expect(devUiEnabled({ ENABLE_DEV_UI: "true" })).toBe(true);
    for (const value of ["false", "TRUE", "1", " true", "", undefined]) {
      expect(devUiEnabled({ ENABLE_DEV_UI: value }), String(value)).toBe(false);
    }
    expect(devUiEnabled({})).toBe(false);
  });

  it("refuses both development flags at once, naming both keys", () => {
    const result = validateEnv({
      ...productionEnv,
      ENABLE_PSEUDO_LOCALES: "true",
      ENABLE_DEV_UI: "true",
    });
    expect(result.issues.map((issue) => issue.key).sort()).toEqual(
      [DEV_UI_KEY, PSEUDO_LOCALES_KEY].sort(),
    );
  });
});
