import type { ReactElement } from "react";

import AccountHeader from "../page";

/**
 * @purpose Account reminders header
 * @spec 018
 *
 * The header of `/{locale}/account/reminders` (TASK-353): the account's header.
 */
export default function AccountRemindersHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
