/**
 * The admin home's three counters (spec 012 §5.3 `/admin`; artboard
 * `docs/design/wireframes/admin-home-desktop.dc.html`; TASK-217).
 *
 * Orders created today in the viewer's zone (and how many of them are demo or test), new florist
 * applications, and florists by status — counts only, read in one admin-context transaction. No
 * name, contact or recipient field is read.
 *
 * The order count is a plain count beside spec 010's projections, and the application count a
 * plain count: when spec 010's `listOrdersForAdmin` (TASK-202) and spec 011's
 * `listFloristApplications` (TASK-213) are on main, TASK-222 and TASK-221 move these two counts
 * onto them (recorded as a carry-forward in `docs/tasks/TASK-217.md`).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  fulfillmentPartner,
  partnerApplication,
  partnerStatuses,
} from "../../../db/schema/partners";
import { order } from "../../../db/schema/orders";
import type { DbActor } from "@/lib/db";

import { type AdminRunner, adminRunner } from "./users";

export const AdminHomeCountsSchema = z
  .object({
    ordersToday: z.number().int().nonnegative(),
    demoOrdersToday: z.number().int().nonnegative(),
    newApplications: z.number().int().nonnegative(),
    partnersByStatus: z.record(
      z.enum(partnerStatuses),
      z.number().int().nonnegative(),
    ),
  })
  .strict();
export type AdminHomeCounts = z.infer<typeof AdminHomeCountsSchema>;

export async function adminHomeCounts(
  actor: DbActor,
  timeZone: string,
  run: AdminRunner = adminRunner,
): Promise<AdminHomeCounts> {
  return run(actor, async (db) => {
    const startOfToday = sql`(date_trunc('day', now() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone})`;
    const [orders] = await db
      .select({
        total: sql<number>`count(*)::int`,
        demo: sql<number>`count(*) FILTER (WHERE ${order.mode} IN ('demo', 'test'))::int`,
      })
      .from(order)
      .where(sql`${order.createdAt} >= ${startOfToday}`);
    const [applications] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(partnerApplication)
      .where(sql`${partnerApplication.status} = 'new'`);
    const partners = await db
      .select({
        status: fulfillmentPartner.status,
        total: sql<number>`count(*)::int`,
      })
      .from(fulfillmentPartner)
      .groupBy(fulfillmentPartner.status);
    const byStatus = Object.fromEntries(
      partnerStatuses.map((status) => [
        status,
        partners.find((row) => row.status === status)?.total ?? 0,
      ]),
    );
    return AdminHomeCountsSchema.parse({
      ordersToday: orders?.total ?? 0,
      demoOrdersToday: orders?.demo ?? 0,
      newApplications: applications?.total ?? 0,
      partnersByStatus: byStatus,
    });
  });
}
