/**
 * T-35 — the Auth.js v5 Drizzle adapter's round trip against our tables, unmodified (spec 002
 * §10 T-35, §13 Q1, AC-4 schema shape; migration `0010_auth.sql`; TASK-022).
 *
 * `@auth/drizzle-adapter` is not a dependency yet (spec 012's TASK-217 adds it), so this is the
 * spec's "scripted create-user → create-session → get-session-and-user → delete-session round
 * trip", written with the same Drizzle calls the adapter makes on the tables it is handed
 * (`db/schema/auth.ts`), through the same property names. It also covers the rest of the adapter
 * surface the sign-in flows use: `getUserByEmail`, `linkAccount`, the verification-token pair, and
 * `deleteUser` taking the user's sessions and accounts with it.
 *
 * Plus the three keys `0010` added into `users`, read from `pg_constraint` with their delete rule.
 */
import { and, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "../../db/schema/auth.ts";
import { DEFERRED_FOREIGN_KEYS } from "../fixtures/schema-foreign-keys.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `T-35 — Auth.js adapter round trip${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "auth");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("create user → create session → get session and user → delete session, and the rest of the surface", async () => {
      const outcome: Record<string, unknown> = {};
      await drizzle(scratch.sql)
        .transaction(async (db) => {
          // createUser: the adapter drops the id it is given when the column has a default.
          const [user] = await db
            .insert(users)
            .values({
              email: "founder@example.test",
              emailVerified: null,
              name: null,
              image: null,
            })
            .returning();
          if (user === undefined)
            throw new Error("createUser returned nothing");
          outcome.user = user;
          [outcome.byEmail] = await db
            .select()
            .from(users)
            .where(eq(users.email, "founder@example.test"));
          const expires = new Date(Date.now() + 86_400_000);
          [outcome.session] = await db
            .insert(sessions)
            .values({
              sessionToken: "session-token-1",
              userId: user.id,
              expires,
            })
            .returning();
          [outcome.joined] = await db
            .select({ session: sessions, user: users })
            .from(sessions)
            .where(eq(sessions.sessionToken, "session-token-1"))
            .innerJoin(users, eq(users.id, sessions.userId));
          await db.insert(accounts).values({
            userId: user.id,
            type: "email",
            provider: "resend",
            providerAccountId: "founder@example.test",
          });
          await db.insert(verificationTokens).values({
            identifier: "founder@example.test",
            token: "hashed-token",
            expires,
          });
          [outcome.used] = await db
            .delete(verificationTokens)
            .where(
              and(
                eq(verificationTokens.identifier, "founder@example.test"),
                eq(verificationTokens.token, "hashed-token"),
              ),
            )
            .returning();
          [outcome.deleted] = await db
            .delete(sessions)
            .where(eq(sessions.sessionToken, "session-token-1"))
            .returning();
          [outcome.afterDelete] = await db
            .select()
            .from(sessions)
            .where(eq(sessions.sessionToken, "session-token-1"));
          await db.insert(sessions).values({
            sessionToken: "session-token-2",
            userId: user.id,
            expires,
          });
          await db.delete(users).where(eq(users.id, user.id));
          outcome.left = [
            ...(await db.execute(
              sql`SELECT (SELECT count(*)::int FROM sessions) AS sessions,
                         (SELECT count(*)::int FROM accounts) AS accounts`,
            )),
          ];
          // Leave the scratch database as it was.
          db.rollback();
        })
        .catch((error: unknown) => {
          if (!(error instanceof TransactionRollbackError)) throw error;
        });
      const user = outcome.user as typeof users.$inferSelect;
      const joined = outcome.joined as {
        session: typeof sessions.$inferSelect;
        user: typeof users.$inferSelect;
      };
      expect(Object.keys(user).sort()).toEqual(
        [
          "id",
          "name",
          "email",
          "emailVerified",
          "image",
          "createdAt",
          "updatedAt",
        ].sort(),
      );
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect((outcome.byEmail as typeof users.$inferSelect).id).toBe(user.id);
      expect((outcome.session as typeof sessions.$inferSelect).userId).toBe(
        user.id,
      );
      expect(joined.user.email).toBe("founder@example.test");
      expect(joined.session.expires).toBeInstanceOf(Date);
      expect(
        (outcome.used as typeof verificationTokens.$inferSelect).token,
      ).toBe("hashed-token");
      expect(
        (outcome.deleted as typeof sessions.$inferSelect).sessionToken,
      ).toBe("session-token-1");
      expect(outcome.afterDelete).toBeUndefined();
      expect(outcome.left).toEqual([{ sessions: 0, accounts: 0 }]);
    });

    it("the three keys into users exist with their delete rules", async () => {
      const RULE: Record<string, string> = {
        RESTRICT: "r",
        CASCADE: "c",
        "SET NULL": "n",
      };
      const expected = [
        ...DEFERRED_FOREIGN_KEYS.filter(
          ([, , parent]) => parent === "users",
        ).map(([fk, , , , rule]) => ({ fk, rule: RULE[rule] ?? rule })),
        { fk: "audit_log_actor_user_id_users_id_fk", rule: "n" },
      ].sort((a, b) => (a.fk < b.fk ? -1 : 1));
      const rows = await scratch.sql<{ fk: string; rule: string }[]>`
        SELECT conname AS fk, confdeltype::text AS rule FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'public.users'::regclass
          AND conrelid NOT IN ('public.accounts'::regclass, 'public.sessions'::regclass,
                               'public.user_role'::regclass)
        ORDER BY conname`;
      expect([...rows]).toEqual(expected);
    });

    it("a buyer's customer row outlives the account; a florist's memberships do not", async () => {
      const left = await rolledBack(scratch.sql, async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('buyer@example.test') RETURNING id`;
        const userId = user?.id ?? "";
        await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('PLN', 2)`;
        const [country] = await tx<{ id: string }[]>`
          INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
          VALUES ('PL', 'PLN', 800, 'Europe/Warsaw') RETURNING id`;
        const [partner] = await tx<{ id: string }[]>`
          INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
            contact_email, payout_currency_code, capacity_per_day)
          VALUES ('florist-a', 'Florist A', 'Warszawa', ${country?.id ?? ""}, 'demo',
            'a@example.test', 'PLN', 15) RETURNING id`;
        await tx`INSERT INTO partner_member (user_id, partner_id, role)
                 VALUES (${userId}, ${partner?.id ?? ""}, 'owner')`;
        await tx`INSERT INTO customer (email_normalised, user_id) VALUES ('buyer@example.test', ${userId})`;
        await tx`DELETE FROM users WHERE id = ${userId}`;
        return tx<{ members: number; customers: number; linked: number }[]>`
          SELECT (SELECT count(*)::int FROM partner_member) AS members,
                 (SELECT count(*)::int FROM customer) AS customers,
                 (SELECT count(*)::int FROM customer WHERE user_id IS NOT NULL) AS linked`;
      });
      expect([...left]).toEqual([{ members: 0, customers: 1, linked: 0 }]);
    });
  },
);
