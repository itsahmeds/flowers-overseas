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
  APP_ENV_KEY,
  DEV_UI_KEY,
  ENV_KEYS,
  EnvValidationError,
  NEXT_PUBLIC_APP_ENV_KEY,
  UNPARSEABLE_APP_ENV_MESSAGE,
  appEnvironment,
  clientEnvSchema,
  devUiEnabled,
  formatEnvIssues,
  parseEnv,
  PLACEHOLDER_VALUES,
  PSEUDO_LOCALES_KEY,
  pseudoLocalesEnabled,
  serverEnvSchema,
  BUILD_ENV_KEYS,
  RUNTIME_ENV_KEYS,
  assertRuntimeEnv,
  validateBuildEnv,
  validateEnv,
  validateRuntimeEnv,
} from "../../src/lib/env.schema";
import { assertBuildEnv } from "../../src/lib/env.assert";
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
  NEXT_PUBLIC_APP_ENV: "",
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
  APP_ENV: "",
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

// Spec 040 §5.2 (TASK-097): the deployed fixture is keyed on `APP_ENV` now, not `VERCEL_ENV`.
// The `VERCEL_ENV` fallback keeps its own coverage in `tests/unit/app-env.test.ts` (T-01).
const productionEnv: Record<string, string> = {
  ...validEnv,
  ...realValues,
  APP_ENV: "production",
};

/** The same, for each of the three deployed environments spec 040 AC-5 names. */
function deployedEnv(
  environment: "preview" | "staging" | "production",
): Record<string, string> {
  return { ...productionEnv, APP_ENV: environment };
}

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

  // The full resolution table is spec 040 T-01, in `tests/unit/app-env.test.ts`. What this
  // file keeps is the one line that matters to *it*: which environment `validateEnv()` grades
  // against.
  it("derives the deployment environment from APP_ENV, then VERCEL_ENV, then NODE_ENV", () => {
    expect(appEnvironment({ APP_ENV: "staging" })).toBe("staging");
    expect(appEnvironment({ VERCEL_ENV: "production" })).toBe("production");
    expect(appEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(appEnvironment({})).toBe("development");
  });

  // Spec 040 AC-5 widened this from `preview | production` to `preview | staging | production`.
  it("rejects .env.example placeholders and non-https origins in every deployed environment", () => {
    for (const environment of ["preview", "staging", "production"] as const) {
      const result = validateEnv({ ...validEnv, APP_ENV: environment });
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

  it("rejects placeholders in every deployed environment even when the old hatch is set", () => {
    for (const environment of ["preview", "production"] as const) {
      const keys = validateEnv({
        ...validEnv,
        APP_ENV: environment,
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
        APP_ENV: "preview",
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
        APP_ENV: "preview",
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

const repoFile = (relative: string): string =>
  readFileSync(resolve(__dirname, "../..", relative), "utf8");

/**
 * Spec 040 T-03 / T-05 / T-29 (AC-3, AC-5, AC-28), TASK-097 — the environment contract after the
 * `APP_ENV` swap. The resolution order itself is `tests/unit/app-env.test.ts`; what is asserted
 * here is what `validateEnv()` does with the answer.
 */
describe("the APP_ENV contract (spec 040 AC-3, T-03)", () => {
  it("carries APP_ENV and NEXT_PUBLIC_APP_ENV, and 28 keys in total", () => {
    expect(ENV_KEYS).toContain(APP_ENV_KEY);
    expect(ENV_KEYS).toContain(NEXT_PUBLIC_APP_ENV_KEY);
    // PR #62's 26-key contract plus the two spec 040 adds. The number is spelled out because
    // AC-3 is about the count agreeing from both sides, and `.env.example` is checked against
    // this same list above (T-03).
    expect(ENV_KEYS).toHaveLength(28);
    expect(new Set(ENV_KEYS).size).toBe(ENV_KEYS.length);
  });

  it("puts APP_ENV on the server side and its mirror on the client side", () => {
    expect(Object.keys(serverEnvSchema.shape)).toContain(APP_ENV_KEY);
    expect(Object.keys(clientEnvSchema.shape)).toContain(
      NEXT_PUBLIC_APP_ENV_KEY,
    );
  });

  it("keeps NEXT_PUBLIC_VERCEL_ENV optional, in the schema and unread by app code", () => {
    expect(Object.keys(clientEnvSchema.shape)).toContain(
      "NEXT_PUBLIC_VERCEL_ENV",
    );
    // Optional: absent and blank both parse.
    expect(clientEnvSchema.safeParse(validEnv).success).toBe(true);
    expect(validateEnv(without("NEXT_PUBLIC_VERCEL_ENV")).issues).toEqual([]);
    // Unread: `src/lib/env.client.ts` no longer materialises it, so nothing can consume it.
    expect(repoFile("src/lib/env.client.ts")).not.toContain(
      // Assembled, not written: `pnpm check:no-vercel-env` scans this file too (spec 040 AC-2).
      `process.env.${"NEXT_PUBLIC_VERCEL_ENV"}`,
    );
  });

  it("accepts every one of the five values for both keys, and blank for both", () => {
    for (const value of [
      "development",
      "test",
      "preview",
      "staging",
      "production",
    ] as const) {
      const source = {
        ...productionEnv,
        APP_ENV: value,
        NEXT_PUBLIC_APP_ENV: value,
        // A deployed value needs real values and an https origin, which `productionEnv` has.
        ENABLE_PSEUDO_LOCALES: "false",
        ENABLE_DEV_UI: "false",
      };
      expect(validateEnv(source).issues, value).toEqual([]);
    }
  });

  it("reports an unparseable APP_ENV as an issue naming the key and no value (AC-1)", () => {
    const result = validateEnv({ ...validEnv, APP_ENV: "prod" });
    const keys = result.issues.map((issue) => issue.key);
    expect(keys).toContain(APP_ENV_KEY);
    const report = formatEnvIssues(result.issues, "development");
    expect(report).toContain(UNPARSEABLE_APP_ENV_MESSAGE);
    expect(report).not.toContain("`prod`");
  });
});

describe("the deployed-environment rules widen to staging (spec 040 AC-5, T-05)", () => {
  it.each(["preview", "staging", "production"] as const)(
    "%s rejects every REAL_VALUE_REQUIRED placeholder and an http origin",
    (environment) => {
      const result = validateEnv({ ...validEnv, APP_ENV: environment });
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
        expect(keys, `${environment}/${key}`).toContain(key);
      }
      expect(formatEnvIssues(result.issues, environment)).not.toContain(
        "placeholder-r2-access-key-id",
      );
    },
  );

  it.each(["preview", "staging", "production"] as const)(
    "%s rejects an http NEXT_PUBLIC_SITE_URL on its own",
    (environment) => {
      const result = validateEnv({
        ...deployedEnv(environment),
        NEXT_PUBLIC_SITE_URL: "http://flowersoverseas.com",
      });
      expect(result.issues.map((issue) => issue.key)).toEqual([
        "NEXT_PUBLIC_SITE_URL",
      ]);
    },
  );

  // The one place `staging` differs from `preview`: it is shown to florists, so the two
  // development affordances are refused there as they are in production (spec 040 §5.2).
  it.each([PSEUDO_LOCALES_KEY, DEV_UI_KEY] as const)(
    "refuses %s in production and staging, and allows it on a preview",
    (key) => {
      for (const environment of ["production", "staging"] as const) {
        const result = validateEnv({
          ...deployedEnv(environment),
          [key]: "true",
        });
        expect(
          result.issues.map((issue) => issue.key),
          environment,
        ).toEqual([key]);
        expect(result.issues[0]?.message, environment).toContain(environment);
        expect(result.issues[0]?.message, environment).not.toContain("`true`,");
      }
      expect(
        validateEnv({
          ...deployedEnv("preview"),
          NEXT_PUBLIC_SITE_URL: "https://fo-preview.up.railway.app",
          [key]: "true",
        }).issues,
      ).toEqual([]);
    },
  );

  it("refuses both flags at once in staging, naming both keys", () => {
    const result = validateEnv({
      ...deployedEnv("staging"),
      ENABLE_PSEUDO_LOCALES: "true",
      ENABLE_DEV_UI: "true",
    });
    expect(result.issues.map((issue) => issue.key).sort()).toEqual(
      [DEV_UI_KEY, PSEUDO_LOCALES_KEY].sort(),
    );
  });

  it("leaves development and test untouched: both flags are a local affordance", () => {
    expect(
      validateEnv({
        ...validEnv,
        ENABLE_PSEUDO_LOCALES: "true",
        ENABLE_DEV_UI: "true",
      }).issues,
    ).toEqual([]);
  });
});

/**
 * T-29 / AC-28: the `env-build-failure` job builds with `APP_ENV=production` and a placeholder.
 * The real `pnpm build` is the CI job (and the local gate run recorded in the PR); what is pinned
 * here is the report that build prints — non-empty (so the build exits non-zero), naming the
 * offending key, and echoing no other variable's value.
 */
describe("the env-build-failure reproduction (spec 040 AC-28, T-29)", () => {
  it("fails with APP_ENV=production and a placeholder, naming only that key", () => {
    const result = validateEnv({
      ...productionEnv,
      APP_ENV: "production",
      DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
      R2_SECRET_ACCESS_KEY: SENTINEL,
    });
    expect(result.issues.map((issue) => issue.key)).toEqual(["DATABASE_URL"]);
    const report = formatEnvIssues(result.issues, "production");
    expect(report).toContain(
      "DATABASE_URL: must be a real value in production",
    );
    // AC-28: no other variable's value is echoed.
    expect(report).not.toContain(SENTINEL);
    expect(report).not.toContain("user:pass");
  });

  it("is keyed on APP_ENV rather than VERCEL_ENV, which is what makes it host-agnostic", () => {
    // The same source with neither key set is a development build and passes: it is `APP_ENV`
    // alone that promotes it to a deployed environment.
    const withoutSignal = { ...productionEnv, APP_ENV: "" };
    expect(
      validateEnv({
        ...withoutSignal,
        DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
      }).issues,
    ).toEqual([]);
  });

  it("the CI job sets APP_ENV, not VERCEL_ENV (AC-28)", () => {
    const workflow = repoFile(".github/workflows/ci.yml");
    expect(workflow).toContain("APP_ENV: production");
    expect(workflow).not.toContain("VERCEL_ENV: production");
  });
});

/**
 * The build/runtime split of spec 001 §14 A16 and spec 040 §14 A1 (TASK-135).
 *
 * The defect it fixes: `next.config.ts` asserted all 28 keys at config load, so `RUN pnpm build`
 * inside the container demanded ten credentials no build reads — the Railway staging build log of
 * 2026-09-18. The two halves are pinned here as *behaviour*; `tests/unit/container.test.ts` pins
 * them against the `Dockerfile`'s build-argument set.
 */
describe("the build/runtime split (spec 001 §14 A16, TASK-135)", () => {
  /** Exactly what a credential-free `docker build` has: the ARG defaults of the build stage. */
  const buildOnly: Record<string, string> = {
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SITE_URL: "https://web-staging-dbe4.up.railway.app",
  };

  it("grades APP_ENV and the NEXT_PUBLIC_ keys at build time, and nothing else", () => {
    expect([...BUILD_ENV_KEYS]).toEqual(
      [APP_ENV_KEY, ...Object.keys(clientEnvSchema.shape)].sort(),
    );
    for (const key of BUILD_ENV_KEYS) {
      expect(key === APP_ENV_KEY || key.startsWith("NEXT_PUBLIC_"), key).toBe(
        true,
      );
    }
  });

  it("grades every other key at server start, losing none of them", () => {
    expect([...BUILD_ENV_KEYS, ...RUNTIME_ENV_KEYS].sort()).toEqual([
      ...ENV_KEYS,
    ]);
    for (const key of RUNTIME_ENV_KEYS) {
      expect(BUILD_ENV_KEYS, key).not.toContain(key);
    }
  });

  it("passes the build gate with the ten server keys absent (the container build)", () => {
    expect(validateBuildEnv(buildOnly).issues).toEqual([]);
    expect(() => {
      assertBuildEnv(buildOnly);
    }).not.toThrow();
  });

  it("fails the runtime gate on the same environment, naming the ten keys and no value", () => {
    const issues = validateRuntimeEnv(buildOnly).issues;
    expect(issues.map((issue) => issue.key)).toEqual([
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_BACKUPS_BUCKET",
      "R2_S3_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_BASE_URL",
      "INTERNAL_CRON_SECRET",
    ]);
    let thrown: unknown;
    try {
      assertRuntimeEnv({ ...buildOnly, R2_SECRET_ACCESS_KEY: SENTINEL });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EnvValidationError);
    const message = (thrown as EnvValidationError).message;
    expect(message).toContain("Invalid environment (staging)");
    expect(message).not.toContain(SENTINEL);
    expect(message).not.toContain(buildOnly["NEXT_PUBLIC_SITE_URL"]);
  });

  it("still fails the build on a missing or malformed *build* key", () => {
    expect(
      validateBuildEnv({ APP_ENV: "staging" }).issues.map((issue) => issue.key),
    ).toEqual(["NEXT_PUBLIC_SITE_URL"]);
    expect(
      validateBuildEnv({ ...buildOnly, APP_ENV: "prod" }).issues.map(
        (issue) => issue.key,
      ),
    ).toEqual([APP_ENV_KEY]);
    expect(
      validateBuildEnv({
        ...buildOnly,
        NEXT_PUBLIC_SITE_URL: "http://staging.example.com",
      }).issues.map((issue) => issue.key),
    ).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("refuses a development flag in a production-like environment at server start", () => {
    for (const key of [PSEUDO_LOCALES_KEY, DEV_UI_KEY]) {
      const source = {
        ...validEnv,
        ...realValues,
        APP_ENV: "staging",
        [key]: "true",
      };
      expect(validateBuildEnv(source).issues).toEqual([]);
      expect(
        validateRuntimeEnv(source).issues.map((issue) => issue.key),
      ).toEqual([key]);
    }
  });

  it("keeps validateEnv the union of the two halves, so nothing falls between them", () => {
    for (const source of [validEnv, productionEnv, buildOnly, {}]) {
      expect(
        validateEnv(source)
          .issues.map((issue) => issue.key)
          .sort(),
      ).toEqual(
        [
          ...validateBuildEnv(source).issues.map((issue) => issue.key),
          ...validateRuntimeEnv(source).issues.map((issue) => issue.key),
        ].sort(),
      );
    }
  });
});
