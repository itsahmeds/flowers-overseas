/**
 * `src/lib/db.ts` — spec 002 AC-3 / T-05 (TASK-014).
 *
 * Three claims, all about the seam rather than about SQL:
 *
 *  1. **the module exports no client** — the only query surface is `withDbContext`,
 *     `withAdminContext` and `withSystemContext`, so no module can run a query without a session
 *     context and every RLS policy of spec 002 §2 is load-bearing rather than advisory;
 *  2. **every helper issues the `SET LOCAL` preamble before the first statement of the
 *     transaction**, in the order AC-3 names, followed by the switch into the runtime role;
 *  3. **the role discipline the isolation rests on** — `SET LOCAL ROLE`, never `SET ROLE` or
 *     `RESET ROLE`, and no module under `src/` other than this one names either (`/review 71`).
 *
 * The driver is a fake: `postgres` and `@/lib/env` are reached through dynamic `import()` in the
 * module under test precisely so this test needs no database and no connection string.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Statements the fake transaction saw, in order, across every helper call in a test. */
const statements: string[] = [];
/** The bind parameters of each statement, by index into `statements` (absent: none). */
const parametersOf = new Map<number, readonly unknown[]>();
/** Whether a callback ran inside the transaction (it must, and after the preamble). */
let insideTransaction = 0;

const fakeTransaction = {
  unsafe: (
    query: string,
    parameters?: readonly unknown[],
  ): Promise<unknown> => {
    if (parameters !== undefined)
      parametersOf.set(statements.length, parameters);
    statements.push(query);
    return Promise.resolve(undefined);
  },
  // A real transaction handle has no `options` and no `begin`; the module lends it the pool's.
  savepoint: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
    fn(fakeTransaction),
};

const fakeClient = {
  // Drizzle's postgres-js driver decorates these two maps when it wraps a client.
  options: { parsers: {}, serializers: {} },
  begin: async <T>(
    fn: (tx: typeof fakeTransaction) => Promise<T>,
  ): Promise<T> => fn(fakeTransaction),
};

/** The connection string each pool was created with (spec 012b AC-4's build-phase client). */
const poolUrls = vi.hoisted(() => [] as string[]);
vi.mock("postgres", () => ({
  default: (url: string) => {
    poolUrls.push(url);
    return fakeClient;
  },
}));
const guardReports = vi.hoisted(() => [] as string[]);
vi.mock("../../src/lib/sentry", () => ({
  captureGuardError: (signal: string) => {
    guardReports.push(signal);
  },
}));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://user:pass@localhost:5432/fo" },
}));

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PARTNER_A = "33333333-3333-4333-8333-333333333333";
const PARTNER_B = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  poolUrls.length = 0;
  statements.length = 0;
  parametersOf.clear();
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
  it("runs an admin transaction as app.role = 'admin' with the actor's id and its audit action (spec 012 §2.3)", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    await withAdminContext(
      {
        userId: USER_ID,
        requestId: REQUEST_ID,
        action: "partner.status.active",
      },
      () => {
        insideTransaction = statements.length;
        return Promise.resolve(undefined);
      },
    );
    expect(statements).toEqual([
      "SET LOCAL app.role = 'admin'",
      `SET LOCAL app.user_id = '${USER_ID}'`,
      "SET LOCAL app.partner_ids = ''",
      `SET LOCAL app.request_id = '${REQUEST_ID}'`,
      "SET LOCAL app.audit_action = 'partner.status.active'",
      "SELECT set_config('app.audit_reason', $1, true)",
      "SET LOCAL ROLE app_web",
    ]);
    // No reason: the setting is emptied for this transaction, never left to a previous one.
    expect(parametersOf.get(5)).toEqual([""]);
    expect(insideTransaction).toBe(7);
  });

  it("binds the reason as a parameter, never into the SQL text (spec 012 §5.2)", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    const reason = "Demo call at 11:00'; DROP TABLE audit_log; --";
    await withAdminContext(
      { requestId: REQUEST_ID, action: "flag.checkout_open.on", reason },
      () => Promise.resolve(undefined),
    );
    expect(statements[5]).toBe(
      "SELECT set_config('app.audit_reason', $1, true)",
    );
    expect(parametersOf.get(5)).toEqual([reason]);
    expect(statements.join("\n")).not.toContain("DROP TABLE");
  });

  it("requires an action: none, an empty one or one that is not lowercase and dotted is refused before any statement", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    for (const action of [
      undefined,
      "",
      "partner",
      "Partner.status",
      "partner.status.",
      "partner status.active",
      "partner.status'; --",
    ]) {
      await expect(
        withAdminContext({ requestId: REQUEST_ID, action } as never, () =>
          Promise.resolve(undefined),
        ),
        String(action),
      ).rejects.toThrow();
    }
    await expect(
      withAdminContext({ action: "users.list", reason: "  " }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow();
    expect(statements).toEqual([]);
  });

  it("gives an actor-less admin transaction a fresh request id", async () => {
    const { withAdminContext } = await import("../../src/lib/db");
    await withAdminContext({ action: "users.list" }, () =>
      Promise.resolve(undefined),
    );
    expect(statements).toHaveLength(7);
    expect(statements[0]).toBe("SET LOCAL app.role = 'admin'");
    expect(statements[3]).toMatch(
      /^SET LOCAL app\.request_id = '[0-9a-f-]{36}'$/,
    );
    expect(statements[6]).toBe("SET LOCAL ROLE app_web");
  });

  it("reports the two database guards to Sentry, through Drizzle's cause chain, and nothing else (spec 012 §11)", async () => {
    const { withDbContext } = await import("../../src/lib/db");
    guardReports.length = 0;
    const failWith = (message: string) =>
      withDbContext({ role: "admin", requestId: REQUEST_ID }, () =>
        Promise.reject(
          new Error("Failed query: update …", { cause: new Error(message) }),
        ),
      );
    await expect(
      failWith("AUDIT_ACTION_MISSING: an admin-context write to x"),
    ).rejects.toThrow("Failed query");
    await expect(
      failWith(
        "STATUS_FLIP_OUTSIDE_ADMIN: country.status changes only in admin",
      ),
    ).rejects.toThrow("Failed query");
    await expect(failWith("duplicate key value")).rejects.toThrow();
    await expect(
      failWith("a message naming AUDIT_ACTION_MISSING: later"),
    ).rejects.toThrow();
    expect(guardReports).toEqual([
      "AUDIT_ACTION_MISSING",
      "STATUS_FLIP_OUTSIDE_ADMIN",
    ]);
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

/**
 * The residual risk the `/review 71` measurement pinned down: inside the transaction
 * `current_user = app_web` (`rolbypassrls = false`), but `session_user` is the provider's managed
 * login with `rolbypassrls = true`, and one `RESET ROLE` in the same transaction restores it.
 * Until a dedicated `app_web` login exists, the isolation is role *discipline*, so the discipline
 * is what a test can assert: the seam hands out no client, and no other module under `src/` says
 * `RESET ROLE` or `SET ROLE`.
 */
describe("role discipline (spec 002 §13 Q4; /review 71)", () => {
  // `SET LOCAL ROLE` does not match: the words are not adjacent.
  const ROLE_ESCAPE = /\b(?:RESET|SET)\s+ROLE\b/i;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|mts|cts|js|mjs|sql)$/.test(entry.name) ? [path] : [];
    });
  }

  it("leaves `db.ts` the only module under src/ that names a role statement", () => {
    const srcDir = resolve(__dirname, "../../src");
    const dbModule = join(srcDir, "lib", "db.ts");
    const offenders = sourceFiles(srcDir)
      .filter((path) => path !== dbModule)
      .filter((path) => ROLE_ESCAPE.test(readFileSync(path, "utf8")))
      .map((path) => relative(srcDir, path));

    expect(offenders).toEqual([]);
  });

  it("issues `SET LOCAL ROLE` and never `SET ROLE` or `RESET ROLE`", async () => {
    const { withDbContext } = await import("../../src/lib/db");
    await withDbContext({ role: "customer", requestId: REQUEST_ID }, () =>
      Promise.resolve(undefined),
    );

    expect(statements.at(-1)).toBe("SET LOCAL ROLE app_web");
    for (const statement of statements) {
      expect(ROLE_ESCAPE.test(statement), statement).toBe(false);
    }
  });

  it("documents that the connecting role still holds BYPASSRLS (TASK-023 AC-18)", () => {
    const header = readFileSync(
      resolve(__dirname, "../../src/lib/db.ts"),
      "utf8",
    ).slice(0, 3000);

    expect(header).toContain("role discipline");
    expect(header).toContain("connects as");
    expect(header).toMatch(/session_user/);
    expect(header).toMatch(/AC-18/);
  });
});

/**
 * Spec 012b §5.2 "`src/lib/db.ts`", AC-4 (TASK-292): while `next build` runs, the pool connects
 * with `DATABASE_BUILD_URL` and every transaction enters `app_build`; no fallback to
 * `DATABASE_URL`, and no other module under `src/` reads the key.
 */
describe("the build-phase client (spec 012b AC-4)", () => {
  const BUILD_URL = "postgres://app_build:build-secret@db.example.test:5432/fo";

  async function freshDb(environment: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) vi.stubEnv(key, "");
      else vi.stubEnv(key, value);
    }
    return import("../../src/lib/db");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("connects with DATABASE_BUILD_URL during the build and enters app_build", async () => {
    const { withDbContext } = await freshDb({
      NEXT_PHASE: "phase-production-build",
      DATABASE_BUILD_URL: BUILD_URL,
    });
    await withDbContext({ role: "public", requestId: REQUEST_ID }, () =>
      Promise.resolve(undefined),
    );
    expect(poolUrls).toEqual([BUILD_URL]);
    expect(statements.at(-1)).toBe("SET LOCAL ROLE app_build");
  });

  it("outside the build, connects with DATABASE_URL and enters app_web, whatever DATABASE_BUILD_URL holds", async () => {
    const { withDbContext } = await freshDb({
      NEXT_PHASE: "phase-production-server",
      DATABASE_BUILD_URL: BUILD_URL,
    });
    await withDbContext({ role: "public", requestId: REQUEST_ID }, () =>
      Promise.resolve(undefined),
    );
    expect(poolUrls).toEqual(["postgres://user:pass@localhost:5432/fo"]);
    expect(statements.at(-1)).toBe("SET LOCAL ROLE app_web");
  });

  it.each([
    ["absent", undefined],
    ["not a postgres URL", "https://db.example.test"],
  ])(
    "refuses a build whose DATABASE_BUILD_URL is %s, naming the key, with no fallback and no statement",
    async (_case, value) => {
      const { withDbContext } = await freshDb({
        NEXT_PHASE: "phase-production-build",
        DATABASE_BUILD_URL: value,
      });
      const attempt = withDbContext(
        { role: "public", requestId: REQUEST_ID },
        () => Promise.resolve(undefined),
      );
      await expect(attempt).rejects.toThrow(/^DATABASE_BUILD_URL is missing/u);
      await expect(attempt).rejects.not.toThrow(/https:/u);
      expect(poolUrls).toEqual([]);
      expect(statements).toEqual([]);
    },
  );

  it("leaves db.ts the only module under src/ that reads DATABASE_BUILD_URL", () => {
    const srcDir = resolve(__dirname, "../../src");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return files(path);
        return /\.(ts|tsx|mts|cts|js|mjs)$/.test(entry.name) ? [path] : [];
      });
    const readers = files(srcDir)
      .filter((path) =>
        readFileSync(path, "utf8").includes("DATABASE_BUILD_URL"),
      )
      .map((path) => relative(srcDir, path));
    expect(readers).toEqual([join("lib", "db.ts")]);
  });
});
