/**
 * Spec 013 AC-10, env half (T-10; spec 010 AC-2; TASK-255): `validateEnv` refuses a live Stripe
 * key, `rk_live_` as well as `sk_live_` and `pk_live_`, in every `APP_ENV` other than
 * `production`, and accepts it in `production`. The keys are built at run time so no live-looking
 * token is ever committed (the gitleaks scan of `audit-secrets.test.ts` stays clean).
 */
import { describe, expect, it } from "vitest";

import {
  LIVE_STRIPE_KEY_PREFIXES,
  formatEnvIssues,
  validateEnv,
} from "../../src/lib/env.schema.ts";

const liveKey = (prefix: string): string => `${prefix}${"Zq7".repeat(10)}`;
const testKey = (kind: "sk" | "rk" | "pk"): string =>
  `${kind}_test_${"Zq7".repeat(10)}`;

/** An environment with real-looking values, clean in every one of the five environments. */
const base: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/fo",
  DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/fo",
  INTERNAL_CRON_SECRET: "real-cron",
  LOG_LEVEL: "info",
  R2_ACCOUNT_ID: "15460f39387572e5939ed70691a49040",
  R2_BUCKET: "flowersoverseas-media",
  R2_BACKUPS_BUCKET: "flowersoverseas-backups",
  R2_S3_ENDPOINT:
    "https://15460f39387572e5939ed70691a49040.eu.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "real-access-key-id",
  R2_SECRET_ACCESS_KEY: "real-secret-access-key",
  R2_PUBLIC_BASE_URL: "https://media.flowersoverseas.com",
};

const NON_PRODUCTION = ["development", "test", "preview", "staging"] as const;

const CASES = [
  ["STRIPE_SECRET_KEY", "rk_live_"],
  ["STRIPE_SECRET_KEY", "sk_live_"],
  ["STRIPE_PUBLISHABLE_KEY", "pk_live_"],
  // A live key in a variable no contract names is refused all the same.
  ["SOME_OTHER_VARIABLE", "rk_live_"],
] as const;

describe("live Stripe keys are refused outside production (spec 013 AC-10, T-10)", () => {
  it("names the three live prefixes", () => {
    expect([...LIVE_STRIPE_KEY_PREFIXES]).toEqual([
      "sk_live_",
      "rk_live_",
      "pk_live_",
    ]);
  });

  it.each(NON_PRODUCTION)(
    "the base environment is clean in %s",
    (environment) => {
      expect(validateEnv({ ...base, APP_ENV: environment }).issues).toEqual([]);
    },
  );

  for (const environment of NON_PRODUCTION) {
    it.each(CASES)(
      `${environment}: %s = %s… is refused, naming the key and never the value`,
      (key, prefix) => {
        const value = liveKey(prefix);
        const result = validateEnv({
          ...base,
          APP_ENV: environment,
          [key]: value,
        });
        expect(result.issues.map((issue) => issue.key)).toEqual([key]);
        const report = formatEnvIssues(result.issues, environment);
        expect(report).toContain(prefix);
        expect(report).not.toContain(value);
        expect(report).not.toContain("Zq7Zq7");
      },
    );
  }

  it("a value with leading whitespace is still a live key", () => {
    const result = validateEnv({
      ...base,
      APP_ENV: "staging",
      STRIPE_SECRET_KEY: `  ${liveKey("rk_live_")}`,
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
  });

  it("an unset APP_ENV is development, so a live key is refused there too", () => {
    const result = validateEnv({
      ...base,
      STRIPE_SECRET_KEY: liveKey("rk_live_"),
    });
    expect(result.issues.map((issue) => issue.key)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
  });

  it.each(CASES)("production: %s = %s… is accepted", (key, prefix) => {
    const result = validateEnv({
      ...base,
      APP_ENV: "production",
      [key]: liveKey(prefix),
    });
    expect(result.issues).toEqual([]);
  });

  it.each(NON_PRODUCTION)("%s: test keys are accepted", (environment) => {
    const result = validateEnv({
      ...base,
      APP_ENV: environment,
      STRIPE_SECRET_KEY: testKey("sk"),
      STRIPE_RESTRICTED_KEY: testKey("rk"),
      STRIPE_PUBLISHABLE_KEY: testKey("pk"),
    });
    expect(result.issues).toEqual([]);
  });
});
