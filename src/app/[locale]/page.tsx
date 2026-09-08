import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitcher, launchLocale } from "@/modules/i18n";

/**
 * `/{locale}` placeholder home (spec 003 §5.3, §5.4; TASK-034, extended by TASK-035 with the
 * per-route metadata and the locale switcher).
 *
 * **Rendering: ISR, `revalidate` 1 h, tag `home:{locale}`** — the `plan/01` §3 shape reserved for
 * the locale home, wired here so spec 004/007 inherit it rather than introducing it. The tag name
 * is produced by `homeCacheTag()` in `src/lib/cache.ts` (the `plan/01` §3 invalidation seam) so
 * the page and whatever purges it cannot disagree. Next 16 only *attaches* a tag to a cache entry
 * through `use cache` / `cacheTag()`, which needs `cacheComponents` — a repo-wide rendering
 * change that belongs to the spec that ships the first real data fetch (007/008, as
 * `src/lib/cache.ts` already records). Phase 0 has no runtime data and invalidates nothing (§5.4),
 * so the honest wiring today is time-based revalidation plus the reserved tag.
 *
 * **The AC-8 gate is `dynamicParams = false` on the `[locale]` *layout*, not here** (TASK-035,
 * closing the `/review 15` carry-forward). A segment config option on a layout governs the whole
 * subtree, so `/fr`, `/xx`, `/EN` and `/nope` are refused by the router for every page below
 * `[locale]` — present and future — and answer 404 with the x-default document of
 * `src/app/not-found.tsx`, never a redirect and never a fabricated locale (ADR-0006). Spec 004's
 * pages therefore inherit the gate instead of repeating an export they could forget. Adding a
 * locale stays a data change (AC-31): `generateStaticParams` reads the registry, so a new code is
 * prerendered by the next build with no code edit. The `notFound()` below is the defensive second
 * line for the dev server, where params are not pre-resolved.
 *
 * The `<title>`/description pair is this page's own (§7's per-route `meta.*`); the layout carries
 * only the segment default, so a page added later cannot inherit the home page's title. The real
 * home — hero, corridors, occasions — is spec 004/007; what is here is the placeholder `<h1>` and
 * the locale switcher, which is what makes every locale root link to the other three (§6
 * "Internal links", `plan/02` §11).
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = launchLocale(requested);
  if (locale === undefined) notFound();
  const t = await getTranslations({ locale: locale.code, namespace: "meta" });

  return { title: t("home.title"), description: t("home.description") };
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  const locale = launchLocale(requested);
  if (locale === undefined) notFound();
  setRequestLocale(locale.code);

  const t = await getTranslations({ locale: locale.code, namespace: "meta" });

  return (
    <main id="main">
      <h1>{t("home.heading")}</h1>
      {/* `betaLocales` arrives with TASK-039's `unreviewedShare()`; the links work without it. */}
      <LocaleSwitcher locale={locale.code} />
    </main>
  );
}
