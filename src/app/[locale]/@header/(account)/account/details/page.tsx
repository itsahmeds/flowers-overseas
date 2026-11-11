import type { ReactElement } from "react";

import AccountHeader from "../page";

/**
 * @purpose Account details header
 * @spec 018
 *
 * The header of `/{locale}/account/details` (TASK-352): the account's header.
 */
export default function AccountDetailsHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
