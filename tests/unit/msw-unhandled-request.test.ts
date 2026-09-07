/**
 * T-19 / AC-18 (TASK-008): MSW is configured with `onUnhandledRequest: "error"`, so a unit test
 * that performs an unmocked `fetch` fails with the MSW unhandled-request error instead of
 * reaching the network.
 *
 * `example.invalid` is a reserved, guaranteed-unresolvable name (RFC 2606): if interception ever
 * regressed to a pass-through, the rejection below would be a DNS failure rather than an MSW
 * error, and this test would fail — which is the point. MSW prints the full
 * "intercepted a request without a matching request handler" report (with the request line) to
 * stderr and rejects the promise with the `"error"`-strategy message asserted here.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../msw/server.ts";

describe("MSW unhandled-request policy", () => {
  it("rejects an unmocked fetch with the MSW unhandled-request error", async () => {
    const rejection = await fetch("https://example.invalid/probe").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toMatch(/^\[MSW\]/);
    expect((rejection as Error).message).toMatch(
      /"error" strategy for the "onUnhandledRequest" option/,
    );
  });

  it("ships no handlers in 001, so every outbound call is unhandled", () => {
    expect(server.listHandlers()).toHaveLength(0);
  });

  it("lets a request through once a handler matches it", async () => {
    server.use(
      http.get("https://example.invalid/probe", () =>
        HttpResponse.json({ mocked: true }),
      ),
    );

    const response = await fetch("https://example.invalid/probe");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mocked: true });
  });
});
