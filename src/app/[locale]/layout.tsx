import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { ga4MeasurementId } from "@/lib/env.schema";
import { setLocaleTag } from "@/lib/sentry";
import { AnalyticsScripts } from "@/modules/analytics";
import {
  LocaleSuggestionBanner,
  documentFallbackLocale,
  loadMessages,
  namespacesFor,
  routableLocale,
  routableLocaleCodes,
} from "@/modules/i18n";
import { fontVariables, SiteFooter, SkipLink } from "@/modules/ui";

import "../globals.css";

/**
 * The document layout for every localised URL (spec 003 §2, §5.3, §5.4, AC-6, AC-8, AC-9;
 * TASK-034; the central `dynamicParams` gate and the metadata default are TASK-035). It renders
 * `<html>`/`<body>` itself, because the app-root layout renders no document
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
 * to a guessed locale: `dynamicParams = false` **here, on the segment** refuses it at the routing
 * layer and the 404 document of `src/app/not-found.tsx` answers in the x-default locale (AC-8).
 * This layout still resolves such a segment to the x-default locale rather than throwing, so a
 * mis-routed request can never produce a document with no language at all.
 *
 * TASK-035 moved that export up from the page (the carry-forward from `/review 15`): a segment
 * config option set on a layout governs the whole subtree, so the gate is now in **one** place and
 * a page added at `/de/about` by spec 004 cannot forget it and fabricate `/fr/about` as a
 * duplicate of the English URL (§6, recorded in `docs/architecture.md` §2). Making the layout call
 * `notFound()` instead was rejected for the reason TASK-034 measured: a `notFound()` from a
 * matching route renders inside the framework's `<html id="__next_error__">` with no `lang`, which
 * breaks AC-8 and WCAG 3.1.1, whereas the routing-layer refusal reaches `not-found.tsx` as a real
 * x-default document.
 *
 * `robots: noindex,nofollow` stays on every localised document until spec 007 lifts it by rule
 * (§6 "Indexability", ADR-0007).
 */
export const dynamicParams = false;

export function generateStaticParams(): { locale: string }[] {
  // The launch locales, plus the pseudo-locales when `ENABLE_PSEUDO_LOCALES` is on (TASK-042).
  // §5.4's "never a pseudo-locale" is about what this list contains in *production*, where the env
  // schema refuses the flag (§8, AC-29): `routableLocaleCodes()` there is exactly
  // `launchLocaleCodes()`, and on a preview it adds `/en-XA` and `/ar-XB` so the visual and a11y
  // suites have real documents to screenshot. `dynamicParams = false` still refuses every code
  // outside this list, so `/fr`, `/xx` and `/EN` 404 unchanged (AC-8).
  return routableLocaleCodes().map((locale) => ({ locale }));
}

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

/**
 * The segment's metadata **default**: the `noindex,nofollow` of §6, plus a title and description
 * so that every document under `[locale]` has a non-empty localised title even when no page
 * metadata resolves —
 * the 500 boundary is the case that matters, since `error.tsx` is a Client Component and cannot
 * export metadata (AC-25, WCAG 2.4.2). Each page overrides both halves with its own pair; the
 * locale home does so in `page.tsx` (§7's per-route `meta.*` title/description).
 */
export async function generateMetadata({
  params,
}: LocaleParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested) ?? documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "meta" });
  return {
    robots: "noindex,nofollow",
    title: t("error.title"),
    // The pair, not just the title: a document that reaches this default is the 500 boundary, and
    // a `<meta name="description">` is part of the document even when it is `noindex` (a shared
    // link preview renders it). `meta.error.description` had no consumer before TASK-040, which
    // `pnpm i18n:check`'s unused-key rule is what surfaced (`/review 16`).
    description: t("error.description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const { locale: requested } = await params;
  const locale = routableLocale(requested) ?? documentFallbackLocale();
  setRequestLocale(locale.code);
  // Non-PII: a language code from the path, nothing else (spec 003 §11).
  setLocaleTag(locale.code);

  const t = await getTranslations({ locale: locale.code, namespace: "a11y" });
  // The client provider gets the per-route namespace subset, never the whole catalogue (§6,
  // AC-27); the 500 boundary below is a Client Component and reads its copy from it.
  const messages = loadMessages(locale.code, namespacesFor("localeDocument"));

  return (
    // `fontVariables`: the two self-hosted families and their preload links (spec 004 AC-4).
    <html lang={locale.bcp47} dir={locale.dir} className={fontVariables}>
      <head>
        {/* The only inline script in the application and the first thing in the document: the
            Consent Mode v2 **default-denied** block, plus the GA4 tag when — and only when —
            `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set (spec 004 §2, AC-18, AC-21; TASK-050). Its
            `'sha256-'` hash is in the CSP `script-src` of every environment, computed in
            `next.config.ts` from the same constant, which is why editing the script without the
            policy is not a reachable state (ADR-0016). Nothing here varies by visitor, so the
            document stays one cache entry with no `Vary` and no `Set-Cookie`: the banner that
            *reads* the decision is a client island (TASK-051). */}
        <AnalyticsScripts measurementId={ga4MeasurementId(process.env)} />
      </head>
      <body className="min-h-dvh">
        {/* `timeZone` mirrors `src/modules/i18n/request.ts`: a relay has no single local zone,
            every rendered time carries its own IANA zone (`formatTimeInZone`), and UTC is the
            neutral default. Passing it explicitly is what keeps the client provider from
            consulting the *visitor's* zone as a fallback — an environment difference that would
            make client markup disagree with server markup, and the one such difference next-intl
            warns about. TASK-041 is where it starts to matter: the banner island is the first
            component that reads copy in the browser. */}
        <NextIntlClientProvider
          locale={locale.code}
          messages={messages}
          timeZone="UTC"
        >
          {/* The skip link is the first focusable element of every document (WCAG 2.4.1). Spec
              003 shipped it as a bare `<a>`; spec 004 gives it the **visible focused state** §2
              asks for through the `SkipLink` primitive — off-screen until focused, then a paper
              card with the focus ring above every other layer. Same target, same message key. */}
          <SkipLink>{t("skipToContent")}</SkipLink>
          {children}
          {/* The colophon of spec 004 §5.3, on every localised document (AC-9): a Server
              Component with zero client JavaScript, whose links, company identity and payment
              line all come from the Phase-0 registries (TASK-049). */}
          <SiteFooter locale={locale.code} />
          {/* Last in the document and out of flow: the language suggestion of ADR-0006 in its
              positive form. `LocaleSuggestionBanner` is a Server Component that projects the
              locale registry and hands it to a client loader, which imports the island itself
              after hydration (`ssr: false`) — so this document's HTML is identical for every
              visitor, carries no `Vary` and sets no cookie (spec 003 §5.4, AC-12, AC-28), and the
              banner is reached by continuing to tab rather than by stealing focus (§8). */}
          <LocaleSuggestionBanner locale={locale.code} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
