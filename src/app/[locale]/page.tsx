import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routableLocale } from "@/modules/i18n";
import {
  DestinationList,
  HOME_BLEED,
  HomeFaq,
  HomeHero,
  HowItWorks,
  OccasionDates,
  OccasionTiles,
  ProofRow,
  TrustStrip,
} from "@/modules/ui";

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
 * only the segment default, so a page added later cannot inherit the home page's title.
 *
 * **TASK-052 replaced the placeholder `<h1>` with the real above-the-fold band**, and the page
 * stayed thin: it resolves the locale, publishes it to next-intl and mounts two Server Components
 * from `src/modules/ui`. Everything that could be a decision — the reserved photo slot's ratio and
 * `sizes`, the collation of the seven destinations, whether a destination is a link, and where
 * `Continue` goes — is made inside the module (`home/finder-model.ts`), which is what makes spec
 * 004 AC-11's "a country is data" proof a change under `src/config/` with **no change under
 * `src/app/`**. `meta.home.heading` is gone with the placeholder: the `<h1>` is
 * `home.hero.heading`, the artboards' headline.
 *
 * The locale switcher moved off this page with TASK-048: spec 004's header hosts it on **every**
 * localised document, so rendering it here as well would put two identical switchers (and two
 * `navigation` landmarks with the same name) in the document. Every locale root still links to
 * the other three, from the header instead of from the page (§6 "Internal links", `plan/02` §11).
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested);
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
  const locale = routableLocale(requested);
  if (locale === undefined) notFound();
  setRequestLocale(locale.code);

  return (
    <main id="main">
      {/* The above-the-fold band of the founder-approved artboards: the reserved full-bleed photo
          slot, the paper card with the eyebrow, the one `<h1>` (the text LCP element) and the
          proposition, and the finder — type-ahead country, town/postcode, delivery date, neutral
          `Continue` (TASK-052). */}
      <HomeHero locale={locale.code} />
      {/* The four-fact proof strip. */}
      <ProofRow />
      {/*
        The rest of the page, in the round-2 artboards' order (TASK-053). The two priced rows the
        artboards put at positions 3 and 4 — "Bouquets we can deliver in Poland today" and "Most
        sent this week" — are TASK-054's and spec 005/008's, and mount between the proof strip and
        the dates strip when they land; nothing here approximates a product or a price.
      */}
      <OccasionDates locale={locale.code} />
      <OccasionTiles locale={locale.code} />
      <HowItWorks />
      <HomeFaq />
      <TrustStrip className={HOME_BLEED} />
      {/* AC-11's destination states, and where the finder's `Continue` lands while no corridor
          page is published. TASK-054 replaces it with the artboards' destinations grid and
          inherits its `id`. */}
      <DestinationList locale={locale.code} />
    </main>
  );
}
