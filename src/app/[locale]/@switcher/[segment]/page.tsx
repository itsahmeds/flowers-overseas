/** Depth 2's language links: this page in each locale (TASK-233; `../../page-switcher.tsx`). */
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "../../page-switcher";

export default async function SegmentSwitcher({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<ReactElement> {
  const { locale, segment } = await params;
  return <PageLocaleSwitcher locale={locale} segments={[segment]} />;
}
