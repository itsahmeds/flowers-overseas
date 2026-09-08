/**
 * `src/proxy.ts` (spec 001 §5.2, §11, TASK-005; renamed in TASK-032, spec 003 AC-11, T-11): an
 * `x-request-id` on request and response, and exactly two `info` lines per request with nothing
 * but the §11 fields — behaviour identical to the `middleware.ts` this file replaces.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REQUEST_ID_HEADER } from "../../src/lib/request-id";
import { config, proxy } from "../../src/proxy";

const repoRoot = resolve(__dirname, "../..");

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMING = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function request(
  url: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new Request(url, { headers }));
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request-id proxy", () => {
  it("sets a UUID v4 x-request-id on the response when the request has none", () => {
    const capture = captureLogs();
    const response = proxy(request("https://example.com/"));
    capture.restore();
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_V4);
  });

  it("echoes a client-supplied UUID v4", () => {
    const capture = captureLogs();
    const response = proxy(
      request("https://example.com/", { [REQUEST_ID_HEADER]: INCOMING }),
    );
    capture.restore();
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(INCOMING);
  });

  it("propagates the id to the downstream request headers", () => {
    const capture = captureLogs();
    const response = proxy(
      request("https://example.com/", { [REQUEST_ID_HEADER]: INCOMING }),
    );
    capture.restore();
    // Next encodes overridden request headers on the proxy response.
    const overridden =
      response.headers.get("x-middleware-override-headers") ?? "";
    expect(overridden).toContain(REQUEST_ID_HEADER);
    expect(
      response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`),
    ).toBe(INCOMING);
  });

  it("logs exactly one start and one end info line with only the §11 fields", () => {
    const capture = captureLogs();
    proxy(
      request("https://example.com/api/health?email=a@b.c", {
        [REQUEST_ID_HEADER]: INCOMING,
      }),
    );
    capture.restore();

    const lines = capture.lines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "request start",
      method: "GET",
      path: "/api/health",
      request_id: INCOMING,
    });
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual([
      "level",
      "method",
      "msg",
      "path",
      "request_id",
      "time",
    ]);
    expect(lines[1]).toMatchObject({
      level: "info",
      msg: "request end",
      method: "GET",
      path: "/api/health",
      status: 200,
      request_id: INCOMING,
    });
    expect(typeof lines[1]?.["duration_ms"]).toBe("number");
    // No query string, therefore no PII, in any log line (spec 001 §8).
    expect(capture.lines.join("")).not.toContain("a@b.c");
  });
});

describe("the Next 16 proxy file convention (AC-11)", () => {
  it("leaves no middleware.ts behind, so no build prints the deprecation warning", () => {
    for (const candidate of [
      "src/middleware.ts",
      "src/middleware.js",
      "middleware.ts",
      "middleware.js",
    ]) {
      expect(existsSync(resolve(repoRoot, candidate)), candidate).toBe(false);
    }
    expect(existsSync(resolve(repoRoot, "src/proxy.ts"))).toBe(true);
  });

  it("keeps the spec 001 matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});
