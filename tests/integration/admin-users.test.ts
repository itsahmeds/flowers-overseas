/**
 * T-06 (AC-4) and the users commands (spec 012 §2.2 "Bootstrap and users", AC-3; TASK-217), on a
 * migrated scratch database, each write one admin-context transaction as `app_web`:
 *
 *  - a denied action answers 403 and changes no row;
 *  - grant creates the user, profile and role, and re-activates a deactivated person;
 *  - revoke and deactivate delete the person's sessions in the same transaction, so their next
 *    request is unauthenticated (AC-3);
 *  - your own admin role cannot be removed and you cannot deactivate yourself;
 *  - a save against a newer row is a conflict and changes nothing.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AdminSession } from "../../src/lib/auth/admin.ts";
import { requirePermission } from "../../src/modules/admin/guard.ts";
import {
  type AdminRunner,
  deactivateUser,
  grantRole,
  listAdminUsers,
  revokeRole,
} from "../../src/modules/admin/users.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `admin users and roles${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AdminRunner;
    let founder: string;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "adminusers");
      run = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          // The audit action `withAdminContext` issues (TASK-218): the trigger records it.
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

    const actor = () => ({ userId: founder, requestId: randomUUID() });

    async function counts() {
      const [row] = await scratch.sql<
        { users: number; profiles: number; roles: number; sessions: number }[]
      >`SELECT (SELECT count(*)::int FROM users) AS users,
               (SELECT count(*)::int FROM admin_profile) AS profiles,
               (SELECT count(*)::int FROM user_role) AS roles,
               (SELECT count(*)::int FROM sessions) AS sessions`;
      return row;
    }

    async function rowOf(email: string) {
      const rows = await listAdminUsers(actor(), run);
      const row = rows.find((r) => r.email === email);
      if (row === undefined) throw new Error(`no row for ${email}`);
      return row;
    }

    async function sessionFor(userId: string): Promise<string> {
      const token = `s-${randomUUID()}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${userId}, now() + interval '1 hour')`;
      return token;
    }

    it("T-06: a denied action answers 403 and changes no row", async () => {
      const ops: AdminSession = {
        userId: founder,
        displayName: "Ops Test",
        roles: ["ops"],
        timeZone: "Europe/Tallinn",
      };
      const before = await counts();
      let digest = "";
      try {
        await requirePermission("users.manage", {
          session: () => Promise.resolve(ops),
        });
        await grantRole(
          actor(),
          { email: "x@example.test", displayName: "X Test", role: "admin" },
          run,
        );
      } catch (error) {
        digest = String((error as { digest?: unknown }).digest);
      }
      expect(digest).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
      expect(await counts()).toEqual(before);
    });

    it("grant creates the user, profile and role; a second grant adds a role", async () => {
      expect(
        await grantRole(
          actor(),
          {
            email: " Lena@Example.test ",
            displayName: "Lena Test",
            role: "ops",
          },
          run,
        ),
      ).toEqual({ ok: true });
      expect(
        await grantRole(
          actor(),
          {
            email: "lena@example.test",
            displayName: "Lena Test",
            role: "finance",
          },
          run,
        ),
      ).toEqual({ ok: true });
      const row = await rowOf("lena@example.test");
      expect(row.roles).toEqual(["finance", "ops"]);
      expect(row.deactivated).toBe(false);
    });

    it("refuses a malformed grant", async () => {
      for (const input of [
        { email: "not-an-address", displayName: "Lena Test", role: "ops" },
        { email: "a@example.test", displayName: "L", role: "ops" },
        { email: "a@example.test", displayName: "Lena Test", role: "owner" },
      ]) {
        expect(await grantRole(actor(), input, run)).toEqual({
          ok: false,
          reason: "invalid",
        });
      }
    });

    it("AC-3: revoking a role deletes that person's sessions in the same transaction", async () => {
      const row = await rowOf("lena@example.test");
      await sessionFor(row.userId);
      await sessionFor(founder);
      expect(
        await revokeRole(
          actor(),
          { userId: row.userId, role: "finance", updatedAt: row.updatedAt },
          run,
        ),
      ).toEqual({ ok: true });
      const [left] = await scratch.sql<{ n: number; mine: number }[]>`
        SELECT count(*) FILTER (WHERE user_id = ${row.userId})::int AS n,
               count(*) FILTER (WHERE user_id = ${founder})::int AS mine FROM sessions`;
      expect(left).toEqual({ n: 0, mine: 1 });
      expect((await rowOf("lena@example.test")).roles).toEqual(["ops"]);
    });

    it("a save against a newer row is a conflict and changes nothing", async () => {
      const stale = await rowOf("lena@example.test");
      await grantRole(
        actor(),
        {
          email: "lena@example.test",
          displayName: "Lena Renamed",
          role: "content",
        },
        run,
      );
      const before = await counts();
      expect(
        await revokeRole(
          actor(),
          { userId: stale.userId, role: "ops", updatedAt: stale.updatedAt },
          run,
        ),
      ).toEqual({ ok: false, reason: "conflict" });
      expect(
        await deactivateUser(
          actor(),
          { userId: stale.userId, updatedAt: stale.updatedAt },
          run,
        ),
      ).toEqual({ ok: false, reason: "conflict" });
      expect(await counts()).toEqual(before);
    });

    it("AC-3: deactivating removes every role and every session", async () => {
      const row = await rowOf("lena@example.test");
      await sessionFor(row.userId);
      expect(
        await deactivateUser(
          actor(),
          { userId: row.userId, updatedAt: row.updatedAt },
          run,
        ),
      ).toEqual({ ok: true });
      const after = await rowOf("lena@example.test");
      expect(after.deactivated).toBe(true);
      expect(after.roles).toEqual([]);
      const [left] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sessions WHERE user_id = ${row.userId}`;
      expect(left?.n).toBe(0);
    });

    it("a grant re-activates a deactivated person", async () => {
      await grantRole(
        actor(),
        { email: "lena@example.test", displayName: "Lena Test", role: "ops" },
        run,
      );
      const row = await rowOf("lena@example.test");
      expect(row.deactivated).toBe(false);
      expect(row.roles).toEqual(["ops"]);
    });

    it("your own admin role cannot be removed, and you cannot deactivate yourself", async () => {
      const me = await rowOf("founder@example.test");
      const before = await counts();
      expect(
        await revokeRole(
          actor(),
          { userId: founder, role: "admin", updatedAt: me.updatedAt },
          run,
        ),
      ).toEqual({ ok: false, reason: "own_admin" });
      expect(
        await deactivateUser(
          actor(),
          { userId: founder, updatedAt: me.updatedAt },
          run,
        ),
      ).toEqual({ ok: false, reason: "own_admin" });
      expect(await counts()).toEqual(before);
      expect((await rowOf("founder@example.test")).roles).toEqual(["admin"]);
    });
  },
);
