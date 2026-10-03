import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { COMPANY } from "@/config/company.ts";
import { COUNTRY_CODES } from "@/config/countries";
import { isLocaleCode } from "@/config/locales";
import { OCCASION_TILES } from "@/config/occasions";
import {
  DEMO_DESTINATION_ISO2,
  isPublished,
  listingLinkId,
} from "@/config/site-links";
import {
  corridorShopEntry,
  listProductPages,
  listingExists,
  slugFor,
} from "@/modules/catalog";
import { listingPath, routableLocale } from "@/modules/i18n";
import {
  JsonLd,
  deploymentDescriptor,
  organization,
  schemaOptions,
  webSite,
} from "@/modules/seo";
import {
  DATE_OCCASION_KEYS,
  DestinationsGrid,
  HomeFaq,
  HomeHero,
  HomeProvenanceNote,
  HowItWorks,
  OccasionDates,
  OccasionTiles,
  ProofRow,
  ReviewsSection,
  TrendingRow,
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
 * **JSON-LD (TASK-093, spec 007 AC-15).** The locale home is the one page that carries the site's
 * identity: `Organization` with the three fields `src/config/company.ts` actually holds
 * (`name`, `url`, `logo`) — no registry number, no VAT id and no address while `registered` is
 * false — and `WebSite` **without** a `SearchAction`, because there is no search until spec 008
 * ships one. Nothing else: no `FAQPage` from the five disclosures (spec 004 AC-16 keeps the
 * home's own structured data at none, and the visible FAQ here is chrome copy rather than the
 * authored 8–12 band of a corridor guide), no `Product`, no `Offer`, no rating and no review
 * (AC-16). This narrows spec 004 AC-16's "a 004 page emits no structured data" clause the same way
 * AC-10 narrows its canonical clause: 004 emits none of its own, and 007 owns what the page emits.
 *
 * The locale switcher moved off this page with TASK-048: spec 004's header hosts it on **every**
 * localised document, so rendering it here as well would put two identical switchers (and two
 * `navigation` landmarks with the same name) in the document. Every locale root still links to
 * the other three, from the header instead of from the page (§6 "Internal links", `plan/02` §11).
 */
export const revalidate = 3600;

/**
 * The catalogue's answers the home's sections need and `src/modules/ui` may not ask for itself
 * (`plan/01` §5; TASK-173's precedent, extended by TASK-177): which destinations have a shop root
 * here, the demo destination's shop root, and the occasion hubs that exist and may be linked.
 * Each is the same predicate the router and the AC-21 crawl read, so no link can point at a 404.
 */
async function homeCatalogueLinks(locale: string): Promise<{
  readonly shopCountries: readonly string[];
  readonly shopHref: string | undefined;
  readonly hubHrefs: Readonly<Record<string, string>>;
}> {
  const shops = await Promise.all(
    COUNTRY_CODES.map(async (iso2) => {
      const entry = await corridorShopEntry(locale, iso2);
      return { iso2, href: entry.shopEntryHref };
    }),
  );
  const hubHrefs: Record<string, string> = {};
  if (isLocaleCode(locale) && isPublished(listingLinkId("occasionHub"))) {
    const keys = new Set([
      ...OCCASION_TILES.map((tile) => tile.catalogueKey as string),
      ...Object.values(DATE_OCCASION_KEYS),
    ]);
    for (const key of keys) {
      const slug = slugFor("occasion", key, locale);
      if (slug === undefined) continue;
      const exists = await listingExists({
        pageType: "occasionHub",
        locale,
        entityKey: key,
      });
      if (exists) {
        hubHrefs[key] = listingPath(locale, { pageType: "occasionHub", slug });
      }
    }
  }
  return {
    shopCountries: shops
      .filter((shop) => shop.href !== undefined)
      .map((shop) => shop.iso2),
    shopHref: shops.find((shop) => shop.iso2 === DEMO_DESTINATION_ISO2)?.href,
    hubHrefs,
  };
}

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

  const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);

  const links = await homeCatalogueLinks(locale.code);

  return (
    <>
      <main id="main">
        {/* The v2 letter home (spec 004 §14 A21; TASK-177), in the artboards' order. The page
            mounts the sections and hands in the catalogue's answers; every gate is the module's.
            The hero is the copy, the photograph and the sentence picker (A21 clause 4). */}
        <HomeHero locale={locale.code} shopCountries={links.shopCountries} />
        {/* Popular choices: each card links to its product page where that page exists (spec 008
            §14 A14 (e); TASK-173). */}
        <TrendingRow
          locale={locale.code}
          productPages={
            isLocaleCode(locale.code) ? await listProductPages(locale.code) : []
          }
          {...(links.shopHref === undefined
            ? {}
            : { shopHref: links.shopHref })}
        />
        <OccasionDates locale={locale.code} hubHrefs={links.hubHrefs} />
        <OccasionTiles locale={locale.code} hubHrefs={links.hubHrefs} />
        {/* The honesty label (spec 006 AC-17, ADR-0014), under the last image-bearing section. */}
        <HomeProvenanceNote locale={locale.code} />
        {/* Renders nothing until a completed order produces a real review (AC-15). */}
        <ReviewsSection locale={locale.code} />
        <HowItWorks />
        {/* The promise band: v2's form of AC-10's trust strip. */}
        <ProofRow />
        <HomeFaq />
        <DestinationsGrid
          locale={locale.code}
          {...(links.shopHref === undefined
            ? {}
            : { shopHref: links.shopHref })}
        />
      </main>
      <JsonLd
        nodes={
          options === undefined
            ? []
            : [
                organization(COMPANY, options),
                webSite(COMPANY.tradingName, options),
              ]
        }
      />
    </>
  );
}
