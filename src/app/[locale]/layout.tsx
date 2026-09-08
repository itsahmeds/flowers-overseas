import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { setLocaleTag } from "@/lib/sentry";
import {
  documentFallbackLocale,
  launchLocale,
  launchLocaleCodes,
  loadMessages,
  namespacesFor,
} from "@/modules/i18n";

import "../globals.css";

/**
 * The document layout for every localised URL (spec 003 §2, §5.3, §5.4, AC-6, AC-8, AC-9;
 * TASK-034). It renders `<html>`/`<body>` itself, because the app-root layout renders no document
 * — see `src/app/layout.tsx` for why.
 *
 * `<html lang dir>` come from the resolved locale's `bcp47` and `dir` in the registry — the
 * hard-coded English `lang` attribute of spec 001 §7 is gone from the repository (AC-6), and WCAG 3.1.1 Language
 * of Page is satisfied per locale (§8).
 *
 * The locale is read from the URL segment and from nothing else: no `Accept-Language`, no cookie,
 * no geo header, so `/en` is byte-identical for every client and no response carries `Vary`
 * (AC-9, ADR-0006). `setRequestLocale()` is what publishes it to next-intl — deliberately instead
 * of next-intl's middleware, which would redirect `/` and set its own cookie (§2 "No redirects,
 * ever", AC-10), and instead of `headers()`, which would opt every localised page out of static
 * rendering.
 *
 * An unknown, mis-cased or non-launch segment (`/fr`, `/xx`, `/EN`, `/nope`) is **not** resolved
 * to a guessed locale: `dynamicParams = false` on the page below refuses it at the routing layer
 * and the 404 document of `src/app/not-found.tsx` answers in the x-default locale (AC-8). This
 * layout still resolves such a segment to the x-default locale rather than throwing, so a
 * mis-routed request can never produce a document with no language at all.
 *
 * `robots: noindex,nofollow` stays on every localised document until spec 007 lifts it by rule
 * (§6 "Indexability", ADR-0007).
 */
export function generateStaticParams(): { locale: string }[] {
  // Launch locales only — never a pseudo-locale (§5.4, AC-29 on TASK-042).
  return launchLocaleCodes().map((locale) => ({ locale }));
}

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LocaleParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = launchLocale(requested) ?? documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "meta" });
  return {
    robots: "noindex,nofollow",
    title: t("home.title"),
    description: t("home.description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const { locale: requested } = await params;
  const locale = launchLocale(requested) ?? documentFallbackLocale();
  setRequestLocale(locale.code);
  // Non-PII: a language code from the path, nothing else (spec 003 §11).
  setLocaleTag(locale.code);

  const t = await getTranslations({ locale: locale.code, namespace: "a11y" });
  // The client provider gets the per-route namespace subset, never the whole catalogue (§6,
  // AC-27); the 500 boundary below is a Client Component and reads its copy from it.
  const messages = loadMessages(locale.code, namespacesFor("localeDocument"));

  return (
    <html lang={locale.bcp47} dir={locale.dir}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale.code} messages={messages}>
          <a href="#main">{t("skipToContent")}</a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
