/**
 * `GET /api/health` performs **zero** database queries — asserted by a query counter, not by
 * inspection (spec 002 AC-23, T-23 unit half, §5.4; spec 001 AC-14; TASK-024).
 *
 * Every way this codebase can reach Postgres is replaced by a counting double: the `postgres`
 * driver (`src/lib/db.ts`'s pool and the migration runner), `pg` (pg-boss's driver) and pg-boss
 * itself (`src/jobs/runtime.ts`). Each double counts a client construction, a connection and every
 * statement. The real route file is then imported — its whole module graph, `@/lib/env`,
 * `@/modules/catalog` and all — and called; the counter must still read zero.
 *
 * The positive controls prove the counter is live in this very module graph: the same doubles
 * register a query through `withDbContext` and a pg-boss instance through `withBoss`. A counter
 * that could not see those would pass with its subject removed.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

import { stubExampleEnv } from "./support/example-env";

const counter = vi.hoisted(() => ({ clients: 0, statements: 0 }));

vi.mock("server-only", () => ({}));

vi.mock("postgres", () => {
  const factory = () => {
    counter.clients += 1;
    const tx = {
      unsafe: async () => {
        counter.statements += 1;
        return [];
      },
      options: { parsers: {}, serializers: {} },
    };
    const sql = Object.assign(
      async () => {
        counter.statements += 1;
        return [];
      },
      {
        unsafe: tx.unsafe,
        begin: async (fn: (t: typeof tx) => Promise<unknown>) => {
          counter.statements += 1;
          return fn(tx);
        },
        end: async () => undefined,
        options: tx.options,
      },
    );
    return sql;
  };
  return { default: factory };
});

vi.mock("pg", () => {
  class Client {
    constructor() {
      counter.clients += 1;
    }
    async connect(): Promise<void> {
      counter.statements += 1;
    }
    async query(): Promise<{ rows: [] }> {
      counter.statements += 1;
      return { rows: [] };
    }
  }
  class Pool extends Client {}
  return { default: { Client, Pool }, Client, Pool };
});

vi.mock("pg-boss", () => {
  class PgBoss {
    constructor() {
      counter.clients += 1;
    }
    on(): this {
      return this;
    }
    async start(): Promise<this> {
      counter.statements += 1;
      return this;
    }
    async stop(): Promise<void> {}
  }
  return { PgBoss };
});

beforeAll(() => {
  stubExampleEnv();
});

describe("GET /api/health is database-free (AC-23)", () => {
  it("answers 200 with zero clients and zero statements", async () => {
    const before = { ...counter };
    const { GET } = await import("../../src/app/api/health/route");
    const response = GET(new Request("https://example.test/api/health"));
    expect(response.status).toBe(200);
    await response.json();
    // Let anything the handler started without awaiting (a dynamic import, a pool) settle first.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counter).toEqual(before);
    expect(counter).toEqual({ clients: 0, statements: 0 });
  });

  it("positive control: the same counter sees withDbContext's pool and statements", async () => {
    const { withDbContext } = await import("../../src/lib/db");
    const before = counter.statements;
    await withDbContext(
      { role: "public", requestId: "health-control" },
      async () => undefined,
    );
    expect(counter.clients).toBeGreaterThan(0);
    expect(counter.statements).toBeGreaterThan(before);
  });

  it("positive control: the same counter sees a pg-boss instance from withBoss", async () => {
    const { withBoss } = await import("../../src/jobs/runtime");
    const clients = counter.clients;
    await withBoss(async () => undefined);
    expect(counter.clients).toBe(clients + 1);
  });
});
