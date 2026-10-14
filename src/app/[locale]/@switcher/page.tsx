/** The locale home's language links: every locale's home (TASK-233; `../page-switcher.tsx`). */
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "../page-switcher";

export default async function HomeSwitcher({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <PageLocaleSwitcher locale={locale} segments={[]} />;
}
