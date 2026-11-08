"use server";
/**
 * The unsubscribe page's one server action (spec 034 §5.2 "Unsubscribe"; AC-20; TASK-451): the
 * same effects as the one-click `POST` with `channel: 'page'`, then the done state. Thin glue.
 */
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import {
  defaultReminderTransaction,
  unsubscribeBasketReminders,
} from "@/modules/checkout";
import { routableLocale } from "@/modules/i18n";

export async function unsubscribeAction(
  locale: string,
  token: string,
): Promise<void> {
  const routable = routableLocale(locale);
  if (routable === undefined) return;
  await defaultReminderTransaction("basket-reminders.unsubscribe", (executor) =>
    unsubscribeBasketReminders({
      token,
      channel: "page",
      now: new Date(),
      executor,
    }),
  );
  logger.info({ channel: "page" }, "basket_reminder.unsubscribed");
  redirect(`/${routable.code}/basket/unsubscribe/done`);
}
