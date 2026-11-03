/**
 * The weekly close (spec 030a §2.4, §5.2 `closeDuePayouts`, "Founder emails" F2; AC-14, AC-15;
 * TASK-364): the `payouts.close` job, hourly.
 *
 * For each florist with an open weekly payout, in one `system` transaction:
 *
 *  - the florist's row is locked `FOR UPDATE` (the lock an accrual takes first, so a line cannot
 *    slip into a payout as it closes), then its open weekly payout;
 *  - when the payout's `period_end` is before the florist's local date at `now` (the Sunday has
 *    passed **in the florist's zone**, read through `localDateIn`, never with an offset): a total
 *    above zero sets `closed_at = now`; a total of zero or less moves `period_end` to the Sunday
 *    of the current local ISO week and leaves it open (a claw-back carries forward);
 *  - one F2 (`payouts-ready`) goes to the founder for the run when it closed at least one payout,
 *    keyed `job:payouts.close:{now}` in `notification_delivery`, in the same transaction: if the
 *    email cannot be sent the closes roll back with it and the next hourly run tries again.
 *
 * Idempotent: a second run finds the closed payouts closed and the rolled ones not yet due.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

import { localDateIn, weeklyPeriod } from "./dates";

/** Sends F2 for one run: `closedAt` is the instant every payout of the run was closed at. */
export type PayoutsReadySender = (
  executor: OrderExecutor,
  input: { readonly closedAt: Date; readonly count: number },
) => Promise<void>;

export interface CloseDeps {
  readonly executor?: OrderExecutor;
  readonly sendReady?: PayoutsReadySender;
  readonly log?: Logger;
}

export interface CloseResult {
  readonly closed: number;
  readonly rolledOver: number;
}

const defaultSendReady: PayoutsReadySender = async (executor, input) => {
  const { sendOpsJobNotification } = await import("@/modules/notifications");
  await sendOpsJobNotification(executor, {
    job: "payouts.close",
    jobId: input.closedAt.toISOString(),
  });
};

const PartnerIdRow = z.object({ partner_id: z.uuid() });
const PartnerRow = z.object({ code: z.string(), iana_zone: z.string().min(1) });
const OpenRow = z.object({
  id: z.uuid(),
  period_end: z.iso.date(),
  total_minor: z.coerce.bigint(),
});

/** spec 030a §5.2 `closeDuePayouts(now)`. */
export async function closeDuePayouts(
  now: Date,
  deps: CloseDeps = {},
): Promise<CloseResult> {
  const at = z.date().parse(now);
  const log = deps.log ?? defaultLogger;
  const sendReady = deps.sendReady ?? defaultSendReady;
  return withExecutor(
    deps.executor === undefined ? undefined : { executor: deps.executor },
    "payouts.close",
    async (executor) => {
      const partners = await executor.execute(sql`
        SELECT DISTINCT partner_id FROM payout
        WHERE kind = 'weekly' AND closed_at IS NULL
        ORDER BY partner_id`);
      let closed = 0;
      let rolledOver = 0;
      for (const row of partners) {
        const { partner_id: partnerId } = PartnerIdRow.parse(row);
        const [partnerRow] = await executor.execute(sql`
          SELECT fp.code, c.iana_zone
          FROM fulfillment_partner fp JOIN country c ON c.id = fp.country_id
          WHERE fp.id = ${partnerId}
          FOR UPDATE OF fp`);
        const partner = PartnerRow.parse(partnerRow);
        const [openRow] = await executor.execute(sql`
          SELECT id, period_end::text AS period_end, total_minor::text AS total_minor
          FROM payout
          WHERE partner_id = ${partnerId} AND kind = 'weekly' AND closed_at IS NULL
          FOR UPDATE`);
        if (openRow === undefined) continue;
        const open = OpenRow.parse(openRow);
        const today = localDateIn(at, partner.iana_zone);
        if (open.period_end >= today) continue;
        if (open.total_minor > 0n) {
          await executor.execute(sql`
            UPDATE payout SET closed_at = ${at.toISOString()}::timestamptz WHERE id = ${open.id}`);
          closed += 1;
        } else {
          const end = weeklyPeriod(today).end;
          await executor.execute(sql`
            UPDATE payout SET period_end = ${end}::date WHERE id = ${open.id}`);
          rolledOver += 1;
          log.info(
            { payout_id: open.id, partner_code: partner.code },
            "payouts.rolled_over",
          );
        }
      }
      if (closed > 0) {
        await sendReady(executor, { closedAt: at, count: closed });
      }
      log.info({ count: closed, rolled_over: rolledOver }, "payouts.closed");
      return { closed, rolledOver };
    },
  );
}
