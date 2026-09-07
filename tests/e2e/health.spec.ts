/**
 * T-15 / AC-14 (TASK-008): `GET /api/health` against the deployment named by
 * `PLAYWRIGHT_BASE_URL` (the Vercel preview in CI).
 *
 * The body is validated with the same zod schema the route builds it from (`@/lib/health`), so
 * this is a contract test, not a shape guess: if the route ever stops matching `HealthResponse`,
 * both the unit test and this e2e test fail.
 */
import { expect, test } from "@playwright/test";

import { HealthResponse } from "@/lib/health";

const REQUEST_ID_HEADER = "x-request-id";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A caller-supplied UUID v4 the route must echo back verbatim. */
const SUPPLIED_REQUEST_ID = "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b";

test.describe("GET /api/health", () => {
  test("answers 200 with a JSON body that validates against HealthResponse", async ({
    request,
  }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    // `application/json` prefix; a `; charset=utf-8` suffix is allowed.
    expect(response.headers()["content-type"]).toMatch(/^application\/json\b/);

    const body = HealthResponse.parse(await response.json());
    expect(body.status).toBe("ok");
    expect(body.version).not.toHaveLength(0);
  });

  test("is uncacheable and unindexable", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("issues an x-request-id, and echoes a caller's UUID v4", async ({
    request,
  }) => {
    const generated = await request.get("/api/health");
    expect(generated.headers()[REQUEST_ID_HEADER]).toMatch(UUID_V4);

    const echoed = await request.get("/api/health", {
      headers: { [REQUEST_ID_HEADER]: SUPPLIED_REQUEST_ID },
    });
    expect(echoed.headers()[REQUEST_ID_HEADER]).toBe(SUPPLIED_REQUEST_ID);
  });
});
