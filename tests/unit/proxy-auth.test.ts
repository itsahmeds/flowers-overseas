/**
 * The access gate as wired into `src/proxy.ts` (spec 040 §5.3, §5.6, AC-25 / T-26; TASK-098).
 *
 * `tests/unit/basic-auth.test.ts` owns the decision table; this file owns the wiring: the module
 * reads `STAGING_BASIC_AUTH` and `APP_ENV` **once at load**, so each case re-imports the module
 * with a different environment — which is also the proof that a redeploy, not a request, is what
 * changes the gate. The credential never appears in a log line.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const CREDENTIAL = "florist:sekret-passphrase";
const HEADER = `Basic ${Buffer.from(CREDENTIAL).toString("base64")}`;

const KEYS = ["STAGING_BASIC_AUTH", "APP_ENV"] as const;
const saved = KEYS.map((key) => [key, process.env[key]] as const);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Load `src/proxy.ts` fresh with the given environment, and silence its two log lines. */
async function load(
  environment: Partial<Record<(typeof KEYS)[number], string>>,
): Promise<{
  call: (path: string, headers?: Record<string, string>) => Response;
  lines: string[];
}> {
  for (const key of KEYS) {
    const value = environment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  const { proxy } = await import("../../src/proxy");
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return {
    call: (path, headers = {}) =>
      proxy(
        new NextRequest(
          new Request(`https://staging.example.com${path}`, { headers }),
        ),
      ),
    lines,
  };
}

describe("the 401 gate in src/proxy.ts (AC-25)", () => {
  it("challenges an unauthenticated document request with WWW-Authenticate", async () => {
    const { call } = await load({
      APP_ENV: "staging",
      STAGING_BASIC_AUTH: CREDENTIAL,
    });
    const response = call("/en");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm=/u);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("x-request-id")).not.toBeNull();
  });

  it("serves the request that carries the credential", async () => {
    const { call } = await load({
      APP_ENV: "staging",
      STAGING_BASIC_AUTH: CREDENTIAL,
    });
    expect(call("/en", { authorization: HEADER }).status).toBe(200);
  });

  it("leaves /api/health open for the healthcheck and the uptime monitor", async () => {
    const { call } = await load({
      APP_ENV: "staging",
      STAGING_BASIC_AUTH: CREDENTIAL,
    });
    expect(call("/api/health").status).toBe(200);
  });

  it("never gates production, even with the variable set", async () => {
    const { call } = await load({
      APP_ENV: "production",
      STAGING_BASIC_AUTH: CREDENTIAL,
    });
    expect(call("/en").status).toBe(200);
  });

  it("is off entirely when the variable is absent", async () => {
    const { call } = await load({ APP_ENV: "staging" });
    expect(call("/en").status).toBe(200);
  });

  it("logs the 401 without the credential, the header or the query string", async () => {
    const { call, lines } = await load({
      APP_ENV: "staging",
      STAGING_BASIC_AUTH: CREDENTIAL,
    });
    const wrong = `Basic ${Buffer.from("florist:wrong").toString("base64")}`;
    call("/en?utm_source=newsletter", { authorization: wrong });
    const logged = lines.join("");
    expect(logged).toContain('"status":401');
    expect(logged).not.toContain(CREDENTIAL);
    expect(logged).not.toContain("Basic ");
    expect(logged).not.toContain("utm_source");
  });
});
