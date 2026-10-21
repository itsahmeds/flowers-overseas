/**
 * The two internal routes (spec 002 §5.2, §6 "Crawl efficiency", AC-23; T-23 unit half;
 * TASK-024): 401 without the secret — before any database work — and, with it, 200 + `no-store`
 * + `X-Robots-Tag: noindex` + a body validating against `DbHealthResponse` / `TickResponse`. Both
 * paths are inside spec 001's `/api/` robots disallow. The route files themselves are imported
 * and driven, so the wiring (method, secret source, probe) is what is tested, not a copy of it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DbHealthResponse,
  INTERNAL_SECRET_HEADER,
  InternalError,
  TickResponse,
  dbHealthResponse,
  hasInternalSecret,
  tickResponse,
} from "../../src/jobs/internal";
import { createLogger } from "../../src/lib/logger";
import { DISALLOWED_PATHS } from "../../src/modules/seo/robots";

import { stubExampleEnv } from "./support/example-env";

const SECRET = "placeholder-cron-secret";
const quiet = () => createLogger({ level: "fatal", write: () => undefined });

function request(
  path: string,
  method: "GET" | "POST",
  secret?: string,
): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: secret === undefined ? {} : { [INTERNAL_SECRET_HEADER]: secret },
  });
}

function expectInternalHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
}

describe("hasInternalSecret", () => {
  const with_ = (value: string | undefined) =>
    hasInternalSecret(request("/api/internal/db-health", "GET", value), SECRET);

  it("accepts exactly the configured secret", () => {
    expect(with_(SECRET)).toBe(true);
  });

  it("refuses a missing, empty, wrong, prefixed or extended value", () => {
    for (const value of [
      undefined,
      "",
      "wrong",
      SECRET.slice(0, -1),
      `${SECRET}x`,
      `${SECRET} x`,
      // Breaker hole 1 (PR 224, U2): the compare is exact, never case-insensitive.
      SECRET.toUpperCase(),
      `${SECRET.slice(0, 1).toUpperCase()}${SECRET.slice(1)}`,
    ]) {
      expect(with_(value), String(value)).toBe(false);
    }
  });

  it("compares the raw header value: surrounding whitespace is a different secret (hole 1, U3)", () => {
    // `Headers` already strips leading and trailing whitespace and refuses a newline, so the raw
    // value is handed in through a minimal request double: `hasInternalSecret` must not trim it.
    const raw = (value: string): Request =>
      ({
        headers: {
          get: (name: string) =>
            name === INTERNAL_SECRET_HEADER ? value : null,
        },
      }) as unknown as Request;
    for (const value of [
      ` ${SECRET}`,
      `${SECRET} `,
      `${SECRET}\n`,
      `\t${SECRET}`,
    ]) {
      expect(hasInternalSecret(raw(value), SECRET), JSON.stringify(value)).toBe(
        false,
      );
    }
    expect(hasInternalSecret(raw(SECRET), SECRET)).toBe(true);
  });

  it("never matches when the configured secret is empty", () => {
    expect(
      hasInternalSecret(request("/api/internal/db-health", "GET", ""), ""),
    ).toBe(false);
  });

  it("reads only its own header, not Authorization", () => {
    const r = new Request("https://example.test/api/internal/db-health", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(hasInternalSecret(r, SECRET)).toBe(false);
  });
});

describe("GET /api/internal/db-health (AC-23)", () => {
  const data = {
    latency_ms: 3.21,
    latest_migration: "0012_pgboss",
    pending_jobs: 4,
  };

  it("401 without the secret header, no-store + noindex, and the probe never runs", async () => {
    for (const secret of [undefined, "wrong"]) {
      const probe = vi.fn(async () => data);
      const response = await dbHealthResponse(
        request("/api/internal/db-health", "GET", secret),
        { secret: SECRET, probe, log: quiet() },
      );
      expect(response.status).toBe(401);
      expectInternalHeaders(response);
      expect(InternalError.parse(await response.json())).toEqual({
        ok: false,
        error: "unauthorized",
      });
      expect(probe).not.toHaveBeenCalled();
    }
  });

  it("200 with the secret: no-store, noindex, a DbHealthResponse body carrying the probe's latest_migration", async () => {
    const response = await dbHealthResponse(
      request("/api/internal/db-health", "GET", SECRET),
      { secret: SECRET, probe: async () => data, log: quiet() },
    );
    expect(response.status).toBe(200);
    expectInternalHeaders(response);
    const body = DbHealthResponse.parse(await response.json());
    expect(body).toEqual({ ok: true, ...data });
  });

  it("503 with a closed-set error when the database is unreachable, logging the class only", async () => {
    const lines: string[] = [];
    const response = await dbHealthResponse(
      request("/api/internal/db-health", "GET", SECRET),
      {
        secret: SECRET,
        probe: async () => {
          throw new Error("connect ECONNREFUSED postgres://user:pass@host/db");
        },
        log: createLogger({
          level: "debug",
          write: (line) => lines.push(line),
        }),
      },
    );
    expect(response.status).toBe(503);
    expectInternalHeaders(response);
    expect(await response.json()).toEqual({
      ok: false,
      error: "database_unavailable",
    });
    expect(lines.join("\n")).not.toContain("user:pass");
  });
});

describe("POST /api/internal/jobs/tick (spec 002 §5.2: counts only)", () => {
  const counts = { fetched: 3, completed: 2, failed: 0, rejected: 1 };

  it("401 without the secret, and the tick never runs", async () => {
    const tick = vi.fn(async () => counts);
    const response = await tickResponse(
      request("/api/internal/jobs/tick", "POST"),
      {
        secret: SECRET,
        tick,
        log: quiet(),
      },
    );
    expect(response.status).toBe(401);
    expectInternalHeaders(response);
    expect(tick).not.toHaveBeenCalled();
  });

  it("200 with the secret: no-store, noindex, the counts and nothing else", async () => {
    const response = await tickResponse(
      request("/api/internal/jobs/tick", "POST", SECRET),
      { secret: SECRET, tick: async () => counts, log: quiet() },
    );
    expect(response.status).toBe(200);
    expectInternalHeaders(response);
    expect(TickResponse.parse(await response.json())).toEqual({
      ok: true,
      ...counts,
    });
  });

  it("503 with a closed-set error when the tick throws", async () => {
    const response = await tickResponse(
      request("/api/internal/jobs/tick", "POST", SECRET),
      {
        secret: SECRET,
        tick: async () => {
          throw new Error("pg-boss database requires migrations");
        },
        log: quiet(),
      },
    );
    expect(response.status).toBe(503);
    expectInternalHeaders(response);
    expect(await response.json()).toEqual({ ok: false, error: "tick_failed" });
  });
});

describe("robots (spec 001 §6, spec 002 §6 'Crawl efficiency')", () => {
  it("both internal paths sit inside the /api/ disallow", () => {
    expect(DISALLOWED_PATHS).toContain("/api/");
    for (const path of ["/api/internal/db-health", "/api/internal/jobs/tick"]) {
      expect(
        DISALLOWED_PATHS.some(
          (rule) => !rule.includes("*") && path.startsWith(rule),
        ),
        path,
      ).toBe(true);
    }
  });
});

const { probe, tick, ensure, enqueue } = vi.hoisted(() => ({
  probe: vi.fn(),
  tick: vi.fn(),
  ensure: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/jobs/runtime", () => ({
  withBoss: async (fn: (boss: unknown) => Promise<unknown>) =>
    fn({ boss: true }),
  probeDbHealth: (...args: unknown[]) => probe(...args),
  ensureQueues: (...args: unknown[]) => ensure(...args),
  enqueue: (...args: unknown[]) => enqueue(...args),
  runTick: (...args: unknown[]) => tick(...args),
}));

describe("the route files, as Next loads them", () => {
  beforeAll(() => {
    stubExampleEnv();
  });
  beforeEach(() => {
    probe.mockReset().mockResolvedValue({
      latency_ms: 1,
      latest_migration: "0012_pgboss",
      pending_jobs: 0,
    });
    tick
      .mockReset()
      .mockResolvedValue({ fetched: 0, completed: 0, failed: 0, rejected: 0 });
    ensure.mockReset().mockResolvedValue(undefined);
    enqueue.mockReset().mockResolvedValue("job-1");
  });

  it("db-health: GET only, force-dynamic, gated by INTERNAL_CRON_SECRET from the env contract", async () => {
    const route = await import("../../src/app/api/internal/db-health/route");
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "revalidate"]);
    expect(route.dynamic).toBe("force-dynamic");
    const denied = await route.GET(
      request("/api/internal/db-health", "GET", "nope"),
    );
    expect(denied.status).toBe(401);
    expect(probe).not.toHaveBeenCalled();
    const allowed = await route.GET(
      request("/api/internal/db-health", "GET", SECRET),
    );
    expect(allowed.status).toBe(200);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(DbHealthResponse.parse(await allowed.json()).latest_migration).toBe(
      "0012_pgboss",
    );
  });

  it("tick: POST only, ensures the registered queues, then ticks with the production handlers", async () => {
    const route = await import("../../src/app/api/internal/jobs/tick/route");
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    expect(Object.keys(route).sort()).toEqual([
      "POST",
      "dynamic",
      "revalidate",
    ]);
    const denied = await route.POST(request("/api/internal/jobs/tick", "POST"));
    expect(denied.status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
    const allowed = await route.POST(
      request("/api/internal/jobs/tick", "POST", SECRET),
    );
    expect(allowed.status).toBe(200);
    expect(ensure).toHaveBeenCalledTimes(1);
    // Spec 013 §5.2 (TASK-254): every tick enqueues one outbox.dispatch, before it ticks, so the
    // same tick consumes it.
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.slice(1)).toEqual([
      "outbox.dispatch",
      {},
      { requestId: "system:jobs.tick" },
    ]);
    expect(enqueue.mock.invocationCallOrder[0]).toBeLessThan(
      tick.mock.invocationCallOrder[0] ?? 0,
    );
    expect(tick).toHaveBeenCalledTimes(1);
    // Identity, not deep equality: `JOB_HANDLERS` is `{}` today, so `toHaveBeenCalledWith` would
    // also pass for a route that ticked with a fresh `{}` (breaker hole 7, U39).
    const [boss, handlers] = tick.mock.calls[0] as [unknown, unknown];
    expect(boss).toEqual({ boss: true });
    expect(handlers).toBe(JOB_HANDLERS);
  });
});
