import { getTranslations } from "next-intl/server";

import { documentFallbackLocale, localePath } from "@/modules/i18n";

import "./globals.css";

/**
 * The 404 document (spec 003 §5.3, AC-8; TASK-034).
 *
 * Every 404 in the application renders here: an unknown first segment (`/fr`, `/xx`, `/EN`,
 * `/nope`), which the `[locale]` segment refuses at the routing layer via `dynamicParams = false`,
 * and any unmatched path below a real locale (`/en/does-not-exist`). Status 404, never a 3xx and
 * never a fabricated locale page (ADR-0006, spec 001 T-16 keeps asserting the code).
 *
 * Its language is the **x-default locale from the registry** (`plan/02` §3: `x-default` → `/en`),
 * which is what AC-8 asks for on an unknown locale and what makes `lang="en"` plus English copy
 * true for `/en/does-not-exist`. It renders its own document because the app-root layout renders
 * none (see `layout.tsx`).
 *
 * **Deviation from §5.3, measured on Next 16.3.4 and recorded in the PR**: there is no
 * `src/app/[locale]/not-found.tsx`. `notFound()` and unmatched paths are both served by the
 * app-root 404 route, so a per-locale 404 *document* is not expressible — a German URL's 404 reads
 * in the x-default locale. Nothing in §9 asks for more than this (AC-8 names the x-default
 * document and the `/en` case), and the copy comes from the catalogue rather than a literal, so
 * the day the framework can route a nested 404 boundary it is a file move, not a rewrite.
 */
export default async function NotFound() {
  const locale = documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "errors" });
  const common = await getTranslations({
    locale: locale.code,
    namespace: "common",
  });

  return (
    <html lang={locale.bcp47} dir={locale.dir}>
      <body className="min-h-dvh">
        <main id="main">
          <h1>{t("notFound.heading")}</h1>
          <p>{t("notFound.body")}</p>
          <a href={localePath(locale.code, "home")}>{common("homeLink")}</a>
        </main>
      </body>
    </html>
  );
}
