/**
 * The `@switcher` slot of a route folder with no mirror here: the locale homes (spec 003 §2 L79
 * "falling back to the locale home"; TASK-233). See `../page-switcher.tsx`.
 */
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "../page-switcher";

export default async function SwitcherDefault({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <PageLocaleSwitcher locale={locale} segments={[]} />;
}
