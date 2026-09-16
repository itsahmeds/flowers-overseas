/**
 * `src/lib/db.ts` — spec 002 AC-3 / T-05 (TASK-014).
 *
 * Two claims, both about the seam rather than about SQL:
 *
 *  1. **the module exports no client** — the only query surface is `withDbContext`,
 *     `withAdminContext` and `withSystemContext`, so no module can run a query without a session
 *     context and every RLS policy of spec 002 §2 is load-bearing rather than advisory;
 *  2. **every helper issues the `SET LOCAL` preamble before the first statement of the
 *     transaction**, in the order AC-3 names, followed by the switch into the runtime role.
 *
 * The driver is a fake: `postgres` and `@/lib/env` are reached through dynamic `import()` in the
 * module under test precisely so this test needs no database and no connection string.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Statements the fake transaction saw, in order, across every helper call in a test. */
const statements: string[] = [];
/** Whether a callback ran inside the transaction (it must, and after the preamble). */
let insideTransaction = 0;

const fakeTransaction = {
  unsafe: (query: string): Promise<unknown> => {
    statements.push(query);
    return Promise.resolve(undefined);
  },
  // Drizzle's postgres-js driver decorates these two maps when it wraps a client.
  options: { parsers: {}, serializers: {} },
};

const fakeClient = {
  begin: async <T>(
    fn: (tx: typeof fakeTransaction) => Promise<T>,
  ): Promise<T> => fn(fakeTransaction),
};

vi.mock("postgres", () => ({ default: () => fakeClient }));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://user:pass@localhost:5432/fo" },
}));

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PARTNER_A = "33333333-3333-4333-8333-333333333333";
const PARTNER_B = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  statements.length = 0;
  insideTransaction = 0;
});

describe("the exported surface (AC-3)", () => {
  it("exports the three context helpers and no client", async () => {
    const db = await import("../../src/lib/db");
    const functions = Object.entries(db)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();

    expect(functions).toEqual([
      "withAdminContext",
      "withDbContext",
      "withSystemContext",
    ]);
  });

  it("exports no pool, no driver and no Drizzle instance under any name", async () => {
    const db = (await import("../../src/lib/db")) as Record<string, unknown>;
    for (const [name, value] of Object.entries(db)) {
      expect(name, name).not.toMatch(/^(db|sql|client|pool|connection)$/i);
      const candidate = value as Record<string, unknown> | null;
      if (typeof candidate !== "object" || candidate === null) continue;
      for (const method of ["unsafe", "begin", "query", "connect", "execute"]) {
        expect(typeof candidate[method], `${name}.${method}`).not.toBe(
          "function",
        );
      }
    }
  });
});

describe("withDbContext (AC-3 / T-05)", () => {
  it("issues the four SET LOCAL statements in order, then enters app_web", async () => {
    const { withDbContext } = await import("../../src/lib/db");

    await withDbContext(
      {
        role: "partner",
        userId: USER_ID,
        partnerIds: [PARTNER_A, PARTNER_B],
        requestId: REQUEST_ID,
      },
      () => {
        insideTransaction = statements.length;
        return Promise.resolve("ok");
      },
    );

    expect(statements).toEqual([
      "SET LOCAL app.role = 'partner'",
      `SET LOCAL app.user_id = '${USER_ID}'`,
      `SET LOCAL app.partner_ids = '${PARTNER_A},${PARTNER_B}'`,
      `SET LOCAL app.request_id = '${REQUEST_ID}'`,
      "SET LOCAL ROLE app_web",
    ]);
    // The callback ran after the whole preamble: no query can precede the session context.
    expect(insideTransaction).toBe(5);
  });

  it("returns the callback's value and runs it inside the transaction", async () => {
    const { withDbContext } = await import("../../src/lib/db");
    const result = await withDbContext(
      { role: "public", requestId: REQUEST_ID },
      (db) => Promise.resolve(typeof db),
    );
    expect(result).toBe("object");
  });

  it("sets empty values rather than omitting a statement when there is no user or partner", async () => {
    const { withDbContext } = await import("../../src/lib/db");
    await withDbContext({ role: "public", requestId: REQUEST_ID }, () =>
      Promise.resolve(undefined),
    );
    expect(statements[1]).toBe("SET LOCAL app.user_id = ''");
    expect(statements[2]).toBe("SET LOCAL app.partner_ids = ''");
  });

  it("rejects a context that is not valid, before opening a transaction", async () => {
    const { withDbContext } = await import("../../src/lib/db");

    await expect(
      withDbContext({ role: "root" as never, requestId: REQUEST_ID }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow();
    await expect(
      withDbContext(
        { role: "customer", userId: "not-a-uuid", requestId: REQUEST_ID },
        () => Promise.resolve(undefined),
      ),
    ).rejects.toThrow();
    await expect(
      withDbContext({ role: "customer", requestId: "drop'; -- table" }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow();

    expect(statements).toEqual([]);
  });
});

describe("withAdminContext and withSystemContext (AC-3)", () => {
  it("runs an admin transaction as app.role = 'admin' with the actor's id", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    await withAdminContext({ userId: USER_ID, requestId: REQUEST_ID }, () =>
      Promise.resolve(undefined),
    );
    expect(statements).toEqual([
      "SET LOCAL app.role = 'admin'",
      `SET LOCAL app.user_id = '${USER_ID}'`,
      "SET LOCAL app.partner_ids = ''",
      `SET LOCAL app.request_id = '${REQUEST_ID}'`,
      "SET LOCAL ROLE app_web",
    ]);
  });

  it("accepts the bare `withAdminContext(fn)` form and still issues all four statements", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    await withAdminContext(() => Promise.resolve(undefined));
    expect(statements).toHaveLength(5);
    expect(statements[0]).toBe("SET LOCAL app.role = 'admin'");
    expect(statements[3]).toMatch(
      /^SET LOCAL app\.request_id = '[0-9a-f-]{36}'$/,
    );
    expect(statements[4]).toBe("SET LOCAL ROLE app_web");
  });

  it("labels a job `system:{job}` per plan/11 §1", async () => {
    const { withSystemContext } = await import("../../src/lib/db");
    await withSystemContext("retention.sweep", () =>
      Promise.resolve(undefined),
    );
    expect(statements).toEqual([
      "SET LOCAL app.role = 'system'",
      "SET LOCAL app.user_id = ''",
      "SET LOCAL app.partner_ids = ''",
      "SET LOCAL app.request_id = 'system:retention.sweep'",
      "SET LOCAL ROLE app_web",
    ]);
  });

  it("rejects a job name that is not a queue name", async () => {
    const { withSystemContext } = await import("../../src/lib/db");
    await expect(
      withSystemContext("Retention Sweep", () => Promise.resolve(undefined)),
    ).rejects.toThrow();
    expect(statements).toEqual([]);
  });
});
