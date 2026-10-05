/**
 * The page's own path in every launch locale, handed to the language popup (spec 003 §14 A14
 * Shape as amended by A16: "each option is a real `<a>` to the same path in that locale";
 * TASK-119).
 *
 * The popup is rendered once by `src/app/[locale]/layout.tsx`, and a static layout does not know
 * which page it wraps: reading the path there would make every document per-request. The page
 * does know, because it already builds this exact map for its hreflang cluster
 * (`listingAlternatePaths()`, `corridorAlternatePaths()`). So each route renders this element with
 * that map, and the island reads it from the DOM after hydration. Nothing is fetched and nothing is
 * sent (A16 clause 5). A locale with no such page keeps the popup's fallback, the locale home.
 *
 * A Server Component with no JavaScript: one empty `hidden` element whose data attribute carries
 * JSON. It is not a link, so it adds no crawl path and no hreflang. Only launch codes and paths
 * under that locale's own prefix pass, so a caller cannot point an option off-site.
 */
import type { ReactElement } from "react";

import { launchLocaleCodes } from "../routing.ts";

/** The attribute the island reads. Restated there for the module-boundary reason in its header. */
export const LANGUAGE_ALTERNATES_ATTRIBUTE = "data-fo-language-alternates";

export interface LanguageAlternatesProps {
  /** Locale code → that locale's path for this page, as the hreflang builders return it. */
  readonly paths: Readonly<Record<string, string>>;
}

/** The entries the island may use: launch locales, root-relative, under their own prefix. */
export function languageAlternateEntries(
  paths: Readonly<Record<string, string>>,
): Record<string, string> {
  const launch = new Set(launchLocaleCodes());
  const kept: Record<string, string> = {};
  for (const [code, path] of Object.entries(paths)) {
    if (!launch.has(code)) continue;
    if (path !== `/${code}` && !path.startsWith(`/${code}/`)) continue;
    kept[code] = path;
  }
  return kept;
}

export function LanguageAlternates({
  paths,
}: LanguageAlternatesProps): ReactElement {
  return (
    <span
      hidden
      {...{
        [LANGUAGE_ALTERNATES_ATTRIBUTE]: JSON.stringify(
          languageAlternateEntries(paths),
        ),
      }}
    />
  );
}
