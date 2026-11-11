/**
 * Spec 018 §14 A-founder-2026-10-22 row B against a migrated PG16 (T-56, T-57, T-58; AC-56,
 * AC-57, AC-58; TASK-353): `createReminder` without and with consent, the `consent_log` rows,
 * `marketing_consent` independent both ways, another customer's saved recipient refused,
 * `removeReminder` under RLS; `reminders.daily` with an injected clock at the lead boundary, on a
 * same-day rerun, on 29 February 2027, for consent off and a redacted customer, after a failed
 * send, in the locale fallback order, with the two RFC 8058 headers; the one-click `POST` with a
 * valid token and no session, a forged token, and "Turn off reminders" in the account.
 *
 * Every call runs in a savepoint as the production context would (`customer` with the buyer's
 * user id, or `system`), so a thrown error rolls back exactly what production rolls back. No real
 * person or address: reserved fiction only.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  type AccountRunner,
  createReminder,
  type DueReminder,
  readReminders,
  reminderOneClickResponse,
  reminderUnsubscribeLinkToken,
  removeReminder,
  runOccasionReminders,
  setReminderConsent,
} from "@/modules/customers";
import type { MailMessage } from "@/modules/notifications";

import { sendOccasionReminder } from "../../src/jobs/occasion-reminders.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents, unique } from "./support/rows.ts";
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
const MIGRATION_MS = 180_000;
const SECRET = "integration-signed-link-secret-0123456789";
const ORIGIN = "https://flowersoverseas.test";
const NOW = new Date("2027-03-07T07:00:00.000Z");
/** A withdrawal an hour after the grant, so the two consent rows have an order. */
const LATER = new Date("2027-03-07T08:00:00.000Z");

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "occasion_reminders");
  }
}, MIGRATION_MS);

afterAll(async () => {
  await db?.drop();
});

beforeEach(() => {
  vi.stubEnv("SIGNED_LINK_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

interface Buyer {
  readonly userId: string;
  readonly customerId: string;
  readonly recipientId: string;
  readonly countryId: string;
}

async function buyer(tx: Tx): Promise<Buyer> {
  const userId = randomUUID();
  await tx`INSERT INTO users (id, email) VALUES (${userId}, ${`${unique("u")}@example.test`})`;
  return { userId, ...(await orderParents(tx, userId)) };
}

/** Each call in its own savepoint, under `context`, back to the owner after. */
function runAs(
  tx: Tx,
  context: { role: string; userId?: string },
): AccountRunner {
  return (fn) =>
    tx.savepoint(async (sp) => {
      await asApp(sp, context);
      try {
        return await fn(runnerOf(sp));
      } finally {
        await sp.unsafe("RESET ROLE");
      }
    }) as never;
}

const customerOf = (tx: Tx, who: Buyer) =>
  runAs(tx, { role: "customer", userId: who.userId });
const systemOf = (tx: Tx) => runAs(tx, { role: "system" });
const runnersOf = (tx: Tx, who: Buyer) => ({
  run: customerOf(tx, who),
  system: systemOf(tx),
});

const INPUT = {
  occasionKey: "birthday",
  day: 14,
  month: 3,
  leadDays: 7,
  savedRecipientId: null,
} as const;

async function consentRows(
  tx: Tx,
  customerId: string,
): Promise<{ choices: unknown }[]> {
  return tx<{ choices: unknown }[]>`
    SELECT choices FROM consent_log
    WHERE subject_kind = 'customer' AND subject_ref = ${customerId}
    ORDER BY occurred_at, id`;
}

async function customerRow(
  tx: Tx,
  customerId: string,
): Promise<{
  reminder_consent: boolean;
  marketing_consent: boolean;
  reminder_unsubscribe_token: string | null;
}> {
  const [row] = await tx<
    {
      reminder_consent: boolean;
      marketing_consent: boolean;
      reminder_unsubscribe_token: string | null;
    }[]
  >`
    SELECT reminder_consent, marketing_consent, reminder_unsubscribe_token
    FROM customer WHERE id = ${customerId}`;
  if (row === undefined) throw new Error("no customer");
  return row;
}

async function reminderCount(tx: Tx, customerId: string): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM occasion_reminder WHERE customer_id = ${customerId}`;
  return row?.count ?? -1;
}

/** A buyer with consent on and one reminder, through the real action. */
async function consenting(
  tx: Tx,
  input: {
    readonly day?: number;
    readonly month?: number;
    readonly savedRecipientId?: string | null;
  } = {},
): Promise<Buyer> {
  const who = await buyer(tx);
  expect(
    await createReminder(
      runnersOf(tx, who),
      who.customerId,
      { ...INPUT, ...input, consent: true },
      NOW,
    ),
  ).toBe("created");
  return who;
}

/** Runs `reminders.daily` at `now`, capturing every message. */
async function daily(
  tx: Tx,
  now: Date,
  options: { fail?: boolean; flag?: boolean } = {},
): Promise<{ messages: MailMessage[]; sent: number }> {
  const messages: MailMessage[] = [];
  const send = (reminder: DueReminder) =>
    sendOccasionReminder(reminder, {
      origin: ORIGIN,
      destinationPath: (locale) => Promise.resolve(`/${locale}`),
      mailer: {
        send: (message) => {
          if (options.fail === true) throw new Error("mail down");
          messages.push(message);
          return Promise.resolve({ providerRef: "ref" });
        },
      },
    });
  try {
    const run = await runOccasionReminders(now, {
      system: systemOf(tx),
      flagOn: () => Promise.resolve(options.flag ?? true),
      send,
    });
    return { messages, sent: run.sent };
  } catch {
    return { messages, sent: -1 };
  }
}

/** Only the messages to `who`. */
async function to(
  tx: Tx,
  who: Buyer,
  messages: readonly MailMessage[],
): Promise<MailMessage[]> {
  const [row] = await tx<{ email_normalised: string }[]>`
    SELECT email_normalised FROM customer WHERE id = ${who.customerId}`;
  return messages.filter((m) => m.to === row?.email_normalised);
}

const at = (iso: string) => new Date(`${iso}T07:00:00.000Z`);

describe.skipIf(server.url === undefined)(
  "spec 018 row B on a migrated database (TASK-353)",
  () => {
    describe("consent and createReminder (C.7.4, AC-56)", () => {
      it("without consent: refused, nothing written; with it: one consent_log row, consent on, marketing unchanged", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await buyer(tx);
          const runners = runnersOf(tx, who);
          expect(
            await createReminder(runners, who.customerId, INPUT, NOW),
          ).toBe("consent_required");
          expect(await reminderCount(tx, who.customerId)).toBe(0);
          expect(await consentRows(tx, who.customerId)).toEqual([]);
          expect((await customerRow(tx, who.customerId)).reminder_consent).toBe(
            false,
          );

          expect(
            await createReminder(
              runners,
              who.customerId,
              { ...INPUT, consent: true },
              NOW,
            ),
          ).toBe("created");
          const after = await customerRow(tx, who.customerId);
          expect(after.reminder_consent).toBe(true);
          expect(after.marketing_consent).toBe(false);
          expect(after.reminder_unsubscribe_token).toMatch(
            /^[A-Za-z0-9_-]{22}$/u,
          );
          expect(await consentRows(tx, who.customerId)).toEqual([
            { choices: { occasion_reminders: true } },
          ]);
          expect(await reminderCount(tx, who.customerId)).toBe(1);

          // With consent on record, the next one needs no box and writes no second consent row.
          expect(
            await createReminder(
              runners,
              who.customerId,
              { ...INPUT, day: 2, month: 6, leadDays: 3 },
              NOW,
            ),
          ).toBe("created");
          expect(await consentRows(tx, who.customerId)).toHaveLength(1);
          expect(await reminderCount(tx, who.customerId)).toBe(2);
        });
      });

      it("marketing_consent and reminder_consent never move each other", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await buyer(tx);
          await tx`UPDATE customer SET marketing_consent = true WHERE id = ${who.customerId}`;
          expect((await customerRow(tx, who.customerId)).reminder_consent).toBe(
            false,
          );
          await tx`UPDATE customer SET marketing_consent = false WHERE id = ${who.customerId}`;
          await setReminderConsent(
            systemOf(tx),
            who.customerId,
            { on: true },
            NOW,
          );
          expect(await customerRow(tx, who.customerId)).toMatchObject({
            reminder_consent: true,
            marketing_consent: false,
          });
          await setReminderConsent(
            systemOf(tx),
            who.customerId,
            { on: false },
            NOW,
          );
          expect(await customerRow(tx, who.customerId)).toMatchObject({
            reminder_consent: false,
            marketing_consent: false,
          });
        });
      });

      it("a buyer session cannot set the consent columns itself (the update guard)", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await buyer(tx);
          await expect(
            customerOf(
              tx,
              who,
            )((exec) =>
              exec.execute(
                sql`UPDATE customer SET reminder_consent = true WHERE id = ${who.customerId}`,
              ),
            ),
          ).rejects.toThrow(/CUSTOMER_COLUMN_READ_ONLY/u);
        });
      });

      it("(2, 30) is refused and (2, 29) accepted; another customer's saved recipient is refused and rolls the consent back", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await buyer(tx);
          const other = await buyer(tx);
          const runners = runnersOf(tx, who);
          expect(
            await createReminder(
              runners,
              who.customerId,
              { ...INPUT, month: 2, day: 30, consent: true },
              NOW,
            ),
          ).toBe("invalid");
          const [theirs] = await tx<{ id: string }[]>`
            INSERT INTO saved_recipient (customer_id, full_name, phone_e164, lines, city,
                                         country_id, last_used_at)
            VALUES (${other.customerId}, 'Other Person', '+48500000301', ARRAY['ul. Testowa 9'],
                    'Kraków', ${other.countryId}, now())
            RETURNING id`;
          expect(
            await createReminder(
              runners,
              who.customerId,
              { ...INPUT, savedRecipientId: theirs?.id ?? null, consent: true },
              NOW,
            ),
          ).toBe("invalid");
          expect(await consentRows(tx, who.customerId)).toEqual([]);
          expect(await customerRow(tx, who.customerId)).toMatchObject({
            reminder_consent: false,
            reminder_unsubscribe_token: null,
          });
          expect(
            await createReminder(
              runners,
              who.customerId,
              { ...INPUT, month: 2, day: 29, consent: true },
              NOW,
            ),
          ).toBe("created");
        });
      });

      it("lists and removes only the customer's own reminders (RLS)", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const anna = await consenting(tx);
          const ben = await consenting(tx);
          const annas = await readReminders(
            customerOf(tx, anna),
            anna.customerId,
          );
          const bens = await readReminders(customerOf(tx, ben), ben.customerId);
          expect(annas?.reminders).toHaveLength(1);
          expect(annas?.consent).toBe(true);
          const benId = bens?.reminders[0]?.id ?? "";
          // Anna's context reads Ben's customer as nothing and deletes nothing of his.
          expect(
            await readReminders(customerOf(tx, anna), ben.customerId),
          ).toBeNull();
          expect(
            await removeReminder(customerOf(tx, anna), anna.customerId, benId),
          ).toBe(false);
          expect(await reminderCount(tx, ben.customerId)).toBe(1);
          expect(
            await removeReminder(customerOf(tx, ben), ben.customerId, benId),
          ).toBe(true);
          expect(await reminderCount(tx, ben.customerId)).toBe(0);
        });
      });
    });

    describe("reminders.daily (C.7.4, AC-57)", () => {
      it("sends once exactly at the lead time, none a day earlier or later, nothing on a same-day rerun", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx); // 14 March, 7 days
          expect(
            await to(tx, who, (await daily(tx, at("2027-03-06"))).messages),
          ).toEqual([]);
          const first = await to(
            tx,
            who,
            (await daily(tx, at("2027-03-07"))).messages,
          );
          expect(first).toHaveLength(1);
          expect(first[0]?.subject).toBe("Birthday on 14 March");
          expect(
            await to(tx, who, (await daily(tx, at("2027-03-07"))).messages),
          ).toEqual([]);
          expect(
            await to(tx, who, (await daily(tx, at("2027-03-08"))).messages),
          ).toEqual([]);
          const [row] = await tx<{ last_sent_for: string }[]>`
            SELECT last_sent_for::text AS last_sent_for FROM occasion_reminder
            WHERE customer_id = ${who.customerId}`;
          expect(row?.last_sent_for).toBe("2027-03-14");
          // The next year's occurrence sends again.
          expect(
            await to(tx, who, (await daily(tx, at("2028-03-07"))).messages),
          ).toHaveLength(1);
        });
      });

      it("29 February with 7 days' lead fires on 21 February 2027, once", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx, { month: 2, day: 29 });
          expect(
            await to(tx, who, (await daily(tx, at("2027-02-20"))).messages),
          ).toEqual([]);
          const sent = await to(
            tx,
            who,
            (await daily(tx, at("2027-02-21"))).messages,
          );
          expect(sent).toHaveLength(1);
          expect(sent[0]?.subject).toBe("Birthday on 28 February");
          expect(
            await to(tx, who, (await daily(tx, at("2027-02-22"))).messages),
          ).toEqual([]);
        });
      });

      it("nothing for consent off, a redacted customer, or the flag off", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const off = await consenting(tx);
          await tx`UPDATE customer SET reminder_consent = false WHERE id = ${off.customerId}`;
          const redacted = await consenting(tx);
          await tx`UPDATE customer SET redacted = true, redacted_at = now() WHERE id = ${redacted.customerId}`;
          const flagged = await consenting(tx);
          const noFlag = await daily(tx, at("2027-03-07"), { flag: false });
          expect(await to(tx, flagged, noFlag.messages)).toEqual([]);
          const run = await daily(tx, at("2027-03-07"));
          expect(await to(tx, off, run.messages)).toEqual([]);
          expect(await to(tx, redacted, run.messages)).toEqual([]);
          expect(await to(tx, flagged, run.messages)).toHaveLength(1);
        });
      });

      it("a failed send leaves the reminder unsent, and the retry sends it", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx);
          const failed = await daily(tx, at("2027-03-07"), { fail: true });
          expect(failed.sent).toBe(-1);
          const [row] = await tx<{ last_sent_for: string | null }[]>`
            SELECT last_sent_for::text AS last_sent_for FROM occasion_reminder
            WHERE customer_id = ${who.customerId}`;
          expect(row?.last_sent_for).toBeNull();
          expect(
            await to(tx, who, (await daily(tx, at("2027-03-07"))).messages),
          ).toHaveLength(1);
        });
      });

      it("the two RFC 8058 headers point at the one-click endpoint with this customer's token", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx);
          const [message] = await to(
            tx,
            who,
            (await daily(tx, at("2027-03-07"))).messages,
          );
          const token = (await customerRow(tx, who.customerId))
            .reminder_unsubscribe_token;
          const t = encodeURIComponent(
            reminderUnsubscribeLinkToken(token ?? ""),
          );
          expect(message?.headers).toEqual({
            "List-Unsubscribe": `<${ORIGIN}/api/reminders/unsubscribe?t=${t}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          });
          expect(message?.text).not.toMatch(/\d\s?(?:zł|PLN|€|EUR)/u);
        });
      });

      it("renders in preferred_locale, else the latest live order's locale, else en", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const preferred = await consenting(tx);
          await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
                   ON CONFLICT DO NOTHING`;
          await tx`UPDATE customer SET preferred_locale = 'de' WHERE id = ${preferred.customerId}`;
          const fromOrder = await consenting(tx);
          const orderId = await insertPlacedOrder(tx, {
            ...fromOrder,
            mode: "live",
          });
          await tx`SET LOCAL session_replication_role = replica`;
          await tx`UPDATE "order" SET locale_code = 'pl' WHERE id = ${orderId}`;
          await tx`SET LOCAL session_replication_role = origin`;
          const plain = await consenting(tx);
          const run = await daily(tx, at("2027-03-07"));
          const html = async (who: Buyer) =>
            (await to(tx, who, run.messages))[0]?.html ?? "";
          expect(await html(preferred)).toMatch(/<html lang="de"/u);
          expect(await html(fromOrder)).toMatch(/<html lang="pl"/u);
          expect(await html(plain)).toMatch(/<html lang="en"/u);
        });
      });
    });

    describe("withdrawal (C.7.4, AC-58)", () => {
      const oneClick = (t: string) =>
        new Request(
          `${ORIGIN}/api/reminders/unsubscribe?t=${encodeURIComponent(t)}`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
          },
        );

      it("the one-click POST with a valid token and no session: consent off, one withdrawal row, reminders deleted, 200", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx);
          const bystander = await consenting(tx);
          const token = (await customerRow(tx, who.customerId))
            .reminder_unsubscribe_token;
          const response = await reminderOneClickResponse(
            oneClick(reminderUnsubscribeLinkToken(token ?? "")),
            { system: systemOf(tx), now: LATER },
          );
          expect(response.status).toBe(200);
          const body = await response.text();
          expect((await customerRow(tx, who.customerId)).reminder_consent).toBe(
            false,
          );
          expect(await consentRows(tx, who.customerId)).toEqual([
            { choices: { occasion_reminders: true } },
            { choices: { occasion_reminders: false } },
          ]);
          expect(await reminderCount(tx, who.customerId)).toBe(0);
          expect(await reminderCount(tx, bystander.customerId)).toBe(1);

          // A forged token and a replay: the same 200 body, nothing changes.
          const valid = reminderUnsubscribeLinkToken(
            (await customerRow(tx, bystander.customerId))
              .reminder_unsubscribe_token ?? "",
          );
          for (const t of [
            `${valid.slice(0, -2)}AA`,
            reminderUnsubscribeLinkToken("BBBBBBBBBBBBBBBBBBBBBB"),
            reminderUnsubscribeLinkToken(token ?? ""),
          ]) {
            const again = await reminderOneClickResponse(oneClick(t), {
              system: systemOf(tx),
              now: LATER,
            });
            expect(again.status).toBe(200);
            expect(await again.text()).toBe(body);
          }
          expect(await consentRows(tx, who.customerId)).toHaveLength(2);
          expect(await reminderCount(tx, bystander.customerId)).toBe(1);
          expect(
            (await customerRow(tx, bystander.customerId)).reminder_consent,
          ).toBe(true);
        });
      });

      it("consent given again rotates the token: the old link changes nothing", async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx);
          const old = (await customerRow(tx, who.customerId))
            .reminder_unsubscribe_token;
          await setReminderConsent(
            systemOf(tx),
            who.customerId,
            { on: false },
            NOW,
          );
          await createReminder(
            runnersOf(tx, who),
            who.customerId,
            { ...INPUT, consent: true },
            NOW,
          );
          const fresh = (await customerRow(tx, who.customerId))
            .reminder_unsubscribe_token;
          expect(fresh).not.toBe(old);
          await reminderOneClickResponse(
            oneClick(reminderUnsubscribeLinkToken(old ?? "")),
            { system: systemOf(tx), now: NOW },
          );
          expect((await customerRow(tx, who.customerId)).reminder_consent).toBe(
            true,
          );
          expect(await reminderCount(tx, who.customerId)).toBe(1);
        });
      });

      it('"Turn off reminders" in the account has the same effect', async () => {
        await rolledBack(db!.sql, async (tx) => {
          const who = await consenting(tx);
          expect(
            await setReminderConsent(
              systemOf(tx),
              who.customerId,
              { on: false },
              LATER,
            ),
          ).toBe(true);
          expect((await customerRow(tx, who.customerId)).reminder_consent).toBe(
            false,
          );
          expect(await consentRows(tx, who.customerId)).toEqual([
            { choices: { occasion_reminders: true } },
            { choices: { occasion_reminders: false } },
          ]);
          expect(await reminderCount(tx, who.customerId)).toBe(0);
          // Off again writes nothing.
          expect(
            await setReminderConsent(
              systemOf(tx),
              who.customerId,
              { on: false },
              NOW,
            ),
          ).toBe(false);
          expect(await consentRows(tx, who.customerId)).toHaveLength(2);
        });
      });
    });
  },
);
