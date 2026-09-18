/**
 * `GET /api/health` over the wire (spec 001 AC-14, TASK-006).
 *
 * Exercises `healthResponse` — everything the route file does apart from reading `@/lib/env`,
 * which is `server-only` and therefore not importable outside a Next build. `x-request-id` is the
 * header `src/proxy.ts` put on the request. T-15 (TASK-008) re-checks the same assertions
 * against a real deployment.
 */
import { describe, expect, it } from "vitest";

import { HealthResponse, healthResponse } from "../../src/lib/health";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMING = "11111111-1111-4111-8111-111111111111";

const input = {
  environment: "preview",
  version: "abc123",
  region: "europe-west4",
} as const;

function get(headers: Record<string, string> = {}): Response {
  return healthResponse(
    new Request("https://example.test/api/health", { headers }),
    input,
  );
}

describe("GET /api/health", () => {
  it("returns 200 with a body validating against HealthResponse", async () => {
    const response = get();
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(HealthResponse.parse(body)).toEqual({
      status: "ok",
      version: "abc123",
      env: "preview",
      // Spec 040 AC-31 (TASK-098) added these three.
      commit: "abc123",
      appEnv: "preview",
      region: "europe-west4",
    });
  });

  it("sets Content-Type: application/json, no-store and X-Robots-Tag: noindex", () => {
    const response = get();
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("echoes a UUID v4 x-request-id supplied by the caller", () => {
    expect(get({ "x-request-id": INCOMING }).headers.get("x-request-id")).toBe(
      INCOMING,
    );
  });

  it("emits a fresh UUID v4 when no request id reached the handler", () => {
    const id = get().headers.get("x-request-id");
    expect(id).toMatch(UUID_V4);
  });

  it("never echoes a non-UUID request id (no client-controlled log content)", () => {
    const id = get({ "x-request-id": "../../etc/passwd" }).headers.get(
      "x-request-id",
    );
    expect(id).not.toBe("../../etc/passwd");
    expect(id).toMatch(UUID_V4);
  });

  it("sets no cookie (spec 001 §8: nothing in 001 needs consent)", () => {
    expect(get().headers.get("set-cookie")).toBeNull();
  });
});
