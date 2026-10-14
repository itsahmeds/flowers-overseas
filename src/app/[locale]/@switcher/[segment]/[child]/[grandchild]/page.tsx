/**
 * Depth 4's language links: this listing or product in each locale (TASK-233;
 * `../../../../page-switcher.tsx`).
 */
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "../../../../page-switcher";

export default async function GrandchildSwitcher({
  params,
}: {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}): Promise<ReactElement> {
  const { locale, segment, child, grandchild } = await params;
  return (
    <PageLocaleSwitcher
      locale={locale}
      segments={[segment, child, grandchild]}
    />
  );
}
