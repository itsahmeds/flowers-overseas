/**
 * `publish_run` over Drizzle: the database half of `./publish.ts` (spec 012b §2.3, migration
 * `0033_catalogue_cms`; TASK-295). Every function takes the transaction it runs in, so the admin
 * request runs inside `withAdminContext` (audited) and the job and the boot inside
 * `withSystemContext`.
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { publishRun } from "../../db/schema/ops";

import type { DbTransaction } from "./db";
import {
  OPEN_RUN_STATUSES,
  type NewPublishRun,
  type PublishEnvironment,
  type PublishRun,
  type PublishRunStatus,
  type PublishStore,
} from "./publish";

type Row = typeof publishRun.$inferSelect;

function toRun(row: Row): PublishRun {
  return {
    id: row.id,
    environment: row.environment as PublishEnvironment,
    reason: row.reason,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    targetRef: row.targetRef,
    headSha: row.headSha,
    expectedHash: row.expectedHash,
    addedCount: row.addedCount,
    removedCount: row.removedCount,
    status: row.status as PublishRunStatus,
    providerDeploymentId: row.providerDeploymentId,
    errorCode: row.errorCode,
    finishedAt: row.finishedAt,
  };
}

/** The UTC calendar day of `now`, as `[start, end)`. */
function dayOf(now: Date): readonly [Date, Date] {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return [start, new Date(start.getTime() + 86_400_000)];
}

/** The store over one open transaction. */
export function dbPublishStore(db: DbTransaction): PublishStore {
  return {
    async openRun(environment) {
      const [row] = await db
        .select()
        .from(publishRun)
        .where(
          and(
            eq(publishRun.environment, environment),
            inArray(publishRun.status, [...OPEN_RUN_STATUSES]),
          ),
        )
        .for("update")
        .limit(1);
      return row === undefined ? null : toRun(row);
    },
    async runsOnDay(environment, now) {
      const [start, end] = dayOf(now);
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(publishRun)
        .where(
          and(
            eq(publishRun.environment, environment),
            gte(publishRun.requestedAt, start),
            lt(publishRun.requestedAt, end),
          ),
        );
      return row?.count ?? 0;
    },
    async insert(run: NewPublishRun, now: Date) {
      const [row] = await db
        .insert(publishRun)
        .values({ ...run, requestedAt: now, status: "requested" })
        .returning();
      if (row === undefined)
        throw new Error("publish_run insert returned no row");
      return toRun(row);
    },
    async get(id) {
      const [row] = await db
        .select()
        .from(publishRun)
        .where(eq(publishRun.id, id))
        .limit(1);
      return row === undefined ? null : toRun(row);
    },
    async move(id, from, to, patch) {
      const moved = await db
        .update(publishRun)
        .set({ status: to, ...patch })
        .where(and(eq(publishRun.id, id), eq(publishRun.status, from)))
        .returning({ id: publishRun.id });
      return moved.length === 1;
    },
    async history(environment, limit) {
      const rows = await db
        .select()
        .from(publishRun)
        .where(eq(publishRun.environment, environment))
        .orderBy(desc(publishRun.requestedAt))
        .limit(limit);
      return rows.map(toRun);
    },
  };
}
