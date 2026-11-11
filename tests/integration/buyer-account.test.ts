/**
 * Spec 018 §14 A-founder-2026-10-22 row A against a migrated PG16 (T-53, T-54, T-55, T-61; AC-53,
 * AC-54, AC-55, AC-61; TASK-352): migration `0047_buyer_account` (its tables, columns, checks,
 * limits, RLS, retention and flag rows, and its guarded rollback), `saveDetails` and the buyer's
 * update guard, `saveRecipientFromOrder` by place kind and at the 21st save, `removeSavedRecipient`
 * and `markSavedRecipientUsed` under two customers and `public`, the `saved_recipient` sweep step
 * at 729 and 731 days, the DSAR runbook's SQL by phone, "Sign out on all devices", and
 * `buyerCheckoutProfile` with no session, admin and florist cookies and the buyer's own.
 *
 * Its own scratch database, because the last block rolls the migration back. No real person,
 * address or phone number: reserved fiction ranges only.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBuyerAuth, resolveBuyerContext } from "@/lib/auth/buyer";
import {
  type AccountRunner,
  listSavedRecipients,
  markSavedRecipientUsed,
  readAccountDetails,
  recipientSaveOffer,
  removeSavedRecipient,
  saveDetails,
  saveRecipientFromOrder,
} from "@/modules/customers";
import { buyerCheckoutProfile } from "@/modules/customers/checkout-profile";

import { runRetentionSweep } from "../../src/jobs/retention.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import { orderParents, unique } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
const MIGRATION_MS = 180_000;
const DAY = 86_400_000;
const NOW = new Date("2026-11-18T12:00:00.000Z");

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "buyer_account");
  }
}, MIGRATION_MS);

afterAll(async () => {
  await db?.drop();
});

/** An order recipient as `place` writes it, with everything a saved copy must not keep. */
const SNAPSHOT = {
  fullName: "Ola Testowa",
  phoneE164: "+48500000101",
  addressLines: ["ul. Testowa 1", "m. 2"],
  postcode: "00-001",
  city: "Warszawa",
  placeKind: "home",
  deliveryNote: "Ring twice",
  cardMessage: "Happy birthday",
  signAs: "Ann",
};

interface Buyer {
  readonly userId: string;
  readonly customerId: string;
  readonly recipientId: string;
  readonly countryId: string;
}

async function buyer(tx: Tx): Promise<Buyer> {
  const userId = randomUUID();
  await tx`INSERT INTO users (id, email) VALUES (${userId}, ${`${unique("u")}@example.test`})`;
  const parents = await orderParents(tx, userId);
  return { userId, ...parents };
}

/** A live order of `who` whose recipient snapshot is `snapshot`. */
async function order(
  tx: Tx,
  who: Buyer,
  snapshot: Record<string, unknown> = SNAPSHOT,
): Promise<string> {
  const orderId = await insertPlacedOrder(tx, { ...who, mode: "live" });
  await tx`SET LOCAL session_replication_role = replica`;
  await tx`UPDATE "order" SET recipient_snapshot = ${JSON.stringify(snapshot)}::jsonb WHERE id = ${orderId}`;
  await tx`SET LOCAL session_replication_role = origin`;
  return orderId;
}

/** Back to the server's own role, as the `system` context. */
async function asOwner(tx: Tx): Promise<void> {
  await tx.unsafe("RESET ROLE");
  await tx`SELECT set_config('app.role', 'system', true)`;
}

/** Runs each call as `who`'s `customer` context (RLS), then returns to the owner. */
function customerRun(tx: Tx, who: { userId: string }): AccountRunner {
  return async (fn) => {
    await asApp(tx, { role: "customer", userId: who.userId });
    try {
      return await fn(runnerOf(tx));
    } finally {
      await asOwner(tx);
    }
  };
}

async function savedCount(tx: Tx, customerId?: string): Promise<number> {
  const [row] =
    customerId === undefined
      ? await tx<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM saved_recipient`
      : await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM saved_recipient WHERE customer_id = ${customerId}`;
  return row?.count ?? -1;
}

/** One saved row for `who`, inserted as the owner, last used at `at`. */
async function savedRow(
  tx: Tx,
  who: Buyer,
  options: { phone?: string; at?: Date; name?: string } = {},
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO saved_recipient (customer_id, full_name, phone_e164, lines, city, country_id,
                                 last_used_at)
    VALUES (${who.customerId}, ${options.name ?? "Test Recipient"},
            ${options.phone ?? "+48500000201"}, ARRAY['ul. Testowa 3'], 'Kraków',
            ${who.countryId}, ${(options.at ?? NOW).toISOString()}::timestamptz)
    RETURNING id`;
  return row?.id ?? "";
}

describe.skipIf(server.url === undefined)(
  "spec 018 row A on a migrated database (TASK-352)",
  () => {
    describe("0047's schema (C.11)", () => {
      it("saved_recipient has exactly C.11's columns: no card message, note, place kind or email (AC-54)", async () => {
        const columns = await db!.sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_recipient'
          ORDER BY ordinal_position`;
        expect(columns.map((c) => c.column_name)).toEqual([
          "id",
          "customer_id",
          "full_name",
          "phone_e164",
          "lines",
          "postal_code",
          "city",
          "country_id",
          "last_used_at",
          "created_at",
          "updated_at",
        ]);
      });

      it("customer gains the four columns; occasion_reminder has no year and no free text", async () => {
        const customer = await db!.sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'customer'
            AND column_name IN ('preferred_locale', 'preferred_currency', 'reminder_consent',
                                'reminder_unsubscribe_token', 'last_signed_in_at')
          ORDER BY column_name`;
        expect(customer.map((c) => c.column_name)).toEqual([
          "last_signed_in_at",
          "preferred_currency",
          "preferred_locale",
          "reminder_consent",
          "reminder_unsubscribe_token",
        ]);
        const reminder = await db!.sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'occasion_reminder'
          ORDER BY ordinal_position`;
        expect(reminder.map((c) => c.column_name)).toEqual([
          "id",
          "customer_id",
          "saved_recipient_id",
          "occasion_key",
          "day",
          "month",
          "lead_days",
          "last_sent_for",
          "created_at",
          "updated_at",
        ]);
      });

      it("occasion_reminder takes 29 February and refuses 30 February and a lead of 5 days", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await buyer(tx);
          const insert =
            (month: number, day: number, lead = 7) =>
            (sp: Tx) =>
              sp`INSERT INTO occasion_reminder (customer_id, occasion_key, day, month, lead_days)
               VALUES (${who.customerId}, 'birthday', ${day}, ${month}, ${lead})`;
          await insert(2, 29)(tx);
          expect((await pgFailure(tx, insert(2, 30))).constraint).toBe(
            "occasion_reminder_calendar_check",
          );
          expect((await pgFailure(tx, insert(4, 31))).constraint).toBe(
            "occasion_reminder_calendar_check",
          );
          expect((await pgFailure(tx, insert(5, 1, 5))).constraint).toBe(
            "occasion_reminder_lead_days_check",
          );
        });
      });

      it("seeds the three retention rows and the two flags, off", async () => {
        const policies = await db!.sql<
          { key: string; retention_days: number | null; action: string }[]
        >`
          SELECT key, retention_days, action FROM retention_policy
          WHERE key IN ('saved_recipient', 'occasion_reminder', 'buyer_account_inactive')
          ORDER BY key`;
        expect(policies).toEqual([
          {
            key: "buyer_account_inactive",
            retention_days: 730,
            action: "pseudonymise",
          },
          { key: "occasion_reminder", retention_days: null, action: "keep" },
          { key: "saved_recipient", retention_days: 730, action: "delete" },
        ]);
        const flags = await db!.sql<
          { key: string; enabled_default: boolean }[]
        >`
          SELECT key, enabled_default FROM feature_flag
          WHERE key IN ('account.recipients', 'account.reminders') ORDER BY key`;
        expect(flags).toEqual([
          { key: "account.recipients", enabled_default: false },
          { key: "account.reminders", enabled_default: false },
        ]);
      });
    });

    describe("details (C.7.2, AC-53)", () => {
      it("saves name, phone, country, language and currency for the signed-in customer only", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const other = await buyer(tx);
          const input = {
            name: "Anna Example",
            phoneE164: "+447700900123",
            countryIso2: "GB",
            preferredLocale: "pl" as const,
            preferredCurrency: "GBP",
          };
          expect(
            await saveDetails(customerRun(tx, anna), anna.customerId, input),
          ).toBe(true);
          const details = await readAccountDetails(
            customerRun(tx, anna),
            anna.customerId,
          );
          expect(details).toMatchObject({
            name: "Anna Example",
            phoneE164: "+447700900123",
            countryIso2: "GB",
            preferredLocale: "pl",
            preferredCurrency: "GBP",
          });
          // Another customer's id, under Anna's context: RLS admits no row, nothing is written.
          expect(
            await saveDetails(customerRun(tx, anna), other.customerId, input),
          ).toBe(false);
          const [untouched] = await tx<{ name: string | null }[]>`
            SELECT name FROM customer WHERE id = ${other.customerId}`;
          expect(untouched?.name).toBeNull();
        });
      });

      it("a buyer session cannot change the reminder consent, its token or the sign-in time", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          for (const assignment of [
            "reminder_consent = true",
            `reminder_unsubscribe_token = '${randomBytes(16).toString("base64url")}'`,
            "last_signed_in_at = now()",
          ]) {
            const failure = await pgFailure(tx, async (sp) => {
              await asApp(sp, { role: "customer", userId: anna.userId });
              await sp.unsafe(
                `UPDATE customer SET ${assignment} WHERE id = $1`,
                [anna.customerId],
              );
            });
            expect(failure.raised).toBe("CUSTOMER_COLUMN_READ_ONLY");
          }
        });
      });

      it("Sign out on all devices deletes every session; a second browser's cookie authenticates nothing", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const run = <T>(
            fn: (d: ReturnType<typeof drizzleOver>) => Promise<T>,
          ) => fn(drizzleOver(tx, db!.sql));
          const auth = createBuyerAuth({ run, now: () => NOW });
          const here = `buyer.${randomBytes(24).toString("base64url")}`;
          const there = `buyer.${randomBytes(24).toString("base64url")}`;
          for (const token of [here, there]) {
            await tx`INSERT INTO sessions (session_token, user_id, expires)
                     VALUES (${token}, ${anna.userId}, ${new Date(NOW.getTime() + 10 * DAY).toISOString()}::timestamptz)`;
          }
          expect(await resolveBuyerContext(there, { auth, run })).toEqual({
            userId: anna.userId,
            customerId: anna.customerId,
          });
          expect(await auth.signOutEverywhere(anna.userId)).toBe(2);
          expect(await resolveBuyerContext(there, { auth, run })).toBeNull();
          expect(await resolveBuyerContext(here, { auth, run })).toBeNull();
        });
      });
    });

    describe("saving a recipient (C.7.3, AC-54)", () => {
      it("copies the order's recipient into one row of C.11's columns, and not twice", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const orderId = await order(tx, anna);
          const run = customerRun(tx, anna);
          expect(await recipientSaveOffer(run, anna.customerId, orderId)).toBe(
            "offered",
          );
          expect(
            await saveRecipientFromOrder(run, anna.customerId, orderId, NOW),
          ).toBe("saved");
          const rows =
            await tx`SELECT * FROM saved_recipient WHERE customer_id = ${anna.customerId}`;
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            full_name: "Ola Testowa",
            phone_e164: "+48500000101",
            lines: ["ul. Testowa 1", "m. 2"],
            postal_code: "00-001",
            city: "Warszawa",
            country_id: anna.countryId,
          });
          expect(new Date(String(rows[0]?.["last_used_at"]))).toEqual(NOW);
          expect(JSON.stringify(rows[0])).not.toMatch(
            /Ring twice|Happy birthday|home|@/u,
          );
          expect(await recipientSaveOffer(run, anna.customerId, orderId)).toBe(
            "saved",
          );
          expect(
            await saveRecipientFromOrder(run, anna.customerId, orderId, NOW),
          ).toBe("saved");
          expect(await savedCount(tx, anna.customerId)).toBe(1);
        });
      });

      for (const placeKind of ["hospital", "funeral_home", "cemetery"]) {
        it(`is not offered, and writes nothing, for a ${placeKind}`, async () => {
          await rolledBack(db!.sql, async (tx) => {
            const anna = await buyer(tx);
            const orderId = await order(tx, anna, { ...SNAPSHOT, placeKind });
            const run = customerRun(tx, anna);
            expect(
              await recipientSaveOffer(run, anna.customerId, orderId),
            ).toBe("not_offered");
            expect(
              await saveRecipientFromOrder(run, anna.customerId, orderId, NOW),
            ).toBe("not_offered");
            expect(await savedCount(tx)).toBe(0);
          });
        });
      }

      it("is not offered after the 90-day sweep, nor for another customer's order", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const other = await buyer(tx);
          const swept = await order(tx, anna);
          await tx`UPDATE recipient SET contact_redacted = true, contact_redacted_at = now(),
                     phone_e164 = NULL WHERE id = ${anna.recipientId}`;
          const theirs = await order(tx, other);
          const run = customerRun(tx, anna);
          expect(
            await saveRecipientFromOrder(run, anna.customerId, swept, NOW),
          ).toBe("not_offered");
          expect(
            await saveRecipientFromOrder(run, anna.customerId, theirs, NOW),
          ).toBe("not_offered");
          expect(await savedCount(tx)).toBe(0);
        });
      });

      it("refuses the 21st save with limit and writes nothing; the trigger refuses a 21st insert", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          for (let n = 0; n < 20; n += 1) {
            await savedRow(tx, anna, { name: `Recipient ${String(n)}` });
          }
          const orderId = await order(tx, anna);
          expect(
            await saveRecipientFromOrder(
              customerRun(tx, anna),
              anna.customerId,
              orderId,
              NOW,
            ),
          ).toBe("limit");
          expect(await savedCount(tx, anna.customerId)).toBe(20);
          const failure = await pgFailure(tx, (sp) =>
            savedRow(sp, anna, { name: "Number 21" }),
          );
          expect(failure.raised).toBe("SAVED_RECIPIENT_LIMIT");
          expect(await savedCount(tx, anna.customerId)).toBe(20);
        });
      });
    });

    describe("the list, remove and use (AC-55, AC-61)", () => {
      it("lists only the customer's rows; another customer's row reads, removes and uses as nothing", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const bob = await buyer(tx);
          const annas = await savedRow(tx, anna, { name: "Anna's Friend" });
          const bobs = await savedRow(tx, bob, { name: "Bob's Friend" });
          const run = customerRun(tx, anna);
          expect(
            (await listSavedRecipients(run, anna.customerId)).map((r) => r.id),
          ).toEqual([annas]);
          expect(await listSavedRecipients(run, bob.customerId)).toEqual([]);
          expect(await removeSavedRecipient(run, anna.customerId, bobs)).toBe(
            false,
          );
          expect(
            await markSavedRecipientUsed(run, anna.customerId, bobs, NOW),
          ).toBeNull();
          expect(await savedCount(tx, bob.customerId)).toBe(1);
          // `public` reads nothing at all.
          await asApp(tx, { role: "public" });
          const [visible] = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count FROM saved_recipient`;
          expect(visible?.count).toBe(0);
          await asOwner(tx);
          expect(await removeSavedRecipient(run, anna.customerId, annas)).toBe(
            true,
          );
          expect(await savedCount(tx, anna.customerId)).toBe(0);
        });
      });

      it("using a saved recipient sets last_used_at and nothing else", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const id = await savedRow(tx, anna, {
            at: new Date(NOW.getTime() - 100 * DAY),
          });
          const [before] =
            await tx`SELECT * FROM saved_recipient WHERE id = ${id}`;
          const used = await markSavedRecipientUsed(
            customerRun(tx, anna),
            anna.customerId,
            id,
            NOW,
          );
          expect(used?.lastUsedAt).toEqual(NOW);
          const [after] =
            await tx`SELECT * FROM saved_recipient WHERE id = ${id}`;
          expect({ ...after, last_used_at: null, updated_at: null }).toEqual({
            ...before,
            last_used_at: null,
            updated_at: null,
          });
        });
      });

      it("buyerCheckoutProfile: null without a session and for admin and florist cookies; the buyer's own, strict", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const bob = await buyer(tx);
          await tx`UPDATE customer SET name = 'Anna Example', phone_e164 = '+447700900123',
                     country_iso2 = 'GB' WHERE id = ${anna.customerId}`;
          const annas = await savedRow(tx, anna);
          await savedRow(tx, bob, { phone: "+48500000999" });
          const run = <T>(
            fn: (d: ReturnType<typeof drizzleOver>) => Promise<T>,
          ) => fn(drizzleOver(tx, db!.sql));
          const auth = createBuyerAuth({ run, now: () => NOW });
          const expires = new Date(NOW.getTime() + 10 * DAY);
          const tokens = {
            buyer: `buyer.${randomBytes(24).toString("base64url")}`,
            admin: `admin.${randomBytes(24).toString("base64url")}`,
            florist: `florist.${randomBytes(24).toString("base64url")}`,
          };
          for (const token of Object.values(tokens)) {
            await tx`INSERT INTO sessions (session_token, user_id, expires)
                     VALUES (${token}, ${anna.userId}, ${expires.toISOString()}::timestamptz)`;
          }
          const options = {
            resolve: (token: string | undefined) =>
              resolveBuyerContext(token, { auth, run }),
            runnerFor: (context: { userId: string }) =>
              customerRun(tx, context),
          };
          const request = (cookie?: string): Request =>
            new Request("https://example.test/en/checkout", {
              headers: cookie === undefined ? {} : { cookie },
            });
          const name = auth.cookies.sessionToken;
          expect(await buyerCheckoutProfile(request(), options)).toBeNull();
          expect(
            await buyerCheckoutProfile(
              request(`__Secure-fo-admin.session-token=${tokens.admin}`),
              options,
            ),
          ).toBeNull();
          // An admin or florist token in the buyer cookie: bound to its own surface, refused.
          for (const token of [tokens.admin, tokens.florist]) {
            expect(
              await buyerCheckoutProfile(request(`${name}=${token}`), options),
            ).toBeNull();
          }
          const profile = await buyerCheckoutProfile(
            request(`${name}=${tokens.buyer}`),
            options,
          );
          expect(Object.keys(profile ?? {}).sort()).toEqual([
            "countryIso2",
            "email",
            "name",
            "phoneE164",
            "savedRecipients",
          ]);
          expect(profile).toMatchObject({
            name: "Anna Example",
            phoneE164: "+447700900123",
            countryIso2: "GB",
          });
          expect(profile?.savedRecipients.map((r) => r.id)).toEqual([annas]);
        });
      });
    });

    describe("retention and the recipient's own request (AC-55)", () => {
      it("the sweep deletes a row last used 731 days ago and keeps one used 729 days ago", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const old = await savedRow(tx, anna, {
            at: new Date(NOW.getTime() - 731 * DAY),
          });
          const recent = await savedRow(tx, anna, {
            at: new Date(NOW.getTime() - 729 * DAY),
          });
          const result = await runRetentionSweep(runnerOf(tx), {
            now: NOW,
            dryRun: false,
          });
          expect(
            result.policies.find((p) => p.key === "saved_recipient"),
          ).toEqual({
            key: "saved_recipient",
            status: "applied",
            counts: { saved_recipient: 1 },
            skipped: {},
          });
          const left = await tx<{ id: string }[]>`
            SELECT id FROM saved_recipient WHERE id IN (${old}, ${recent})`;
          expect(left.map((r) => r.id)).toEqual([recent]);
        });
      });

      it("the DSAR runbook's SQL deletes every row with the phone across customers, and nothing else", async () => {
        const runbook = readFileSync(
          resolve(import.meta.dirname, "../../docs/runbooks/dsar.md"),
          "utf8",
        );
        const block =
          /<!-- dsar:saved-recipient-by-phone[^>]*-->\s*```sql\n([\s\S]*?)```/u.exec(
            runbook,
          )?.[1];
        expect(block).toBeDefined();
        await rolledBack(db!.sql, async (tx) => {
          const anna = await buyer(tx);
          const bob = await buyer(tx);
          const phone = "+48500000777";
          await savedRow(tx, anna, { phone });
          await savedRow(tx, bob, { phone });
          const kept = await savedRow(tx, bob, { phone: "+48500000778" });
          await tx.unsafe((block ?? "").replaceAll(":'phone_e164'", "$1"), [
            phone,
          ]);
          const left = await tx<
            { id: string }[]
          >`SELECT id FROM saved_recipient`;
          expect(left.map((r) => r.id)).toEqual([kept]);
        });
      });
    });

    describe("the rollback (C.11)", () => {
      it(
        "refuses with BUYER_ACCOUNT_DATA_EXISTS while a buyer has saved data, then rolls back and forward",
        async () => {
          const anna = await db!.sql.begin(async (tx) => {
            const who = await buyer(tx);
            await savedRow(tx, who);
            return who;
          });
          await expect(
            runner(db!.url, ["--down", "--to", "0046"]),
          ).rejects.toThrow(/BUYER_ACCOUNT_DATA_EXISTS/u);
          const [still] = await db!.sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM saved_recipient`;
          expect(still?.count).toBe(1);
          await db!
            .sql`DELETE FROM saved_recipient WHERE customer_id = ${anna.customerId}`;
          await runner(db!.url, ["--down", "--to", "0046"]);
          const [gone] = await db!.sql<
            { tables: number; columns: number; flags: number }[]
          >`
          SELECT
            (SELECT count(*)::int FROM pg_tables
             WHERE tablename IN ('saved_recipient', 'occasion_reminder')) AS tables,
            (SELECT count(*)::int FROM information_schema.columns
             WHERE table_name = 'customer' AND column_name IN ('preferred_locale',
               'preferred_currency', 'reminder_consent', 'reminder_unsubscribe_token')) AS columns,
            (SELECT count(*)::int FROM feature_flag
             WHERE key IN ('account.recipients', 'account.reminders')) AS flags`;
          expect(gone).toEqual({ tables: 0, columns: 0, flags: 0 });
          const [signedIn] = await db!.sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM information_schema.columns
          WHERE table_name = 'customer' AND column_name = 'last_signed_in_at'`;
          expect(signedIn?.count).toBe(1);
          await runner(db!.url);
        },
        MIGRATION_MS,
      );
    });
  },
);
