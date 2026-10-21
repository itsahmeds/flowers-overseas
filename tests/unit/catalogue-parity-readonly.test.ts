/**
 * Spec 012b AC-2 (TASK-292; breaker hole 4 on PR 309): `pnpm catalogue:parity` reads its target in
 * one `READ ONLY` transaction and issues exactly the registry query inside it, so the check the
 * founder runs against production cannot write. The driver is replaced by a recorder.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  modes: [] as string[],
  queries: [] as string[],
  outside: [] as string[],
}));

vi.mock("postgres", () => ({
  default: () => ({
    begin: async (
      mode: string,
      fn: (tx: {
        unsafe: (q: string) => Promise<unknown[]>;
      }) => Promise<unknown>,
    ) => {
      calls.modes.push(mode);
      return fn({
        unsafe: (query: string) => {
          calls.queries.push(query);
          return Promise.resolve([]);
        },
      });
    },
    unsafe: (query: string) => {
      calls.outside.push(query);
      return Promise.resolve([]);
    },
    end: () => Promise.resolve(),
  }),
}));

beforeEach(() => {
  calls.modes.length = 0;
  calls.queries.length = 0;
  calls.outside.length = 0;
});

describe("catalogue:parity reads read-only (spec 012b AC-2)", () => {
  it("opens one READ ONLY transaction and runs only the registry query in it", async () => {
    const { readCountryRows } =
      await import("../../scripts/catalogue-parity.ts");
    const { COUNTRY_REGISTRY_QUERY } =
      await import("../../src/modules/geo/registry.ts");
    await readCountryRows("postgres://app_build:x@db.example.test:5432/fo");
    expect(calls.modes).toEqual(["read only"]);
    expect(calls.queries).toEqual([COUNTRY_REGISTRY_QUERY]);
    expect(calls.outside).toEqual([]);
    expect(COUNTRY_REGISTRY_QUERY.trim()).toMatch(/^SELECT\b/u);
  });
});
