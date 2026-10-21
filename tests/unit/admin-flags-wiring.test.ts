/**
 * `toggleFlag`'s production wiring (spec 012 §2.4, AC-14: "toggling `checkout.open` for a country
 * calls `invalidate()` once with exactly `catalog:{iso2}`"; TASK-220, `/break 306` hole 1).
 *
 * Every other test injects `invalidate`. Here only `run` (no database in the unit project) and
 * `log` are replaced, so the default dependency is the one under test: `src/lib/cache.ts`'s
 * `invalidate`, mocked at the module boundary, must receive exactly `[["catalog:PL"]]`.
 */
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ invalidate: [] as unknown[][] }));

vi.mock("@/lib/cache", () => ({
  invalidate: (...args: unknown[]) => {
    calls.invalidate.push(args);
    return Promise.resolve({ origin: "ok", edge: "ok", urlCount: 0 });
  },
}));

const { toggleFlag, NO_SCOPE_ROW } =
  await import("../../src/modules/admin/flags.ts");
const { createLogger } = await import("../../src/lib/logger.ts");

/** A transaction stub: the flag row exists (off by default), PL has no scope row, inserts land. */
function fakeDb(): unknown {
  let selects = 0;
  const select = () => ({
    from: () => ({
      where: () => ({
        for: () => {
          selects += 1;
          return Promise.resolve(
            selects === 1 ? [{ enabledDefault: false }] : [],
          );
        },
      }),
    }),
  });
  return {
    select,
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
}

describe("toggleFlag's default invalidate (AC-14)", () => {
  it("calls src/lib/cache's invalidate once with exactly catalog:PL for checkout.open on PL", async () => {
    const result = await toggleFlag(
      {
        userId: "11111111-1111-4111-8111-111111111111",
        requestId: "request-1",
        roles: ["admin"],
      },
      {
        key: "checkout.open",
        scopeKind: "country",
        scopeRef: "PL",
        enabled: "on",
        version: NO_SCOPE_ROW,
      },
      {
        run: ((_context: unknown, fn: (db: never) => Promise<unknown>) =>
          fn(fakeDb() as never)) as never,
        log: createLogger({ write: () => undefined }),
      },
    );
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(calls.invalidate).toEqual([[["catalog:PL"]]]);
  });
});
