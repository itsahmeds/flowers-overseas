/**
 * `GET /api/health`: shape, no PII, no secret, no database call, under 200 ms (spec 040 AC-31 /
 * T-31; TASK-098).
 *
 * The integration layer because AC-31's claim is about the *endpoint*, not about a schema: it has
 * to hold for the handler as assembled, including the headers and the request-id echo, and the
 * "no database call" half is a fact about the module graph rather than about a value. The live
 * half — the same assertions against the deployed staging URL, and the uptime monitor that calls
 * it every minute — is `tests/e2e/health.spec.ts` plus the founder checklist in
 * `docs/runbooks/railway-cloudflare-setup.md`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HealthResponse, healthResponse } from "../../src/lib/health";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

const request = (): Request => new Request("https://example.test/api/health");
const input = {
  environment: "staging",
  version: "9f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
  region: "europe-west4",
} as const;

describe("GET /api/health (AC-31)", () => {
  it("answers 200 with status, commit, appEnv and region", async () => {
    const response = healthResponse(request(), input);
    expect(response.status).toBe(200);
    const body = HealthResponse.parse(await response.json());
    expect(body.status).toBe("ok");
    expect(body.commit).toBe(input.version);
    expect(body.appEnv).toBe("staging");
    expect(body.region).toBe("europe-west4");
  });

  it("carries no PII and no secret: the body has exactly six known fields", async () => {
    const body = (await healthResponse(request(), input).json()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual([
      "appEnv",
      "commit",
      "env",
      "region",
      "status",
      "version",
    ]);
    const serialised = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      "email",
      "phone",
      "address",
      "recipient",
      "ip",
      "token",
      "secret",
      "password",
      "postgres://",
      "database_url",
    ]) {
      expect(serialised, forbidden).not.toContain(forbidden);
    }
  });

  it("answers in well under 200 ms, 100 times in a row", () => {
    const started = performance.now();
    for (let index = 0; index < 100; index += 1) {
      healthResponse(request(), input);
    }
    const perCall = (performance.now() - started) / 100;
    expect(perCall).toBeLessThan(200);
  });

  it("makes no database call: neither the route nor the module imports the db", () => {
    for (const file of ["src/app/api/health/route.ts", "src/lib/health.ts"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/from\s+["'][^"']*\/db["']/u);
      expect(source, file).not.toMatch(/drizzle|postgres/u);
    }
  });

  it("is the Railway healthcheck target declared in config/railway.json", () => {
    const declared = JSON.parse(read("config/railway.json")) as {
      deploy: { healthcheckPath: string };
    };
    expect(declared.deploy.healthcheckPath).toBe("/api/health");
  });
});
