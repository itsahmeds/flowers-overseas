/**
 * Depth 3's language links: this page in each locale (TASK-233; `../../../page-switcher.tsx`).
 *
 * @purpose Language links of a depth-3 page
 * @spec 003
 */
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "../../../page-switcher";

export default async function ChildSwitcher({
  params,
}: {
  params: Promise<{ locale: string; segment: string; child: string }>;
}): Promise<ReactElement> {
  const { locale, segment, child } = await params;
  return <PageLocaleSwitcher locale={locale} segments={[segment, child]} />;
}
