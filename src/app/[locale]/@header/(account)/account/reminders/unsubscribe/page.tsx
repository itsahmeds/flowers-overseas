import type { ReactElement } from "react";

import AccountHeader from "../../page";

/**
 * @purpose Account reminders unsubscribe header
 * @spec 018
 *
 * The header of `/{locale}/account/reminders/unsubscribe` (TASK-353): the account's header.
 */
export default function AccountReminderUnsubscribeHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
