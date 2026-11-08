import type { ReactElement } from "react";

import AccountHeader from "../../page";

/**
 * @purpose Account sign-in confirm header
 * @spec 018
 *
 * The header of `/{locale}/account/sign-in/confirm` (TASK-344): the account's header. Its language
 * links lead to the locale homes, never to this page, so the emailed `t` is printed nowhere else.
 */
export default function AccountConfirmHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return AccountHeader({ params });
}
