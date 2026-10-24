/**
 * T-16, unit half (spec 012 §2.4, §5.2, AC-14 registry and reader half; TASK-219).
 *
 * The registry holds exactly `checkout.open` (country scope, dirties `catalog:{iso2}`) and
 * `checkout.demo_guard` (global, high-risk); `isEnabled` reads a snapshot of `feature_flag` and
 * `feature_flag_scope` through a 60 s in-process cache, sees a change within 60 s on a fake clock,
 * and refuses an unregistered key, a scope of a kind the key does not take, and a missing scope
 * where the key has no global value. The database half (the snapshot query against migrated
 * tables) is `tests/integration/flags.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  FEATURE_FLAGS,
  FeatureFlagRegistrySchema,
  FlagToggleSchema,
  flagDefinition,
  isRegisteredFlagKey,
} from "../../src/config/feature-flags.ts";
import {
  FLAG_CACHE_TTL_MS,
  FlagNotSeededError,
  type FlagSnapshot,
  FlagScopeError,
  UnregisteredFlagError,
  createFlagReader,
  dirtiedTags,
} from "../../src/lib/flags.ts";

/* -------------------------------------------------------------------------- */
/* The registry                                                                */
/* -------------------------------------------------------------------------- */

describe("T-16 — the registry", () => {
  it("holds exactly spec 010's two checkout flags and spec 018's two", () => {
    expect(FEATURE_FLAGS.map((flag) => flag.key)).toEqual([
      "checkout.open",
      "checkout.demo_guard",
      "account.open",
      "invoice.issue",
    ]);
  });

  it("registers spec 018's flags: account.open global or per locale, invoice.issue per country", () => {
    expect(flagDefinition("account.open")).toEqual({
      key: "account.open",
      scopeKinds: ["global", "locale"],
      risk: "standard",
      dirties: [],
      description: expect.stringMatching(/\S/u) as unknown as string,
    });
    expect(flagDefinition("invoice.issue")).toEqual({
      key: "invoice.issue",
      scopeKinds: ["country"],
      risk: "standard",
      dirties: [],
      description: expect.stringMatching(/\S/u) as unknown as string,
    });
  });

  it("registers checkout.open with country scope, standard risk and the catalog:{iso2} tag", () => {
    expect(flagDefinition("checkout.open")).toEqual({
      key: "checkout.open",
      scopeKinds: ["country"],
      risk: "standard",
      dirties: ["catalog"],
      description: expect.stringMatching(/\S/u) as unknown as string,
    });
  });

  it("registers checkout.demo_guard as global and high-risk, dirtying no public page", () => {
    expect(flagDefinition("checkout.demo_guard")).toEqual({
      key: "checkout.demo_guard",
      scopeKinds: ["global"],
      risk: "high",
      dirties: [],
      description: expect.stringMatching(/\S/u) as unknown as string,
    });
  });

  it("parses with its own schema", () => {
    expect(FeatureFlagRegistrySchema.parse(FEATURE_FLAGS)).toEqual(
      FEATURE_FLAGS,
    );
  });

  it("refuses a registry with a duplicate key", () => {
    const [first] = FEATURE_FLAGS;
    expect(() =>
      FeatureFlagRegistrySchema.parse([...FEATURE_FLAGS, first]),
    ).toThrow(/duplicate/u);
  });

  it("refuses a dirty kind the key's scope kinds cannot fill", () => {
    expect(() =>
      FeatureFlagRegistrySchema.parse([
        {
          key: "checkout.demo_guard",
          scopeKinds: ["global"],
          risk: "high",
          dirties: ["catalog"],
          description: "x",
        },
      ]),
    ).toThrow(/country scope kind/u);
  });

  it("refuses a key the database's feature_flag_key_check would refuse", () => {
    expect(() =>
      FeatureFlagRegistrySchema.parse([
        {
          key: "Checkout",
          scopeKinds: ["global"],
          risk: "standard",
          dirties: [],
          description: "x",
        },
      ]),
    ).toThrow();
  });

  it("knows its keys and no others", () => {
    expect(isRegisteredFlagKey("checkout.open")).toBe(true);
    expect(isRegisteredFlagKey("checkout.demo_guard")).toBe(true);
    expect(isRegisteredFlagKey("payments.stripe")).toBe(false);
    expect(isRegisteredFlagKey("checkout.opened")).toBe(false);
    expect(() => flagDefinition("payments.stripe" as never)).toThrow(
      UnregisteredFlagError,
    );
  });

  it("expands the dirtied tags for a scope", () => {
    expect(
      dirtiedTags("checkout.open", { kind: "country", ref: "PL" }),
    ).toEqual(["catalog:PL"]);
    expect(dirtiedTags("checkout.demo_guard")).toEqual([]);
    // The country is parsed, never cast: a code that is not a destination is refused.
    expect(() =>
      dirtiedTags("checkout.open", { kind: "country", ref: "ZZ" }),
    ).toThrow();
  });
});

describe("FlagToggleSchema", () => {
  it("accepts a registered key with a scope of its kind", () => {
    expect(
      FlagToggleSchema.parse({
        key: "checkout.open",
        scope: { kind: "country", ref: "PL" },
        enabled: true,
      }),
    ).toEqual({
      key: "checkout.open",
      scope: { kind: "country", ref: "PL" },
      enabled: true,
    });
  });

  it.each([
    [
      {
        key: "payments.stripe",
        scope: { kind: "global", ref: "*" },
        enabled: true,
      },
    ],
    [
      {
        key: "checkout.open",
        scope: { kind: "global", ref: "*" },
        enabled: true,
      },
    ],
    [
      {
        key: "checkout.open",
        scope: { kind: "country", ref: "pl" },
        enabled: true,
      },
    ],
    [
      {
        key: "checkout.demo_guard",
        scope: { kind: "global", ref: "PL" },
        enabled: false,
      },
    ],
    [
      {
        key: "checkout.demo_guard",
        scope: { kind: "global", ref: "*" },
        enabled: "yes",
      },
    ],
  ])("refuses %j", (input) => {
    expect(FlagToggleSchema.safeParse(input).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The reader                                                                  */
/* -------------------------------------------------------------------------- */

/** A snapshot as `loadFlagSnapshot` returns it: one row per flag, its scope rows. */
function snapshot(overrides: {
  open?: boolean;
  openPL?: boolean;
  guard?: boolean;
  guardGlobal?: boolean;
}): FlagSnapshot {
  return {
    flags: [
      { key: "checkout.open", enabledDefault: overrides.open ?? false },
      { key: "checkout.demo_guard", enabledDefault: overrides.guard ?? true },
    ],
    scopes: [
      ...(overrides.openPL === undefined
        ? []
        : [
            {
              flagKey: "checkout.open",
              scope: "country",
              scopeRef: "PL",
              enabled: overrides.openPL,
            },
          ]),
      ...(overrides.guardGlobal === undefined
        ? []
        : [
            {
              flagKey: "checkout.demo_guard",
              scope: "global",
              scopeRef: "*",
              enabled: overrides.guardGlobal,
            },
          ]),
    ],
  };
}

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("T-16 — isEnabled", () => {
  it("caches for 60 s", () => {
    expect(FLAG_CACHE_TTL_MS).toBe(60_000);
  });

  it("reads a country scope row, and falls back to the flag's default for another country", async () => {
    const reader = createFlagReader({
      load: () => Promise.resolve(snapshot({ open: false, openPL: true })),
    });
    expect(
      await reader.isEnabled("checkout.open", { kind: "country", ref: "PL" }),
    ).toBe(true);
    expect(
      await reader.isEnabled("checkout.open", { kind: "country", ref: "DE" }),
    ).toBe(false);
  });

  it("reads a scope row that turns a flag off against a default of on", async () => {
    const reader = createFlagReader({
      load: () => Promise.resolve(snapshot({ open: true, openPL: false })),
    });
    expect(
      await reader.isEnabled("checkout.open", { kind: "country", ref: "PL" }),
    ).toBe(false);
    expect(
      await reader.isEnabled("checkout.open", { kind: "country", ref: "FR" }),
    ).toBe(true);
  });

  it("reads a global flag from its default, and from its global row when one exists", async () => {
    const onlyDefault = createFlagReader({
      load: () => Promise.resolve(snapshot({ guard: true })),
    });
    expect(await onlyDefault.isEnabled("checkout.demo_guard")).toBe(true);
    const withRow = createFlagReader({
      load: () =>
        Promise.resolve(snapshot({ guard: true, guardGlobal: false })),
    });
    expect(await withRow.isEnabled("checkout.demo_guard")).toBe(false);
    expect(
      await withRow.isEnabled("checkout.demo_guard", {
        kind: "global",
        ref: "*",
      }),
    ).toBe(false);
  });

  it("serves the cached value inside the window and the new one within 60 s (fake clock)", async () => {
    const clock = fakeClock();
    let current = snapshot({ openPL: false });
    const load = vi.fn(() => Promise.resolve(current));
    const reader = createFlagReader({ load, now: clock.now });
    const pl = { kind: "country", ref: "PL" } as const;

    expect(await reader.isEnabled("checkout.open", pl)).toBe(false);
    current = snapshot({ openPL: true }); // the toggle, in the database
    clock.advance(59_999);
    expect(await reader.isEnabled("checkout.open", pl)).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(await reader.isEnabled("checkout.open", pl)).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent readers", async () => {
    const load = vi.fn(() => Promise.resolve(snapshot({})));
    const reader = createFlagReader({ load });
    await Promise.all([
      reader.isEnabled("checkout.demo_guard"),
      reader.isEnabled("checkout.open", { kind: "country", ref: "PL" }),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const load = vi
      .fn<() => Promise<FlagSnapshot>>()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(snapshot({ guard: true }));
    const reader = createFlagReader({ load });
    await expect(reader.isEnabled("checkout.demo_guard")).rejects.toThrow(
      "connection refused",
    );
    expect(await reader.isEnabled("checkout.demo_guard")).toBe(true);
  });

  it("refuses an unregistered key, before reading anything", async () => {
    const load = vi.fn(() => Promise.resolve(snapshot({})));
    const reader = createFlagReader({ load });
    await expect(reader.isEnabled("payments.stripe" as never)).rejects.toThrow(
      UnregisteredFlagError,
    );
    await expect(reader.isEnabled("checkout.opened" as never)).rejects.toThrow(
      UnregisteredFlagError,
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("refuses a scope of a kind the key does not take, and a missing scope where it has no global value", async () => {
    const reader = createFlagReader({
      load: () => Promise.resolve(snapshot({ openPL: true })),
    });
    await expect(reader.isEnabled("checkout.open")).rejects.toThrow(
      FlagScopeError,
    );
    await expect(
      reader.isEnabled("checkout.open", { kind: "global", ref: "*" }),
    ).rejects.toThrow(FlagScopeError);
    await expect(
      reader.isEnabled("checkout.demo_guard", { kind: "country", ref: "PL" }),
    ).rejects.toThrow(FlagScopeError);
    await expect(
      reader.isEnabled("checkout.open", { kind: "country", ref: "pl" }),
    ).rejects.toThrow(FlagScopeError);
  });

  it("refuses to guess when a registered flag has no row in the database", async () => {
    const reader = createFlagReader({
      load: () =>
        Promise.resolve({
          flags: [{ key: "checkout.open", enabledDefault: false }],
          scopes: [],
        }),
    });
    await expect(reader.isEnabled("checkout.demo_guard")).rejects.toThrow(
      FlagNotSeededError,
    );
  });

  it("ignores database rows for keys the registry does not name", async () => {
    const reader = createFlagReader({
      load: () =>
        Promise.resolve({
          flags: [
            ...snapshot({ guard: true }).flags,
            { key: "payments.stripe", enabledDefault: true },
          ],
          scopes: [
            {
              flagKey: "payments.stripe",
              scope: "global",
              scopeRef: "*",
              enabled: true,
            },
          ],
        }),
    });
    expect(await reader.isEnabled("checkout.demo_guard")).toBe(true);
  });

  it("clear() forces the next read to load", async () => {
    const load = vi.fn(() => Promise.resolve(snapshot({})));
    const reader = createFlagReader({ load });
    await reader.isEnabled("checkout.demo_guard");
    reader.clear();
    await reader.isEnabled("checkout.demo_guard");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
