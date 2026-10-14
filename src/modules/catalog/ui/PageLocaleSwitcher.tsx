/**
 * The language links of one page, as the locale layout's `@switcher` slot renders them (spec 003
 * §2 L79 "links to the same path in every launch locale, falling back to the locale home", §5.3;
 * spec 004 §14 A24 AC-47; TASK-233).
 *
 * The layout mounts the switcher in the utility strip, the phone menu and the footer, and a static
 * layout does not know which page it wraps. A parallel-route slot does: Next.js renders the
 * `src/app/[locale]/@switcher/` file that mirrors the page's own folder, with the same params, so
 * each depth hands its segments here and the document stays static, with no path read and no
 * JavaScript (the `@notice` slot is the precedent). A route with no mirror (the locale home,
 * `boom`, `_query`) gets `@switcher/default.tsx`, which asks with no segments: the locale homes.
 *
 * `pageAlternatePaths()` is the page type's own existence answer, from the builders each route
 * already hands the language popup, so a link never names a page the router refuses. A Server
 * Component with no client JavaScript, like the rest of this module.
 */
import type { ReactElement } from "react";

import { LocaleSwitcher } from "@/modules/i18n";

import { pageAlternatePaths } from "../alternates";

export async function PageLocaleSwitcher({
  locale,
  segments,
}: {
  /** The document's resolved locale code. */
  readonly locale: string;
  /** The page's path below the locale; `[]` is the locale home. */
  readonly segments: readonly string[];
}): Promise<ReactElement> {
  return (
    <LocaleSwitcher
      locale={locale}
      paths={await pageAlternatePaths(locale, segments)}
    />
  );
}
