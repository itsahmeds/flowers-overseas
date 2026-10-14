/**
 * The language links of one page, as the locale layout's `@switcher` slot renders them (spec 003
 * §2 L79 "links to the same path in every launch locale, falling back to the locale home", §5.3;
 * spec 004 §14 A24 AC-47; TASK-233).
 *
 * The layout mounts the switcher in the utility strip, the phone menu and the footer, and a static
 * layout does not know which page it wraps. A parallel-route slot does: Next.js renders the
 * `@switcher` file that mirrors the page's own folder, with the same params, so each depth hands
 * its segments here and the document stays static, with no path read and no JavaScript. The
 * `@notice` slot is the precedent. A route folder with no mirror (`boom`, `%5Fquery`) gets
 * `@switcher/default.tsx`: the locale homes, as before.
 *
 * `pageAlternatePaths()` is the page type's own existence answer, the builders each route already
 * hands the language popup, so a link never names a page the router refuses.
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { pageAlternatePaths } from "@/modules/catalog";
import {
  LocaleSwitcher,
  documentFallbackLocale,
  routableLocale,
} from "@/modules/i18n";

export async function PageLocaleSwitcher({
  locale: requested,
  segments,
}: {
  readonly locale: string;
  /** The page's path below the locale; `[]` is the locale home. */
  readonly segments: readonly string[];
}): Promise<ReactElement> {
  const locale = routableLocale(requested) ?? documentFallbackLocale();
  setRequestLocale(locale.code);
  return (
    <LocaleSwitcher
      locale={locale.code}
      paths={await pageAlternatePaths(locale.code, segments)}
    />
  );
}
