/**
 * TASK-503: `next build` imports every route module to collect page data, and the container build
 * holds only `APP_ENV` and `NEXT_PUBLIC_*`. A module that reads the server environment at import
 * time throws `EnvValidationError` there and fails the deploy. The payment wiring and the routes
 * that use it must import cleanly with no server secret present.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BUILD_ENV = {
  APP_ENV: "staging",
  NEXT_PUBLIC_APP_ENV: "staging",
  NEXT_PUBLIC_SITE_URL: "https://staging.flowersoverseas.com",
  NODE_ENV: "test",
} as const;

vi.mock("server-only", () => ({}));

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...BUILD_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = saved;
  vi.resetModules();
});

describe("no server env read at import time (TASK-503)", () => {
  it("the build environment really is missing the server keys", async () => {
    const { env } = await import("@/lib/env");
    expect(() => env.DATABASE_URL).toThrow();
  });

  it.each([
    "../../src/modules/payments/wiring.ts",
    "../../src/app/api/checkout/start/route.ts",
    "../../src/app/[locale]/(checkout)/checkout/return/route.ts",
  ])("%s imports without throwing", async (path) => {
    await expect(import(path)).resolves.toBeDefined();
  });
});
