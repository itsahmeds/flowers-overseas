import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { COMPANY } from "@/config/company";
import { isPublished } from "@/config/site-links";
import { documentFallbackLocale, localePath } from "@/modules/i18n";
// Deep imports rather than the `@/modules/ui` barrel, for the reason `(chooser)/layout.tsx`
// records: the barrel re-exports the module's client islands and a route that reaches them
// downloads them. The 404 renders no island either.
import { fontVariables } from "@/modules/ui/fonts";
import { NoticeDocument } from "@/modules/ui/layout/NoticeDocument";
import {
  NOTICE_ACTIONS,
  NOTICE_ACTION_PRIMARY,
  NOTICE_ACTION_SECONDARY,
} from "@/modules/ui/layout/noticeShell";

import "./globals.css";

/**
 * The `.label` metadata line: the status code this document is served with, and the one piece of
 * text on it that is not translated because it is a number (`fo/no-literal-strings` scans for
 * letters). `docs/design/wireframes/errors-desktop.dc.html` draws the same eyebrow.
 */
const NOT_FOUND_STATUS = "404";

/**
 * The 404 document (spec 003 §5.3, AC-8; TASK-034, its `<title>` TASK-035).
 *
 * Every 404 in the application renders here: an unknown first segment (`/fr`, `/xx`, `/EN`,
 * `/nope`), which the `[locale]` segment refuses at the routing layer via `dynamicParams = false`,
 * and any unmatched path below a real locale (`/en/does-not-exist`). Status 404, never a 3xx and
 * never a fabricated locale page (ADR-0006, spec 001 T-16 keeps asserting the code).
 *
 * Its language is the **x-default locale from the registry** (`plan/02` §3: `x-default` → `/en`),
 * which is what AC-8 asks for on an unknown locale and what makes an English `lang` attribute plus
 * English copy true for `/en/does-not-exist`. It renders its own document because the app-root
 * layout renders none (see `layout.tsx`), and it only *is* the effective document because of that:
 * measured on Next 16.3.4, a 404 under two root layouts reaches this file but the framework wraps
 * it in a bare `<html>` with no `lang`, so the outer document would carry no language.
 *
 * **Deviation from §5.3, measured on Next 16.3.4 and recorded in the PR**: there is no
 * `src/app/[locale]/not-found.tsx`. A nested 404 boundary *is* rendered when a matching route
 * calls `notFound()`, but inside the framework's `<html id="__next_error__">` with no `lang`, so a
 * per-locale 404 *document* is not expressible — every 404, a German URL's included, reads in the
 * x-default locale from this file. Nothing in §9 asks for more than this (AC-8 names the x-default
 * document and the `/en` case), and the copy comes from the catalogue rather than a literal, so
 * the day the framework can route a nested 404 boundary as a document it is a file move, not a
 * rewrite.
 */
/**
 * The 404's own localised `<title>` (AC-25, WCAG 2.4.2; TASK-035). `not-found.tsx` is a Server
 * Component, so it can export metadata like any page, and it must: it renders the document itself,
 * has no page above it to inherit a title from, and `/nope` and `/en/does-not-exist` are two of
 * the URLs axe now audits with no exception list.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "meta" });

  return { title: t("notFound.title"), description: t("notFound.description") };
}

export default async function NotFound() {
  const locale = documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "errors" });
  const common = await getTranslations({
    locale: locale.code,
    namespace: "common",
  });
  const footer = await getTranslations({
    locale: locale.code,
    namespace: "footer",
  });
  const home = localePath(locale.code, "home");
  // AC-14, asked the one way the registry allows (`isPublished`, spec 004 §5.1). Spec 007
  // publishes the destinations hub and this document offers it with no edit here; until then a
  // lost visitor is offered the home page and nothing that would 404 a second time. It is
  // deliberately not rendered as inert text the way the header's unpublished entries are: an
  // action row is a row of things to press, and a button-shaped word that does nothing is the
  // dead affordance §14 A4 removed from the search band.
  const destinations = isPublished("destinations")
    ? localePath(locale.code, "destinations")
    : undefined;

  return (
    <html lang={locale.bcp47} dir={locale.dir} className={fontVariables}>
      <body className="min-h-dvh">
        <NoticeDocument
          body={t("notFound.body")}
          heading={t("notFound.heading")}
          lockupHref={home}
          meta={NOT_FOUND_STATUS}
          wordmark={COMPANY.tradingName}
        >
          <div className={NOTICE_ACTIONS}>
            <a className={NOTICE_ACTION_PRIMARY} href={home}>
              {common("homeLink")}
            </a>
            {destinations === undefined ? null : (
              <a className={NOTICE_ACTION_SECONDARY} href={destinations}>
                {footer("link.destinations")}
              </a>
            )}
          </div>
        </NoticeDocument>
      </body>
    </html>
  );
}
