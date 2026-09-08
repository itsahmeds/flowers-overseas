import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { launchLocale } from "@/modules/i18n";

/**
 * `/{locale}` placeholder home (spec 003 §5.3, §5.4; TASK-034).
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
 * **`dynamicParams = false` is the AC-8 gate.** The `[locale]` segment would otherwise match any
 * first path segment, so `/fr`, `/xx`, `/EN` and `/nope` would each render *something*; with the
 * launch locales fixed by `generateStaticParams` (in the layout, from the registry) every other
 * segment is refused by the router and answers 404 with the x-default document of
 * `src/app/not-found.tsx` — never a redirect, never a fabricated locale (ADR-0006). It also keeps
 * a pseudo-locale structurally unreachable in production (§5.4, AC-29). Adding a locale stays a
 * data change (AC-31): `generateStaticParams` reads the registry, so a new code is prerendered by
 * the next build with no code edit. The `notFound()` below is the defensive second line for the
 * dev server, where params are not pre-resolved.
 *
 * The real home is spec 004/007; the locale switcher and the `<h1>` copy belong to TASK-035.
 */
export const revalidate = 3600;
export const dynamicParams = false;

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
    </main>
  );
}
