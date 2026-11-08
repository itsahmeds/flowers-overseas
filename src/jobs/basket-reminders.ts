/**
 * The two basket reminder jobs (spec 034 §5.2 "Jobs"; AC-2 to AC-6, AC-25, AC-28; TASK-450):
 * `basket-reminders.scan`, enqueued by the minute tick once every 10 minutes, and
 * `basket-reminders.send`, one per reminder, keyed by it. Each runs in one `system` transaction.
 *
 * The dependencies are built here, at call time: the flag reader, the env, the mailer, spec 009's
 * checkout calendar, the catalogue's line display, the site origin. Nothing reads a database or the
 * environment at import.
 */
import { createTranslator } from "next-intl";

import {
  AUTO_PAUSE_ACTOR,
  BASKET_REMINDER_FLAG,
} from "../config/basket-reminders";
import { countryConfig } from "../config/countries";
import type { LocaleCode } from "../config/locales";
import { withSystemContext, type DbTransaction } from "../lib/db";
import { logger } from "../lib/logger";
import { captureAlert, captureWarning } from "../lib/sentry";
import { systemTurnFlagOff } from "../modules/admin";
import { lineDisplay } from "../modules/catalog";
import {
  type BasketLine,
  availableLines,
  defaultReminderFlag,
  markReminderFailed,
  type ReminderLineView,
  scanAbandonedBaskets,
  sendBasketReminder,
} from "../modules/checkout";
import { infoPagePath } from "../modules/content";
import { checkoutDeliveryWindow } from "../modules/geo";
import { loadMessages } from "../modules/i18n";
import { getMailer } from "../modules/notifications";
import type { OrderExecutor, RawRow } from "../modules/orders";
import {
  assetById,
  boxForAsset,
  splitVariantLoader,
  variantsFor,
} from "../modules/ui";

/** Retries after the first attempt; after the last the reminder ends `failed` (AC-4). */
export const BASKET_REMINDER_SEND_RETRY_LIMIT = 3;

function executorOf(db: DbTransaction): OrderExecutor {
  return {
    async execute(query) {
      const rows: unknown = await db.execute(query);
      return rows as readonly RawRow[];
    },
  };
}

function siteOrigin(): string {
  return (process.env["NEXT_PUBLIC_SITE_URL"] ?? "").replace(/\/+$/u, "");
}

/** The 96 px thumbnail at twice its size, from the variant ladder; absolute, the same for everyone. */
function thumbnailUrl(assetId: string): string | null {
  const asset = assetById(assetId);
  const slot = asset === undefined ? undefined : boxForAsset(asset);
  if (asset === undefined || slot === undefined) return null;
  const set = variantsFor(assetId, slot);
  const steps = set?.steps.webp ?? [];
  const pick = steps.find((step) => step.width >= 192) ?? steps.at(-1);
  if (pick === undefined) return null;
  const url = splitVariantLoader({
    assetId,
    width: pick.width,
    format: pick.format,
    objectKey: pick.objectKey,
  } as Parameters<typeof splitVariantLoader>[0]);
  return url.startsWith("/") ? `${siteOrigin()}${url}` : url;
}

/** Product name, size label, country name and thumbnail of one line, in `locale`. */
async function lineView(
  line: BasketLine,
  locale: LocaleCode,
): Promise<ReminderLineView> {
  const display = await lineDisplay({
    sku: line.sku,
    tierKey: line.tierKey,
    addonKeys: line.addonKeys,
    countryIso: line.countryIso,
    locale,
  });
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, ["catalog", "destinations"]),
  }) as unknown as (key: string, values?: Record<string, number>) => string;
  const tier =
    display.tier === null
      ? null
      : t(
          display.tier.labelKey,
          display.tier.stems === null ? {} : { count: display.tier.stems },
        );
  return {
    productName: display.name ?? line.sku,
    tierLabel: tier,
    countryName: t(countryConfig(line.countryIso).nameKey),
    imageUrl:
      display.photo === null ? null : thumbnailUrl(display.photo.assetId),
    imageAlt: display.photo?.alt ?? "",
  };
}

/** One send-job enqueue, keyed by the reminder (one waiting job per reminder). */
export async function enqueueBasketReminderSend(
  reminderId: string,
): Promise<void> {
  const { enqueue, ensureQueue, withBoss } = await import("./runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "basket-reminders.send");
    await enqueue(
      boss,
      "basket-reminders.send",
      { reminderId },
      { requestId: "system:basket-reminders.scan", singletonKey: reminderId },
    );
  });
}

/** `basket-reminders.scan`. */
export async function runBasketReminderScan(
  now: Date = new Date(),
): Promise<void> {
  await withSystemContext("basket-reminders.scan", (db) =>
    scanAbandonedBaskets(now, {
      executor: executorOf(db),
      readFlag: defaultReminderFlag,
      env: process.env,
      enqueueSend: enqueueBasketReminderSend,
      log: logger,
      captureMessage: (message, tags) => captureWarning(message, tags),
      pauseFlag: async () => {
        await systemTurnFlagOff(BASKET_REMINDER_FLAG, AUTO_PAUSE_ACTOR);
      },
      raiseAlert: (tags) =>
        captureAlert(tags["alert"] ?? "basket_reminders.paused"),
    }),
  );
}

/** `basket-reminders.send`; after the last retry the row ends `failed` with one Sentry event. */
export async function runBasketReminderSend(
  reminderId: string,
  retryCount: number,
  now: Date = new Date(),
): Promise<void> {
  try {
    await withSystemContext("basket-reminders.send", (db) =>
      sendBasketReminder(reminderId, now, {
        executor: executorOf(db),
        mailer: getMailer(),
        readFlag: defaultReminderFlag,
        env: process.env,
        window: (input) => checkoutDeliveryWindow(input),
        isAvailable: availableLines,
        lineView,
        siteOrigin: siteOrigin(),
        helpPath: (locale) => infoPagePath("help", locale),
        privacyPath: (locale) => infoPagePath("privacy", locale),
        log: logger,
      }),
    );
  } catch (error) {
    if (retryCount < BASKET_REMINDER_SEND_RETRY_LIMIT) throw error;
    const failed = await withSystemContext("basket-reminders.send", (db) =>
      markReminderFailed(executorOf(db), reminderId),
    );
    if (failed) {
      logger.error(
        {
          reminder_id: reminderId,
          code: error instanceof Error ? error.name : "Error",
        },
        "basket_reminder.failed",
      );
      captureAlert("basket_reminders.send_failed", { reminder_id: reminderId });
    }
  }
}
