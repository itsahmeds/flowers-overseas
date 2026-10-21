/**
 * T-16, the flags page's database half (spec 012 §2.4, §5.4 "Invalidation", AC-14 page half;
 * TASK-220), on a migrated scratch database, each command one admin-context transaction as
 * `app_web` with its audit action, exactly as `withAdminContext` runs it:
 *
 *  - `listFlags` shows the two registry keys by scope — every configured destination for
 *    `checkout.open`, `*` for `checkout.demo_guard` — and every other key the database holds
 *    (migration `0009` seeds fourteen) as an orphan;
 *  - an unknown key and an orphaned key are refused and change no row;
 *  - `checkout.demo_guard` is refused for `ops` and without the typed key, and saved for an admin
 *    who typed it; it invalidates nothing;
 *  - a `checkout.open` toggle on PL writes one audited scope row, calls `invalidate` once with
 *    exactly `["catalog:PL"]`, and is read by `isEnabled` once the reader's 60 s window ends
 *    (fake clock);
 *  - a form older than the row is a conflict and changes nothing; a toggle to the value already
 *    held writes and invalidates nothing.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FEATURE_FLAGS } from "../../src/config/feature-flags.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { createFlagReader, loadFlagSnapshot } from "../../src/lib/flags.ts";
import { createLogger } from "../../src/lib/logger.ts";
import {
  type FlagsView,
  NO_SCOPE_ROW,
  listFlags,
  toggleFlag,
} from "../../src/modules/admin/flags.ts";
import type { AdminRunner } from "../../src/modules/admin/users.ts";
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
  `T-16 — the flags page against the migrated tables${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AdminRunner;
    let founder: string;
    let invalidated: (readonly string[])[];
    const log = createLogger({ write: () => undefined });

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "adminflags");
      run = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      founder = randomUUID();
      await scratch.sql`INSERT INTO users (id, email) VALUES (${founder}, 'founder@example.test')`;
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${founder}, 'Founder Test')`;
      await scratch.sql`INSERT INTO user_role (user_id, role) VALUES (${founder}, 'admin')`;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    beforeEach(() => {
      invalidated = [];
    });

    const deps = () => ({
      run,
      log,
      invalidate: (tags: readonly string[]) => {
        invalidated.push(tags);
        return Promise.resolve();
      },
    });
    const admin = () => ({
      userId: founder,
      requestId: randomUUID(),
      roles: ["admin"],
    });
    const ops = () => ({
      userId: founder,
      requestId: randomUUID(),
      roles: ["ops"],
    });
    const view = (): Promise<FlagsView> =>
      listFlags({ userId: founder, requestId: randomUUID() }, run);

    async function valueOf(key: string, ref: string) {
      const flag = (await view()).registered.find((entry) => entry.key === key);
      const value = flag?.values.find((entry) => entry.scope.ref === ref);
      if (value === undefined) throw new Error(`no value for ${key} ${ref}`);
      return value;
    }

    async function scopeRows() {
      return scratch.sql<
        {
          flag_key: string;
          scope: string;
          scope_ref: string;
          enabled: boolean;
        }[]
      >`SELECT flag_key, scope, scope_ref, enabled FROM feature_flag_scope
        ORDER BY flag_key, scope, scope_ref`;
    }

    async function auditCount(): Promise<number> {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM audit_log WHERE entity_table = 'feature_flag_scope'`;
      return row?.n ?? -1;
    }

    it("lists the registry keys by scope and every other database key as an orphan", async () => {
      const flags = await view();
      expect(flags.registered.map((flag) => flag.key)).toEqual(
        FEATURE_FLAGS.map((flag) => flag.key),
      );
      const open = flags.registered.find(
        (flag) => flag.key === "checkout.open",
      );
      expect(open?.values.map((value) => value.scope)).toEqual(
        COUNTRIES.map((country) => ({ kind: "country", ref: country.iso2 })),
      );
      expect(open?.values.every((value) => !value.enabled)).toBe(true);
      expect(
        open?.values.find((value) => value.scope.ref === "PL")?.version,
      ).not.toBe(NO_SCOPE_ROW);
      expect(
        open?.values.find((value) => value.scope.ref === "DE")?.version,
      ).toBe(NO_SCOPE_ROW);
      const guard = flags.registered.find(
        (flag) => flag.key === "checkout.demo_guard",
      );
      expect(guard?.values).toEqual([
        {
          scope: { kind: "global", ref: "*" },
          enabled: true,
          version: NO_SCOPE_ROW,
        },
      ]);
      expect(flags.orphans.map((orphan) => orphan.key)).toEqual([
        "corridor.de",
        "corridor.es",
        "corridor.fr",
        "corridor.gb",
        "corridor.it",
        "corridor.nl",
        "corridor.pl",
        "corridor.ro",
        "locale.de",
        "locale.en",
        "locale.en-gb",
        "locale.pl",
        "payments.mollie",
        "payments.stripe",
      ]);
      expect(flags.orphans[0]).toEqual({
        key: "corridor.de",
        enabled: false,
        scopeKinds: ["global"],
      });
    });

    it("refuses an unknown key and an orphaned key, writing nothing", async () => {
      const before = await scopeRows();
      const audits = await auditCount();
      for (const key of ["checkout.nope", "payments.stripe"]) {
        expect(
          await toggleFlag(
            admin(),
            {
              key,
              scopeKind: "global",
              scopeRef: "*",
              enabled: "on",
              version: NO_SCOPE_ROW,
            },
            deps(),
          ),
          key,
        ).toEqual({ ok: false, reason: "unregistered" });
      }
      expect(await scopeRows()).toEqual(before);
      expect(await auditCount()).toBe(audits);
      expect(invalidated).toEqual([]);
    });

    it("refuses the demo guard for ops and without the typed key; an admin who typed it turns it off", async () => {
      const guard = await valueOf("checkout.demo_guard", "*");
      const form = {
        key: "checkout.demo_guard",
        scopeKind: "global",
        scopeRef: "*",
        enabled: "off",
        version: guard.version,
      };
      const before = await scopeRows();
      expect(
        await toggleFlag(
          ops(),
          { ...form, confirmKey: "checkout.demo_guard" },
          deps(),
        ),
      ).toEqual({ ok: false, reason: "forbidden" });
      expect(await toggleFlag(admin(), form, deps())).toEqual({
        ok: false,
        reason: "mismatch",
      });
      expect(
        await toggleFlag(
          admin(),
          { ...form, confirmKey: "checkout.demo_gu" },
          deps(),
        ),
      ).toEqual({ ok: false, reason: "mismatch" });
      // "The key typed exactly" (`/break 306` hole 4): no trimming, no case folding.
      for (const typed of [" checkout.demo_guard", "Checkout.Demo_Guard"]) {
        expect(
          await toggleFlag(admin(), { ...form, confirmKey: typed }, deps()),
          typed,
        ).toEqual({ ok: false, reason: "mismatch" });
      }
      expect(await scopeRows()).toEqual(before);

      const saved = await toggleFlag(
        admin(),
        { ...form, confirmKey: "checkout.demo_guard" },
        deps(),
      );
      expect(saved).toMatchObject({ ok: true, enabled: false, changed: true });
      expect((await valueOf("checkout.demo_guard", "*")).enabled).toBe(false);
      expect(invalidated).toEqual([]);

      // Back on, for the next case.
      const again = await valueOf("checkout.demo_guard", "*");
      expect(
        await toggleFlag(
          admin(),
          {
            ...form,
            enabled: "on",
            version: again.version,
            confirmKey: "checkout.demo_guard",
          },
          deps(),
        ),
      ).toMatchObject({ ok: true, enabled: true });
    });

    it("a checkout.open toggle on PL writes one audited row, invalidates catalog:PL once, and isEnabled reads it after 60 s", async () => {
      let now = 0;
      const reader = createFlagReader({
        load: () =>
          rolledBack(scratch.sql, async (tx) => {
            await asApp(tx, { role: "system" });
            return loadFlagSnapshot(drizzleOver(tx, scratch.sql));
          }),
        now: () => now,
      });
      const pl = { kind: "country", ref: "PL" } as const;
      expect(await reader.isEnabled("checkout.open", pl)).toBe(false);

      const audits = await auditCount();
      const value = await valueOf("checkout.open", "PL");
      const result = await toggleFlag(
        admin(),
        {
          key: "checkout.open",
          scopeKind: "country",
          scopeRef: "PL",
          enabled: "on",
          version: value.version,
        },
        deps(),
      );
      expect(result).toEqual({
        ok: true,
        key: "checkout.open",
        scope: pl,
        enabled: true,
        changed: true,
      });
      expect(invalidated).toEqual([["catalog:PL"]]);
      expect(await auditCount()).toBe(audits + 1);
      const [audit] = await scratch.sql<
        { action: string; actor_user_id: string; channel: string }[]
      >`SELECT action, actor_user_id, channel FROM audit_log
        WHERE entity_table = 'feature_flag_scope' ORDER BY at DESC, id DESC LIMIT 1`;
      expect(audit).toEqual({
        action: "flags.toggle",
        actor_user_id: founder,
        channel: "admin",
      });

      now = 59_999;
      expect(await reader.isEnabled("checkout.open", pl)).toBe(false);
      now = 60_000;
      expect(await reader.isEnabled("checkout.open", pl)).toBe(true);
    });

    it("a first toggle for a destination with no row inserts one, and invalidates that destination only", async () => {
      const value = await valueOf("checkout.open", "DE");
      expect(value.version).toBe(NO_SCOPE_ROW);
      expect(
        await toggleFlag(
          admin(),
          {
            key: "checkout.open",
            scopeKind: "country",
            scopeRef: "DE",
            enabled: "on",
            version: NO_SCOPE_ROW,
          },
          deps(),
        ),
      ).toMatchObject({ ok: true, changed: true });
      expect(invalidated).toEqual([["catalog:DE"]]);
      expect(
        (await scopeRows()).filter((row) => row.scope_ref === "DE"),
      ).toEqual([
        {
          flag_key: "checkout.open",
          scope: "country",
          scope_ref: "DE",
          enabled: true,
        },
      ]);
    });

    it("a stale form is a conflict and a toggle to the held value writes nothing; neither invalidates", async () => {
      const before = await scopeRows();
      const audits = await auditCount();
      expect(
        await toggleFlag(
          admin(),
          {
            key: "checkout.open",
            scopeKind: "country",
            scopeRef: "PL",
            enabled: "off",
            version: NO_SCOPE_ROW,
          },
          deps(),
        ),
      ).toEqual({ ok: false, reason: "conflict" });
      const pl = await valueOf("checkout.open", "PL");
      expect(
        await toggleFlag(
          admin(),
          {
            key: "checkout.open",
            scopeKind: "country",
            scopeRef: "PL",
            enabled: "on",
            version: pl.version,
          },
          deps(),
        ),
      ).toMatchObject({ ok: true, changed: false });
      expect(await scopeRows()).toEqual(before);
      expect(await auditCount()).toBe(audits);
      expect(invalidated).toEqual([]);
    });

    it("refuses a destination the configuration does not name, and a scope kind the key does not take", async () => {
      for (const form of [
        { scopeKind: "country", scopeRef: "GB" },
        { scopeKind: "global", scopeRef: "*" },
      ]) {
        expect(
          await toggleFlag(
            admin(),
            {
              key: "checkout.open",
              enabled: "on",
              version: NO_SCOPE_ROW,
              ...form,
            },
            deps(),
          ),
        ).toEqual({ ok: false, reason: "invalid" });
      }
      expect(invalidated).toEqual([]);
    });
  },
);
