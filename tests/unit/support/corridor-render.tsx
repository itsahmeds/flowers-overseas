/**
 * Renders a corridor page to static markup over the real messages, for suites written as `.ts`
 * (`interactions-budget.test.ts`; spec 042, TASK-311). `corridor-page.test.tsx`'s pattern.
 *
 * The page component is imported **when called**, so a suite that mocks `src/config/interactions.ts`
 * after `vi.resetModules()` renders the page with that switch.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import type { CorridorView } from "../../../src/modules/geo";
import { loadMessages } from "../../../src/modules/i18n";

/** Every namespace a corridor document resolves. */
const NAMESPACES = [
  "corridor",
  "breadcrumb",
  "destinations",
  "catalog",
  "common",
  "a11y",
  "media",
] as const;

export async function renderCorridor(
  view: CorridorView,
  locale: string,
): Promise<string> {
  const { CorridorPage } =
    await import("../../../src/modules/geo/ui/CorridorPage.tsx");
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      <CorridorPage view={view} />
    </NextIntlClientProvider>,
  );
}
