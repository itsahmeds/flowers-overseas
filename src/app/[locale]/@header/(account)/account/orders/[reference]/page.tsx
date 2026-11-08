import type { ReactElement } from "react";

import AccountHeader from "../../page";

/**
 * @purpose Account order detail header
 * @spec 018
 *
 * The header of `/{locale}/account/orders/{reference}` (TASK-344): the account's header.
 */
export default function AccountOrderHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
