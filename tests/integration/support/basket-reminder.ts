/**
 * Spec 034's integration fixtures (TASK-450, TASK-451): a live draft with lines written directly,
 * a scheduled reminder, a spy mailer and the send's injected dependencies.
 */
import { createHmac, randomBytes } from "node:crypto";

import { TEST_CONTACT_HMAC_SECRET } from "@/lib/env.basket-reminders";
import { createLogger } from "@/lib/logger";
import type { SendDeps } from "@/modules/checkout";
import type { MailMessage, Mailer } from "@/modules/notifications";

import { country } from "./rows.ts";
import type { Tx } from "./scratch-db.ts";
import { runnerOf } from "./sql-runner.ts";

export const NOW = new Date("2026-11-18T12:00:00.000Z");
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
export const EMAIL = "buyer@example.test";
export const hmac = (email: string): string =>
  createHmac("sha256", Buffer.from(TEST_CONTACT_HMAC_SECRET, "base64"))
    .update(email.trim().toLowerCase())
    .digest("hex");
export const ENV = { APP_ENV: "test" } as const;

export const quiet = createLogger({ level: "fatal", write: () => undefined });

export function spyMailer(
  fail?: () => Error,
): Mailer & { calls: MailMessage[] } {
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

export interface DraftOptions {
  readonly email?: string | null;
  readonly lastActivity?: Date;
  readonly consentAt?: Date | null;
  readonly mode?: "demo" | "test" | "live";
  readonly createdAt?: Date;
  readonly lines?: number;
}

export async function liveDraft(
  tx: Tx,
  options: DraftOptions = {},
): Promise<string> {
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

export async function scheduled(tx: Tx, draftId: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for)
    VALUES (${draftId}, 'en', 'scheduled', ${ago(MIN)}) RETURNING id`;
  return row?.id ?? "";
}

export function sendDeps(
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

export async function reminderRow(tx: Tx, id: string) {
  const [row] = await tx<
    Record<string, unknown>[]
  >`SELECT * FROM basket_reminder WHERE id = ${id}`;
  return row;
}
