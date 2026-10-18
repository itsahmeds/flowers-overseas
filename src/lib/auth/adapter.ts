/**
 * The sign-in core's Auth.js adapter (spec 012 §2.2, §5.2, AC-8; ruling R2; TASK-217).
 *
 * Our own `Adapter`, because `src/lib/db.ts` exports no raw client (spec 002 AC-3): **every method
 * is one `withSystemContext('auth', …)` transaction**, and the auth tables' RLS admits
 * `app.role = 'system'`. The tables are TASK-022's, unmodified (`db/schema/auth.ts`).
 *
 * `useVerificationToken` deletes and returns the row matching the **hashed** token, and the
 * identifier too when one is given: the core's emailed link carries no address (spec 011 §5.2),
 * so Auth.js's email callback is invoked with the token alone and the identifier is resolved here,
 * from the hashed token, on the server. Deleting on use is what makes a link single-use.
 *
 * `run` is injectable so the contract suite drives the same code inside a scratch transaction.
 */
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { and, eq } from "drizzle-orm";

import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "../../../db/schema/auth";
import { type DbTransaction, withSystemContext } from "../db";

/** Runs one unit of work in one transaction. */
export type AuthRunner = <T>(
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

/** The production runner: one system-context transaction named `auth`. */
export const systemAuthRunner: AuthRunner = (fn) =>
  withSystemContext("auth", fn);

type UserRow = typeof users.$inferSelect;

function toAdapterUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    image: row.image,
  };
}

export function createAuthAdapter(run: AuthRunner = systemAuthRunner): Adapter {
  return {
    createUser(user) {
      return run(async (db) => {
        const [row] = await db
          .insert(users)
          .values({
            email: user.email.toLowerCase(),
            emailVerified: user.emailVerified,
            name: user.name ?? null,
            image: user.image ?? null,
          })
          .returning();
        if (row === undefined) throw new Error("createUser returned no row");
        return toAdapterUser(row);
      });
    },
    getUser(id) {
      return run(async (db) => {
        const [row] = await db.select().from(users).where(eq(users.id, id));
        return row === undefined ? null : toAdapterUser(row);
      });
    },
    getUserByEmail(email) {
      return run(async (db) => {
        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()));
        return row === undefined ? null : toAdapterUser(row);
      });
    },
    getUserByAccount({ provider, providerAccountId }) {
      return run(async (db) => {
        const [row] = await db
          .select({ user: users })
          .from(accounts)
          .innerJoin(users, eq(users.id, accounts.userId))
          .where(
            and(
              eq(accounts.provider, provider),
              eq(accounts.providerAccountId, providerAccountId),
            ),
          );
        return row === undefined ? null : toAdapterUser(row.user);
      });
    },
    updateUser(user) {
      return run(async (db) => {
        const [row] = await db
          .update(users)
          .set({
            ...(user.email === undefined
              ? {}
              : { email: user.email.toLowerCase() }),
            ...(user.emailVerified === undefined
              ? {}
              : { emailVerified: user.emailVerified }),
            ...(user.name === undefined ? {} : { name: user.name }),
            ...(user.image === undefined ? {} : { image: user.image }),
          })
          .where(eq(users.id, user.id))
          .returning();
        if (row === undefined) throw new Error("updateUser found no row");
        return toAdapterUser(row);
      });
    },
    async deleteUser(userId) {
      await run((db) => db.delete(users).where(eq(users.id, userId)));
    },
    async linkAccount(account: AdapterAccount) {
      await run((db) =>
        db
          .insert(accounts)
          .values({
            userId: account.userId,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            refresh_token: account.refresh_token ?? null,
            access_token: account.access_token ?? null,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
            id_token: account.id_token ?? null,
            session_state:
              typeof account.session_state === "string"
                ? account.session_state
                : null,
          })
          .onConflictDoNothing(),
      );
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await run((db) =>
        db
          .delete(accounts)
          .where(
            and(
              eq(accounts.provider, provider),
              eq(accounts.providerAccountId, providerAccountId),
            ),
          ),
      );
    },
    createSession(session) {
      return run(async (db) => {
        const [row] = await db
          .insert(sessions)
          .values({
            sessionToken: session.sessionToken,
            userId: session.userId,
            expires: session.expires,
          })
          .returning();
        if (row === undefined) throw new Error("createSession returned no row");
        return row satisfies AdapterSession;
      });
    },
    getSessionAndUser(sessionToken) {
      return run(async (db) => {
        const [row] = await db
          .select({ session: sessions, user: users })
          .from(sessions)
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(eq(sessions.sessionToken, sessionToken));
        return row === undefined
          ? null
          : { session: row.session, user: toAdapterUser(row.user) };
      });
    },
    updateSession(session) {
      return run(async (db) => {
        const [row] = await db
          .update(sessions)
          .set({
            ...(session.expires === undefined
              ? {}
              : { expires: session.expires }),
          })
          .where(eq(sessions.sessionToken, session.sessionToken))
          .returning();
        return row ?? null;
      });
    },
    async deleteSession(sessionToken) {
      await run((db) =>
        db.delete(sessions).where(eq(sessions.sessionToken, sessionToken)),
      );
    },
    createVerificationToken(token) {
      return run(async (db) => {
        const [row] = await db
          .insert(verificationTokens)
          .values({
            identifier: token.identifier.toLowerCase(),
            token: token.token,
            expires: token.expires,
          })
          .returning();
        return row ?? null;
      });
    },
    useVerificationToken(params: {
      identifier?: string;
      token: string;
    }): Promise<VerificationToken | null> {
      return run(async (db) => {
        const [row] = await db
          .delete(verificationTokens)
          .where(
            params.identifier === undefined
              ? eq(verificationTokens.token, params.token)
              : and(
                  eq(verificationTokens.token, params.token),
                  eq(
                    verificationTokens.identifier,
                    params.identifier.toLowerCase(),
                  ),
                ),
          )
          .returning();
        return row ?? null;
      });
    },
  };
}
