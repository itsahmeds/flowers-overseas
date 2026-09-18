/**
 * T-26 / AC-25 (spec 040 §5.3, TASK-098): the access wall as a deployment actually answers it.
 *
 * The suite runs against `PLAYWRIGHT_BASE_URL`. It needs to know what the *server* is configured
 * with, which is why it reads `STAGING_BASIC_AUTH` from its own environment: the same value the
 * deployment was given. Absent ⇒ the deployment has no wall (§12's absent-means-off) and the file
 * skips rather than asserting a gate nobody switched on. Locally:
 *
 *     pnpm build
 *     STAGING_BASIC_AUTH='user:pass' NEXT_PUBLIC_SITE_URL=http://localhost:3200 pnpm start -p 3200
 *     STAGING_BASIC_AUTH='user:pass' PLAYWRIGHT_BASE_URL=http://localhost:3200 \
 *       pnpm test:e2e tests/e2e/staging-auth.spec.ts
 */
import { expect, test } from "@playwright/test";

const credential = process.env.STAGING_BASIC_AUTH;
const configured = credential !== undefined && credential !== "";
const [username = "", password = ""] = (credential ?? "").split(":");

test.describe("the non-production access gate (AC-25)", () => {
  test.skip(
    !configured,
    "STAGING_BASIC_AUTH is not set for this deployment: no wall to assert",
  );

  test("answers 401 with WWW-Authenticate to an unauthenticated document request", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toMatch(/^Basic realm=/);
  });

  test("serves the document with the credential", async ({ playwright }) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      httpCredentials: { username, password },
    });
    const response = await context.get("/");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("<html");
    await context.dispose();
  });

  test("leaves /api/health open, unauthenticated", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    for (const field of ["commit", "appEnv", "region"]) {
      expect(body[field], field).toBeDefined();
    }
  });
});
