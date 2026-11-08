/**
 * Spec 034's scan and send against a migrated PG16 (T-02, T-03, T-04, T-05, T-06 draft bytes,
 * T-15 columns, T-28 scan refusal; AC-2 to AC-6, AC-15, AC-28; TASK-450).
 *
 * Live drafts with one line are written directly; the catalogue-facing dependencies (calendar,
 * availability, line display) are injected so each case controls them, and the mailer is a spy.
 * Every case runs in a rolled-back transaction except the concurrency case, which commits its rows
 * on two connections and deletes them after.
 */
import { createHmac, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CONTACT_HMAC_SECRET } from "@/lib/env.basket-reminders";
import { createLogger } from "@/lib/logger";
import {
  type ScanDeps,
  type SendDeps,
  reminderTokenHash,
  scanAbandonedBaskets,
  sendBasketReminder,
} from "@/modules/checkout";
import {
  type MailMessage,
  type Mailer,
  MailerError,
} from "@/modules/notifications";

import { base, country } from "./support/rows.ts";
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

const NOW = new Date("2026-11-18T12:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const EMAIL = "buyer@example.test";
const hmac = (email: string): string =>
  createHmac("sha256", Buffer.from(TEST_CONTACT_HMAC_SECRET, "base64"))
    .update(email.trim().toLowerCase())
    .digest("hex");
const ENV = { APP_ENV: "test" } as const;

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "basket_reminder_send");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

const quiet = createLogger({ level: "fatal", write: () => undefined });

function spyMailer(fail?: () => Error): Mailer & { calls: MailMessage[] } {
  const calls: MailMessage[] = [];
  return {
    calls,
    send(message) {
      calls.push(message);
      if (fail !== undefined) return Promise.reject(fail());
      return Promise.resolve({ providerRef: `re_${String(calls.length)}` });
    },
  };
}

interface DraftOptions {
  readonly email?: string | null;
  readonly lastActivity?: Date;
  readonly consentAt?: Date | null;
  readonly mode?: "demo" | "test" | "live";
  readonly createdAt?: Date;
  readonly lines?: number;
}

async function liveDraft(tx: Tx, options: DraftOptions = {}): Promise<string> {
  const countryId = await country(tx, "PL");
  await tx`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES ('fo-bq-it-1', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT DO NOTHING`;
  const [product] = await tx<
    { id: string }[]
  >`SELECT id FROM product WHERE sku = 'fo-bq-it-1'`;
  const last = options.lastActivity ?? ago(3 * HOUR);
  const consent =
    options.consentAt === undefined ? ago(4 * HOUR) : options.consentAt;
  const email = options.email === undefined ? EMAIL : options.email;
  const buyer =
    email === null
      ? null
      : {
          email,
          buyerName: "Ann Buyer",
          buyerPhone: null,
          residenceCountry: "GB",
        };
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO checkout_draft (token_sha256, locale_code, mode, buyer, buyer_saved, currency_code,
                                last_activity_at, expires_at, reminder_consent_at,
                                reminder_consent_version, created_at)
    VALUES (${randomBytes(32).toString("hex")}, 'en', ${options.mode ?? "live"},
            ${buyer === null ? null : tx.json(buyer)}, ${buyer !== null}, 'PLN', ${last},
            ${new Date(last.getTime() + 30 * DAY)}, ${consent}, ${consent === null ? null : 1},
            ${options.createdAt ?? ago(5 * HOUR)})
    RETURNING id`;
  for (let position = 1; position <= (options.lines ?? 1); position += 1) {
    await tx`
      INSERT INTO checkout_draft_line (draft_id, position, destination_country_id, product_id,
                                       tier_key, delivery_date, recipient, card,
                                       last_seen_total_minor, last_seen_currency_code)
      VALUES (${row?.id ?? ""}, ${position}, ${countryId}, ${product?.id ?? ""}, 'stems_12',
              '2026-11-20', '{"fullName":"Rita Recipient","phone":{"e164":"+48500100200","national":"500 100 200","nonLocal":false},"address":{"street":"Rita Street 1"},"placeKind":"home","deliveryNote":""}'::jsonb, '{"cardMessage":"Love","signAs":"A"}'::jsonb,
              12900, 'PLN')`;
  }
  return row?.id ?? "";
}

async function scheduled(tx: Tx, draftId: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for)
    VALUES (${draftId}, 'en', 'scheduled', ${ago(MIN)}) RETURNING id`;
  return row?.id ?? "";
}

function sendDeps(
  tx: Tx,
  mailer: Mailer,
  overrides: Partial<SendDeps> = {},
): SendDeps {
  return {
    executor: runnerOf(tx),
    mailer,
    readFlag: async () => true,
    env: ENV,
    window: () => ({
      dates: [
        { date: "2026-11-19", selectable: true },
        { date: "2026-11-20", selectable: true },
      ],
    }),
    isAvailable: async (draft) => draft.lines.map(() => true),
    lineView: async () => ({
      productName: "Amber Hour",
      tierLabel: "12 stems",
      countryName: "Poland",
      imageUrl: null,
      imageAlt: "",
    }),
    siteOrigin: "https://flowersoverseas.com",
    helpPath: (locale) => `/${locale}/help`,
    privacyPath: (locale) => `/${locale}/privacy`,
    log: quiet,
    ...overrides,
  };
}

async function reminderRow(tx: Tx, id: string) {
  const [row] = await tx<
    Record<string, unknown>[]
  >`SELECT * FROM basket_reminder WHERE id = ${id}`;
  return row;
}

async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rolledBack(db!.sql, async (tx) => {
    await base(tx);
    return fn(tx);
  });
}

describe.skipIf(server.url === undefined)(
  "spec 034 scan and send (PG16)",
  () => {
    it("T-02 (AC-2), T-05 (AC-5): one scheduled row per eligible draft, none twice, none after a send; off refuses", async () => {
      await run(async (tx) => {
        const eligible = await liveDraft(tx);
        await liveDraft(tx, { mode: "demo" });
        await liveDraft(tx, { consentAt: null });
        await liveDraft(tx, { lastActivity: ago(HOUR) });
        await liveDraft(tx, { lastActivity: ago(21 * HOUR) });
        await liveDraft(tx, { lines: 0 });
        await asApp(tx, { role: "system" });
        const enqueued: string[] = [];
        const lines: Record<string, unknown>[] = [];
        const captured: string[] = [];
        const deps: ScanDeps = {
          executor: runnerOf(tx),
          readFlag: async () => true,
          env: ENV,
          enqueueSend: async (id) => {
            enqueued.push(id);
          },
          log: createLogger({
            level: "info",
            write: (line) =>
              lines.push(JSON.parse(line) as Record<string, unknown>),
          }),
          captureMessage: (message) => captured.push(message),
          pauseFlag: async () => undefined,
          raiseAlert: () => undefined,
        };
        expect(await scanAbandonedBaskets(NOW, deps)).toEqual({
          scheduled: 1,
          paused: false,
        });
        const rows = await tx<
          { draft_id: string; status: string }[]
        >`SELECT draft_id, status FROM basket_reminder`;
        expect(rows).toEqual([{ draft_id: eligible, status: "scheduled" }]);
        expect(enqueued).toHaveLength(1);
        expect(await scanAbandonedBaskets(NOW, deps)).toEqual({
          scheduled: 0,
          paused: false,
        });

        // AC-5: sent, then new activity and 2 h more: still no second row.
        await tx`UPDATE basket_reminder SET status = 'sent', sent_at = ${NOW}`;
        await tx`UPDATE checkout_draft SET last_activity_at = ${NOW} WHERE id = ${eligible}`;
        await scanAbandonedBaskets(new Date(NOW.getTime() + 3 * HOUR), deps);
        const [count] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM basket_reminder WHERE draft_id = ${eligible}`;
        expect(count?.n).toBe(1);

        lines.length = 0;
        expect(
          await scanAbandonedBaskets(NOW, {
            ...deps,
            readFlag: async () => false,
          }),
        ).toEqual({
          refused: "flag_off",
        });
        expect(lines.map((line) => [line["msg"], line["reason"]])).toEqual([
          ["basket_reminder.scan_refused", "flag_off"],
        ]);
        // AC-28: env missing on a deployed environment refuses with one Sentry event.
        lines.length = 0;
        expect(
          await scanAbandonedBaskets(NOW, {
            ...deps,
            env: { APP_ENV: "production" },
          }),
        ).toEqual({ refused: "env" });
        expect(lines.map((line) => [line["msg"], line["reason"]])).toEqual([
          ["basket_reminder.scan_refused", "env"],
        ]);
        expect(captured).toEqual(["basket_reminder.scan_refused"]);
      });
    });

    it("T-03 (AC-3), T-15 (AC-15), T-06: the happy path sends once and stores only hashes; the draft is untouched", async () => {
      await run(async (tx) => {
        const draftId = await liveDraft(tx);
        const id = await scheduled(tx, draftId);
        await asApp(tx, { role: "system" });
        const before = await tx<{ row: string }[]>`
        SELECT (SELECT to_jsonb(d)::text FROM checkout_draft d WHERE d.id = ${draftId})
            || (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.position)::text FROM checkout_draft_line l WHERE l.draft_id = ${draftId}) AS row`;
        const mailer = spyMailer();
        expect(await sendBasketReminder(id, NOW, sendDeps(tx, mailer))).toEqual(
          {
            status: "sent",
            providerMessageId: "re_1",
          },
        );
        expect(mailer.calls).toHaveLength(1);
        const message = mailer.calls[0]!;
        expect(message).toMatchObject({
          tag: "basket_reminder",
          to: EMAIL,
          stream: "marketing",
          idempotencyKey: `basket_reminder:${id}`,
        });
        const restore =
          /\/en\/basket\/restore\/([A-Za-z0-9_-]{43})/u.exec(
            message.text,
          )?.[1] ?? "";
        const unsubscribe =
          /\/en\/basket\/unsubscribe\/([A-Za-z0-9_-]{43})/u.exec(
            message.text,
          )?.[1] ?? "";
        expect(restore).not.toBe("");
        expect(unsubscribe).not.toBe(restore);
        expect(message.headers).toEqual({
          "List-Unsubscribe": `<https://flowersoverseas.com/api/basket-reminders/unsubscribe/${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        });
        for (const value of [
          "Rita",
          "Recipient",
          "Love",
          "Ann Buyer",
          "129",
          "PLN",
        ]) {
          expect(message.html + message.text + message.subject).not.toContain(
            value,
          );
        }
        const row = await reminderRow(tx, id);
        expect(row).toMatchObject({
          status: "sent",
          line_count: 1,
          email_hmac: hmac(EMAIL),
          restore_token_sha256: reminderTokenHash(restore),
          unsubscribe_token_sha256: reminderTokenHash(unsubscribe),
          provider_message_id: "re_1",
          delivery_status: "sent",
        });
        expect((row?.["sent_at"] as Date).toISOString()).toBe(
          NOW.toISOString(),
        );
        expect((row?.["restore_expires_at"] as Date).getTime()).toBe(
          NOW.getTime() + 7 * DAY,
        );
        expect(Object.values(row ?? {}).map(String)).not.toContain(restore);
        expect(Object.values(row ?? {}).map(String)).not.toContain(unsubscribe);
        const after = await tx<{ row: string }[]>`
        SELECT (SELECT to_jsonb(d)::text FROM checkout_draft d WHERE d.id = ${draftId})
            || (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.position)::text FROM checkout_draft_line l WHERE l.draft_id = ${draftId}) AS row`;
        expect(after).toEqual(before);
        // A second job for the same reminder sends nothing.
        expect(await sendBasketReminder(id, NOW, sendDeps(tx, mailer))).toEqual(
          { status: "not_scheduled" },
        );
        expect(mailer.calls).toHaveLength(1);
      });
    });

    const skipCases: [
      string,
      (tx: Tx, draftId: string) => Promise<Partial<SendDeps> | void>,
      DraftOptions,
    ][] = [
      ["flag_off", async () => ({ readFlag: async () => false }), {}],
      [
        "purchased",
        async (tx, draftId) => {
          await tx`DELETE FROM checkout_draft WHERE id = ${draftId}`;
        },
        {},
      ],
      ["no_email", async () => undefined, { email: null }],
      ["consent_withdrawn", async () => undefined, { consentAt: null }],
      [
        "too_late",
        async () => undefined,
        { lastActivity: ago(20 * HOUR + MIN) },
      ],
      [
        "suppressed",
        async (tx) => {
          await tx`INSERT INTO email_suppression (email_hmac, scope, reason) VALUES (${hmac(EMAIL)}, 'basket_reminder', 'complained')`;
        },
        {},
      ],
      [
        "suppressed",
        async (tx) => {
          await tx`INSERT INTO email_suppression (email_hmac, scope, reason) VALUES (${hmac(EMAIL)}, 'basket_reminder', 'bounced')`;
        },
        {},
      ],
      [
        "suppressed",
        async (tx) => {
          await tx`INSERT INTO email_suppression (email_hmac, scope, reason, updated_at) VALUES (${hmac(EMAIL)}, 'basket_reminder', 'unsubscribed', ${ago(HOUR)})`;
        },
        {},
      ],
      [
        "purchased_elsewhere",
        async (tx) => {
          const [customer] = await tx<{ id: string }[]>`
        INSERT INTO customer (email_normalised, country_iso2) VALUES (${EMAIL}, 'GB') RETURNING id`;
          await tx`INSERT INTO purchase (id, mode, buyer_currency_code, total_minor, locale_code, customer_id, created_at)
               VALUES (gen_random_uuid(), 'live', 'PLN', 12900, 'en', ${customer?.id ?? ""}, ${ago(HOUR)})`;
        },
        {},
      ],
      [
        "recent_reminder",
        async (tx) => {
          const other = await liveDraft(tx);
          await tx`INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for, sent_at, email_hmac)
               VALUES (${other}, 'en', 'sent', ${ago(7 * DAY - HOUR)}, ${ago(7 * DAY - HOUR)}, ${hmac(EMAIL)})`;
        },
        {},
      ],
      [
        "no_available_line",
        async () => ({
          isAvailable: async (draft) => draft.lines.map(() => false),
        }),
        {},
      ],
    ];

    it.each(skipCases)(
      "T-03 (AC-3): skipped %s, no email",
      async (reason, arrange, options) => {
        await run(async (tx) => {
          const draftId = await liveDraft(tx, options);
          const id = await scheduled(tx, draftId);
          const overrides = (await arrange(tx, draftId)) ?? {};
          await asApp(tx, { role: "system" });
          const mailer = spyMailer();
          expect(
            await sendBasketReminder(id, NOW, sendDeps(tx, mailer, overrides)),
          ).toEqual({
            status: "skipped",
            reason,
          });
          expect(mailer.calls).toHaveLength(0);
          expect(await reminderRow(tx, id)).toMatchObject({
            status: "skipped",
            skip_reason: reason,
          });
        });
      },
    );

    it("T-03 (AC-3): an unsubscribe older than the consent lets it send; resumed activity deletes the row", async () => {
      await run(async (tx) => {
        const draftId = await liveDraft(tx);
        const id = await scheduled(tx, draftId);
        await tx`INSERT INTO email_suppression (email_hmac, scope, reason, updated_at)
               VALUES (${hmac(EMAIL)}, 'basket_reminder', 'unsubscribed', ${ago(5 * HOUR)})`;
        const resumedDraft = await liveDraft(tx, {
          email: "other@example.test",
          lastActivity: ago(30 * MIN),
        });
        const resumed = await scheduled(tx, resumedDraft);
        await asApp(tx, { role: "system" });
        const mailer = spyMailer();
        expect(
          (await sendBasketReminder(id, NOW, sendDeps(tx, mailer))).status,
        ).toBe("sent");
        expect(
          await sendBasketReminder(resumed, NOW, sendDeps(tx, mailer)),
        ).toEqual({ status: "deferred" });
        expect(await reminderRow(tx, resumed)).toBeUndefined();
        expect(mailer.calls).toHaveLength(1);
      });
    });

    it("T-04 (AC-4): a 409 invalid_idempotent_request is sent with no provider id; another error throws and leaves it scheduled", async () => {
      await run(async (tx) => {
        const id = await scheduled(tx, await liveDraft(tx));
        await asApp(tx, { role: "system" });
        const conflict = spyMailer(
          () => new MailerError("HTTP 409", "invalid_idempotent_request"),
        );
        expect(
          await sendBasketReminder(id, NOW, sendDeps(tx, conflict)),
        ).toEqual({
          status: "sent",
          providerMessageId: null,
        });
        expect(await reminderRow(tx, id)).toMatchObject({
          status: "sent",
          provider_message_id: null,
        });
      });
      await run(async (tx) => {
        const id = await scheduled(tx, await liveDraft(tx));
        await asApp(tx, { role: "system" });
        await expect(
          tx.savepoint((sp) =>
            sendBasketReminder(
              id,
              NOW,
              sendDeps(
                sp as unknown as Tx,
                spyMailer(() => new MailerError("HTTP 500")),
              ),
            ),
          ),
        ).rejects.toThrow(/HTTP 500/u);
        expect(await reminderRow(tx, id)).toMatchObject({
          status: "scheduled",
          restore_token_sha256: null,
        });
      });
    });

    it("T-04 (AC-4): two concurrent sends of one reminder call the mailer once", async () => {
      const sql = db!.sql;
      const draftId = await sql.begin(async (tx) => {
        await base(tx);
        return liveDraft(tx);
      });
      const [row] = await sql<{ id: string }[]>`
      INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for)
      VALUES (${draftId}, 'en', 'scheduled', ${ago(MIN)}) RETURNING id`;
      const id = row?.id ?? "";
      const mailer = spyMailer();
      const once = () =>
        sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return sendBasketReminder(id, NOW, sendDeps(tx, mailer));
        });
      const outcomes = await Promise.all([once(), once()]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
        "not_scheduled",
        "sent",
      ]);
      expect(mailer.calls).toHaveLength(1);
      await sql`DELETE FROM basket_reminder WHERE id = ${id}`;
      await sql`DELETE FROM checkout_draft WHERE id = ${draftId}`;
    });
  },
);
