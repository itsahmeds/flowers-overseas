/**
 * Admin users and roles (spec 012 §2.2 "Bootstrap and users", §5.2 `AdminGrantSchema`, AC-3;
 * TASK-217).
 *
 * The commands `/admin/users` composes with the guard (`users.manage`, admin only), and the one
 * `pnpm admin:grant` runs over the direct URL:
 *
 *  - `grantRole` creates or updates the user (by email), their `admin_profile` (clearing a
 *    deactivation) and the role;
 *  - `revokeRole` removes one role; `deactivateUser` sets `deactivated_at` and removes every role.
 *    Both **delete the user's sessions in the same transaction** (AC-3), so the person is signed
 *    out at once, and both carry the profile's `updated_at`: a save against a newer row is a
 *    conflict and changes nothing (§5.2 "Concurrency").
 *  - Nobody can remove their own admin role or deactivate themselves (the "own last admin role"
 *    rule: there is one `admin` role per person, so removing your own is removing your last).
 *
 * Every write runs in one admin-context transaction (`withAdminContext`). TASK-218 adds the
 * required audit `action` to that context; the action names are already the dotted ones here.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProfile } from "../../../db/schema/admin";
import { adminRoles, sessions, userRole, users } from "../../../db/schema/auth";
import { type DbActor, type DbTransaction, withAdminContext } from "@/lib/db";

/** Runs one admin write or read, as `actor`, in one transaction. */
export type AdminRunner = <T>(
  actor: DbActor,
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

export const adminRunner: AdminRunner = (actor, fn) =>
  withAdminContext(actor, fn);

const DisplayNameSchema = z.string().trim().min(2).max(80);

export const AdminGrantSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    displayName: DisplayNameSchema,
    role: z.enum(adminRoles),
  })
  .strict();
export type AdminGrant = z.infer<typeof AdminGrantSchema>;

export const AdminRevokeSchema = z
  .object({
    userId: z.uuid(),
    role: z.enum(adminRoles),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const AdminDeactivateSchema = z
  .object({
    userId: z.uuid(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type UserCommandResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "conflict" | "own_admin" | "not_found";
    };

export interface AdminUserRow {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly (typeof adminRoles)[number][];
  readonly deactivated: boolean;
  /** The profile's version, carried by every edit form. */
  readonly updatedAt: string;
}

export async function listAdminUsers(
  actor: DbActor,
  run: AdminRunner = adminRunner,
): Promise<AdminUserRow[]> {
  return run(actor, async (db) => {
    const rows = await db
      .select({
        userId: adminProfile.userId,
        email: users.email,
        displayName: adminProfile.displayName,
        deactivatedAt: adminProfile.deactivatedAt,
        updatedAt: adminProfile.updatedAt,
        roles: sql<
          string[]
        >`coalesce(array_agg(${userRole.role} ORDER BY ${userRole.role}) FILTER (WHERE ${userRole.role} IS NOT NULL), '{}')`,
      })
      .from(adminProfile)
      .innerJoin(users, eq(users.id, adminProfile.userId))
      .leftJoin(userRole, eq(userRole.userId, adminProfile.userId))
      .groupBy(adminProfile.userId, users.email)
      .orderBy(asc(adminProfile.displayName));
    return rows.map((row) => ({
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      roles: z.array(z.enum(adminRoles)).parse(row.roles),
      deactivated: row.deactivatedAt !== null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
}

export async function grantRole(
  actor: DbActor,
  input: unknown,
  run: AdminRunner = adminRunner,
): Promise<UserCommandResult> {
  const parsed = AdminGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, displayName, role } = parsed.data;
  await run(actor, async (db) => {
    const [user] = await db
      .insert(users)
      .values({ email })
      .onConflictDoUpdate({ target: users.email, set: { email } })
      .returning({ id: users.id });
    if (user === undefined) throw new Error("grantRole: no user row");
    await db
      .insert(adminProfile)
      .values({ userId: user.id, displayName })
      .onConflictDoUpdate({
        target: adminProfile.userId,
        set: { displayName, deactivatedAt: null },
      });
    await db
      .insert(userRole)
      .values({ userId: user.id, role })
      .onConflictDoNothing();
  });
  return { ok: true };
}

/** Locks the profile row and checks its version; `undefined` when it matches. */
async function checkVersion(
  db: DbTransaction,
  userId: string,
  updatedAt: string,
): Promise<UserCommandResult | undefined> {
  const [row] = await db
    .select({ updatedAt: adminProfile.updatedAt })
    .from(adminProfile)
    .where(eq(adminProfile.userId, userId))
    .for("update");
  if (row === undefined) return { ok: false, reason: "not_found" };
  if (row.updatedAt.getTime() !== new Date(updatedAt).getTime()) {
    return { ok: false, reason: "conflict" };
  }
  return undefined;
}

export async function revokeRole(
  actor: DbActor & { readonly userId: string },
  input: unknown,
  run: AdminRunner = adminRunner,
): Promise<UserCommandResult> {
  const parsed = AdminRevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { userId, role, updatedAt } = parsed.data;
  if (userId === actor.userId && role === "admin") {
    return { ok: false, reason: "own_admin" };
  }
  return run(actor, async (db) => {
    const refused = await checkVersion(db, userId, updatedAt);
    if (refused !== undefined) return refused;
    await db
      .delete(userRole)
      .where(and(eq(userRole.userId, userId), eq(userRole.role, role)));
    // Bump the version, so a second form opened before this save is a conflict.
    await db
      .update(adminProfile)
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(eq(adminProfile.userId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return { ok: true } as const;
  });
}

export async function deactivateUser(
  actor: DbActor & { readonly userId: string },
  input: unknown,
  run: AdminRunner = adminRunner,
): Promise<UserCommandResult> {
  const parsed = AdminDeactivateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { userId, updatedAt } = parsed.data;
  if (userId === actor.userId) return { ok: false, reason: "own_admin" };
  return run(actor, async (db) => {
    const refused = await checkVersion(db, userId, updatedAt);
    if (refused !== undefined) return refused;
    await db
      .update(adminProfile)
      .set({ deactivatedAt: sql`now()`, updatedAt: sql`clock_timestamp()` })
      .where(eq(adminProfile.userId, userId));
    await db.delete(userRole).where(eq(userRole.userId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return { ok: true } as const;
  });
}
