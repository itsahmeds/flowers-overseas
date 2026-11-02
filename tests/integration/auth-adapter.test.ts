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
 * Plus the three keys `0010` added into `users`, read from `pg_constraint` with their delete rule,
 * and the one of them that meets `0009`'s append-only `audit_log` (review r2, breaker HOLE 1).
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
  pgFailure,
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

    it("the keys into users exist with their delete rules", async () => {
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
        // `0014_admin_identity` (spec 012, TASK-217): an admin with a history is deactivated,
        // never deleted.
        { fk: "admin_profile_user_id_users_id_fk", rule: "r" },
        // `0023_review_attestation` (spec 012b, TASK-293): a ledger row keeps its attester; a
        // reviewer's locale grants go with the account.
        { fk: "review_attestation_attester_user_id_users_id_fk", rule: "r" },
        { fk: "reviewer_locale_user_id_users_id_fk", rule: "c" },
        // `0024_blog` (spec 044, TASK-321): a withdrawn author and a revision's writer keep their
        // account, so neither key lets a user row go.
        { fk: "blog_author_user_id_users_id_fk", rule: "r" },
        { fk: "blog_post_revision_created_by_users_id_fk", rule: "r" },
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
        // `partner_member.locale_code` defaults to `en` and is keyed to `locale` (`0022_florists_v0`,
        // TASK-211), so the member's language must exist.
        await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English')
                 ON CONFLICT DO NOTHING`;
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

    it("deleting an audit actor keeps the record: the key goes NULL, the label stays, nothing else is writable (HOLE 1)", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const [gone, stays] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('gone@example.test'), ('stays@example.test')
          RETURNING id`;
        const goneId = gone?.id ?? "";
        const staysId = stays?.id ?? "";
        const audit = async (actor: string, label: string): Promise<string> => {
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO audit_log (actor_user_id, actor_label, action, entity_table, entity_id,
              after, request_id)
            VALUES (${actor}, ${label}, 'partner.status_set', 'fulfillment_partner', 'p-1',
              '{"status":"live"}', 'req-1') RETURNING id`;
          return row?.id ?? "";
        };
        const goneRow = await audit(goneId, "Ada (admin)");
        const staysRow = await audit(staysId, "Bo (admin)");
        const refused = (fn: (sp: typeof tx) => Promise<unknown>) =>
          pgFailure(tx, fn).then((f) => f.raised ?? f.code);
        const before = {
          // The actor still exists: no hand-written UPDATE may drop, re-point or rewrite.
          nullWhileActorExists: await refused(
            (sp) =>
              sp`UPDATE audit_log SET actor_user_id = NULL WHERE id = ${staysRow}`,
          ),
          repoint: await refused(
            (sp) =>
              sp`UPDATE audit_log SET actor_user_id = ${staysId} WHERE id = ${goneRow}`,
          ),
          nullAndRelabel: await refused(
            (sp) =>
              sp`UPDATE audit_log SET actor_user_id = NULL, actor_label = 'someone else'
                 WHERE id = ${goneRow}`,
          ),
        };
        const deleted = (await tx`DELETE FROM users WHERE id = ${goneId}`)
          .count;
        const rows = await tx<
          { id: string; actor_user_id: string | null; actor_label: string }[]
        >`SELECT id, actor_user_id, actor_label FROM audit_log ORDER BY actor_label`;
        const after = {
          relabel: await refused(
            (sp) =>
              sp`UPDATE audit_log SET actor_label = 'someone else' WHERE id = ${goneRow}`,
          ),
          nullAgain: await refused(
            (sp) =>
              sp`UPDATE audit_log SET actor_user_id = NULL WHERE id = ${goneRow}`,
          ),
          remove: await refused(
            (sp) => sp`DELETE FROM audit_log WHERE id = ${goneRow}`,
          ),
        };
        // The FK makes a dangling key impossible, so lift it inside this rolled-back
        // transaction to reach the one state where only the column rule decides: the actor is
        // gone, the key still points at it, and an UPDATE that nulls it also changes a column,
        // or points it at someone else.
        const dangling = await tx.savepoint(async (sp) => {
          await sp`ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_user_id_users_id_fk`;
          await sp`DELETE FROM users WHERE id = ${staysId}`;
          const [other] = await sp<{ id: string }[]>`
            INSERT INTO users (email) VALUES ('other@example.test') RETURNING id`;
          return {
            nullAndRelabel: await refused(
              (inner) =>
                inner`UPDATE audit_log SET actor_user_id = NULL, actor_label = 'someone else'
                      WHERE id = ${staysRow}`,
            ),
            nullAndRetime: await refused(
              (inner) =>
                inner`UPDATE audit_log SET actor_user_id = NULL, at = at - interval '1 day'
                      WHERE id = ${staysRow}`,
            ),
            repointToOther: await refused(
              (inner) =>
                inner`UPDATE audit_log SET actor_user_id = ${other?.id ?? ""}
                      WHERE id = ${staysRow}`,
            ),
            // The control: the same row, the key alone set NULL, is the one update that passes.
            nullOnly: (
              await sp`UPDATE audit_log SET actor_user_id = NULL WHERE id = ${staysRow}`
            ).count,
          };
        });
        return {
          before,
          deleted,
          rows: rows.map((r) => ({
            row: r.id === goneRow ? "gone" : "stays",
            actor:
              r.actor_user_id === null
                ? null
                : r.actor_user_id === staysId
                  ? "stays"
                  : r.actor_user_id,
            label: r.actor_label,
          })),
          after,
          dangling,
        };
      });
      expect(result).toEqual({
        before: {
          nullWhileActorExists: "AUDIT_LOG_APPEND_ONLY",
          repoint: "AUDIT_LOG_APPEND_ONLY",
          nullAndRelabel: "AUDIT_LOG_APPEND_ONLY",
        },
        deleted: 1,
        rows: [
          { row: "gone", actor: null, label: "Ada (admin)" },
          { row: "stays", actor: "stays", label: "Bo (admin)" },
        ],
        after: {
          relabel: "AUDIT_LOG_APPEND_ONLY",
          nullAgain: "AUDIT_LOG_APPEND_ONLY",
          remove: "AUDIT_LOG_APPEND_ONLY",
        },
        dangling: {
          nullAndRelabel: "AUDIT_LOG_APPEND_ONLY",
          nullAndRetime: "AUDIT_LOG_APPEND_ONLY",
          repointToOther: "AUDIT_LOG_APPEND_ONLY",
          nullOnly: 1,
        },
      });
    });
  },
);
