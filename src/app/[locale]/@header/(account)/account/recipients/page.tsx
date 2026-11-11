import type { ReactElement } from "react";

import AccountHeader from "../page";

/**
 * @purpose Account saved recipients header
 * @spec 018
 *
 * The header of `/{locale}/account/recipients` (TASK-352): the account's header.
 */
export default function AccountRecipientsHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
