/**
 * Whether the step 3 box is offered (spec 034 §5.2 "Consent at step 2", §7, §14 item 1; AC-7,
 * AC-28; TASK-449): the flag `marketing.basket_reminder` is on, **and** every
 * `checkout.basketReminder.*` message is reviewed for a reader of the request's locale (an
 * unreviewed German consent sentence can never collect a German consent), **and** both env keys
 * are configured (absent on staging or production, the box is absent). Fails closed: a flag that
 * cannot be read answers no box.
 */
import { BASKET_REMINDER_FLAG } from "@/config/basket-reminders";
import { basketReminderEnv } from "@/lib/env.basket-reminders";
import type { EnvSource } from "@/lib/env.schema";
import { messagesReviewedFor } from "@/modules/i18n";

/** Reads `marketing.basket_reminder`; injected by the suites. */
export type ReminderFlagReader = () => Promise<boolean>;

/** The process's flag reader, loaded at call time so nothing reads a database at import. */
export const defaultReminderFlag: ReminderFlagReader = async () => {
  const { isEnabled } = await import("@/lib/flags");
  return isEnabled(BASKET_REMINDER_FLAG);
};

/** The message prefix the box's review gate reads. */
export const BASKET_REMINDER_COPY_PREFIX = "checkout.basketReminder";

export async function basketReminderOffered(
  locale: string,
  options: {
    readonly readFlag?: ReminderFlagReader;
    readonly env?: EnvSource;
  } = {},
): Promise<boolean> {
  if (!basketReminderEnv(options.env ?? process.env).configured) return false;
  if (!messagesReviewedFor(locale, BASKET_REMINDER_COPY_PREFIX)) return false;
  try {
    return await (options.readFlag ?? defaultReminderFlag)();
  } catch {
    return false;
  }
}
