/**
 * T-16's flag half (spec 012b §2.5, AC-16; TASK-297): `catalogue.placeholder_window` is turned
 * off only by the `admin` role with the key typed, and never turned on again. The refusals come
 * before the transaction, so the runner is never called.
 */
import { describe, expect, it } from "vitest";

import { flagDefinition } from "../../src/config/feature-flags.ts";
import { toggleFlag } from "../../src/modules/admin/flags.ts";

const KEY = "catalogue.placeholder_window";
const form = (enabled: "on" | "off", confirmKey?: string) => ({
  key: KEY,
  scopeKind: "global",
  scopeRef: "*",
  enabled,
  version: "none",
  ...(confirmKey === undefined ? {} : { confirmKey }),
});

function deps(calls: string[]) {
  return {
    run: (() => {
      calls.push("run");
      return Promise.resolve({ kind: "saved", changed: true });
    }) as never,
    invalidate: () => Promise.resolve(),
    log: { info: () => undefined } as never,
  };
}

describe("catalogue.placeholder_window: admin only, typed key, one way", () => {
  it("is registered as high-risk and one-way", () => {
    expect(flagDefinition(KEY)).toMatchObject({ risk: "high", oneWay: "off" });
  });

  it("off is refused for content, and for an admin who did not type the key", async () => {
    const calls: string[] = [];
    expect(
      await toggleFlag({ roles: ["content"] }, form("off", KEY), deps(calls)),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      await toggleFlag(
        { roles: ["admin"] },
        form("off", "catalogue"),
        deps(calls),
      ),
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(calls).toEqual([]);
  });

  it("off succeeds for an admin with the typed key", async () => {
    const calls: string[] = [];
    expect(
      await toggleFlag({ roles: ["admin"] }, form("off", KEY), deps(calls)),
    ).toMatchObject({ ok: true, enabled: false });
    expect(calls).toEqual(["run"]);
  });

  it("on is refused, even for an admin with the typed key", async () => {
    const calls: string[] = [];
    expect(
      await toggleFlag({ roles: ["admin"] }, form("on", KEY), deps(calls)),
    ).toEqual({ ok: false, reason: "one_way" });
    expect(calls).toEqual([]);
  });
});
