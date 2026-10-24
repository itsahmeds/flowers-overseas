/**
 * T-16, the reader's database half (spec 012 §2.4, AC-14 reader half; TASK-219).
 *
 * `loadFlagSnapshot` runs on a migrated scratch database as `app_web` with the system role's
 * session variables, exactly as `isEnabled` runs it through `withSystemContext`: it reads the two
 * registered flags as migration `0009` seeds them, ignores the unregistered keys beside them, and
 * a scope row written afterwards is read by a reader on a fake clock once its 60 s window ends.
 * Under the `public` role RLS hides the tables, which is why the reader uses a system context.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type FlagSnapshot,
  createFlagReader,
  loadFlagSnapshot,
} from "../../src/lib/flags.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `T-16 — the flag reader against the migrated tables${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "flags");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    async function snapshotAs(role: string): Promise<FlagSnapshot> {
      return rolledBack(scratch.sql, async (tx) => {
        await asApp(tx, { role });
        return loadFlagSnapshot(drizzleOver(tx, scratch.sql));
      });
    }

    it("reads the four registered flags as migrations 0009 and 0019 seed them, and nothing else", async () => {
      const snapshot = await snapshotAs("system");
      expect(
        [...snapshot.flags].sort((a, b) => a.key.localeCompare(b.key)),
      ).toEqual([
        // spec 018 (`NNNN_post_purchase`, TASK-337): both off.
        { key: "account.open", enabledDefault: false },
        { key: "checkout.demo_guard", enabledDefault: true },
        { key: "checkout.open", enabledDefault: false },
        { key: "invoice.issue", enabledDefault: false },
      ]);
      expect(
        [...snapshot.scopes].sort((a, b) => a.flagKey.localeCompare(b.flagKey)),
      ).toEqual([
        {
          flagKey: "checkout.open",
          scope: "country",
          scopeRef: "PL",
          enabled: false,
        },
        {
          flagKey: "invoice.issue",
          scope: "country",
          scopeRef: "PL",
          enabled: false,
        },
      ]);
    });

    it("sees nothing under the public role (RLS), so it must read under a system context", async () => {
      expect(await snapshotAs("public")).toEqual({ flags: [], scopes: [] });
    });

    it("a toggle in the database is read within 60 s on a fake clock", async () => {
      let now = 0;
      const reader = createFlagReader({
        load: () => snapshotAs("system"),
        now: () => now,
      });
      const pl = { kind: "country", ref: "PL" } as const;
      expect(await reader.isEnabled("checkout.open", pl)).toBe(false);
      expect(await reader.isEnabled("checkout.demo_guard")).toBe(true);

      await scratch.sql`UPDATE feature_flag_scope SET enabled = true
                        WHERE flag_key = 'checkout.open' AND scope = 'country' AND scope_ref = 'PL'`;
      await scratch.sql`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
                        VALUES ('checkout.demo_guard', 'global', '*', false)`;
      try {
        now = 59_999;
        expect(await reader.isEnabled("checkout.open", pl)).toBe(false);
        now = 60_000;
        expect(await reader.isEnabled("checkout.open", pl)).toBe(true);
        expect(
          await reader.isEnabled("checkout.open", {
            kind: "country",
            ref: "DE",
          }),
        ).toBe(false);
        expect(await reader.isEnabled("checkout.demo_guard")).toBe(false);
      } finally {
        await scratch.sql`UPDATE feature_flag_scope SET enabled = false
                          WHERE flag_key = 'checkout.open' AND scope_ref = 'PL'`;
        await scratch.sql`DELETE FROM feature_flag_scope
                          WHERE flag_key = 'checkout.demo_guard'`;
      }
    });
  },
);
