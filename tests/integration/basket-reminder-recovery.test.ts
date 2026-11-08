/**
 * Spec 034's recovery attribution and the admin metrics against a migrated PG16 (T-22, T-24 data
 * half; AC-22, AC-24; TASK-452).
 *
 * Reminders and purchases are written directly in a rolled-back transaction; the metrics read runs
 * as the `admin` role so the RLS policies of `0040` are exercised.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  basketReminderMetrics,
  recoveryRateBp,
} from "@/modules/admin/basket-reminders";
import { attributeRecovery, cancelPendingForDraft } from "@/modules/checkout";

import {
  DAY,
  MIN,
  NOW,
  ago,
  hmac,
  liveDraft,
} from "./support/basket-reminder.ts";
import { base } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "basket_reminder_recovery");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rolledBack(db!.sql, async (tx) => {
    await base(tx);
    return fn(tx);
  });
}

async function reminder(
  tx: Tx,
  draftId: string | null,
  fields: {
    status: string;
    skipReason?: string;
    sentAt?: Date;
    restoreCount?: number;
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO basket_reminder (draft_id, locale_code, status, skip_reason, scheduled_for,
                                 sent_at, line_count, email_hmac, restore_count, created_at)
    VALUES (${draftId}, 'en', ${fields.status}, ${fields.skipReason ?? null}, ${ago(DAY)},
            ${fields.sentAt ?? null}, ${fields.status === "sent" ? 1 : null},
            ${fields.status === "sent" ? hmac("buyer@example.test") : null},
            ${fields.restoreCount ?? 0}, ${ago(2 * DAY)})
    RETURNING id`;
  return row?.id ?? "";
}

async function purchase(
  tx: Tx,
  currency: string,
  totalMinor: number,
  mode: "live" | "test" = "live",
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code)
    VALUES (${mode}, ${currency}, ${totalMinor}, 'en') RETURNING id`;
  return row?.id ?? "";
}

const recovered = async (tx: Tx, id: string) => {
  const [row] = await tx<{ recovered_purchase_id: string | null }[]>`
    SELECT recovered_purchase_id FROM basket_reminder WHERE id = ${id}`;
  return row?.recovered_purchase_id ?? null;
};

describe.skipIf(server.url === undefined)(
  "basket reminder recovery and metrics",
  () => {
    it("AC-22: placement cancels a scheduled reminder as purchased", () =>
      run(async (tx) => {
        const draftId = await liveDraft(tx);
        const id = await reminder(tx, draftId, { status: "scheduled" });
        expect(await cancelPendingForDraft(runnerOf(tx), draftId)).toBe(1);
        const [row] = await tx<{ status: string; skip_reason: string }[]>`
        SELECT status, skip_reason FROM basket_reminder WHERE id = ${id}`;
        expect(row).toEqual({ status: "skipped", skip_reason: "purchased" });
      }));

    it("AC-22: attributes inside 7 days, never at 7 days 1 min, never for test, once only", () =>
      run(async (tx) => {
        const exec = runnerOf(tx);
        const inside = await liveDraft(tx);
        const insideId = await reminder(tx, inside, {
          status: "sent",
          sentAt: new Date(NOW.getTime() - 7 * DAY + 60 * MIN),
        });
        const first = await purchase(tx, "PLN", 12900);
        expect(
          await attributeRecovery(exec, {
            draftId: inside,
            purchaseId: first,
            mode: "live",
            now: NOW,
          }),
        ).toBe(insideId);
        expect(await recovered(tx, insideId)).toBe(first);
        const second = await purchase(tx, "PLN", 5000);
        expect(
          await attributeRecovery(exec, {
            draftId: inside,
            purchaseId: second,
            mode: "live",
            now: NOW,
          }),
        ).toBeNull();
        expect(await recovered(tx, insideId)).toBe(first);

        const late = await liveDraft(tx);
        const lateId = await reminder(tx, late, {
          status: "sent",
          sentAt: new Date(NOW.getTime() - 7 * DAY - MIN),
        });
        const third = await purchase(tx, "PLN", 100);
        expect(
          await attributeRecovery(exec, {
            draftId: late,
            purchaseId: third,
            mode: "live",
            now: NOW,
          }),
        ).toBeNull();
        expect(await recovered(tx, lateId)).toBeNull();

        const testDraft = await liveDraft(tx);
        const testId = await reminder(tx, testDraft, {
          status: "sent",
          sentAt: ago(DAY),
        });
        const fourth = await purchase(tx, "PLN", 100, "test");
        expect(
          await attributeRecovery(exec, {
            draftId: testDraft,
            purchaseId: fourth,
            mode: "test",
            now: NOW,
          }),
        ).toBeNull();
        expect(await recovered(tx, testId)).toBeNull();
      }));

    it("AC-22: a draft restored from the link carries the attribution", () =>
      run(async (tx) => {
        const source = await liveDraft(tx);
        const id = await reminder(tx, source, {
          status: "sent",
          sentAt: ago(DAY),
        });
        const restored = await liveDraft(tx);
        await tx`UPDATE checkout_draft SET restored_from_reminder_id = ${id} WHERE id = ${restored}`;
        const bought = await purchase(tx, "GBP", 4500);
        expect(
          await attributeRecovery(runnerOf(tx), {
            draftId: restored,
            purchaseId: bought,
            mode: "live",
            now: NOW,
          }),
        ).toBe(id);
      }));

    it("AC-24: counts, rate and per-currency revenue as the admin role", () =>
      run(async (tx) => {
        const sentIds: string[] = [];
        for (let i = 0; i < 3; i += 1) {
          sentIds.push(
            await reminder(tx, null, {
              status: "sent",
              sentAt: ago(DAY),
              restoreCount: i === 0 ? 2 : 0,
            }),
          );
        }
        await reminder(tx, null, {
          status: "skipped",
          skipReason: "purchased",
        });
        await reminder(tx, null, {
          status: "skipped",
          skipReason: "suppressed",
        });
        await reminder(tx, null, { status: "failed" });
        const gbp = await purchase(tx, "GBP", 4500);
        const pln = await purchase(tx, "PLN", 12900);
        await tx`UPDATE basket_reminder SET recovered_purchase_id = ${gbp}, recovered_at = ${NOW} WHERE id = ${sentIds[0] ?? ""}`;
        await tx`UPDATE basket_reminder SET recovered_purchase_id = ${pln}, recovered_at = ${NOW} WHERE id = ${sentIds[1] ?? ""}`;
        await asApp(tx, { role: "admin" });
        const metrics = await basketReminderMetrics(runnerOf(tx), "30d", NOW);
        expect(metrics.sent).toBe(3);
        expect(metrics.failed).toBe(1);
        expect(metrics.skipped.purchased).toBe(1);
        expect(metrics.skipped.suppressed).toBe(1);
        expect(metrics.skipped.too_late).toBe(0);
        expect(metrics.linksOpened).toBe(1);
        expect(metrics.recoveredPurchases).toBe(2);
        expect(metrics.recoveryRateBp).toBe(6666);
        expect(metrics.recoveredRevenue).toEqual([
          { currency: "GBP", totalMinor: 4500n },
          { currency: "PLN", totalMinor: 12900n },
        ]);
      }));

    it("AC-24: nothing sent gives a rate of 0", () => {
      expect(recoveryRateBp(0, 0)).toBe(0);
      expect(recoveryRateBp(1, 3)).toBe(3333);
    });
  },
);
