import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isPublished } from "@/config/site-links";
import {
  ListingBreadcrumb,
  type LocalePathResolution,
  type ProductView,
  localeProductParams,
  productAlternatePaths,
  productJsonLd,
  productView,
  resolveLocalePath,
  writeProductExistenceSummary,
} from "@/modules/catalog";
import { infoPageExists, infoPagePath } from "@/modules/content";
import { LanguageAlternates } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  canonicalFor,
  deploymentDescriptor,
  pageMetadata,
  schemaOptions,
} from "@/modules/seo";
// Imported directly, not through the `ui` barrel: `ProductPage` mounts the printed-card preview,
// Caveat's one importer, so the barrel must not reach it (`tests/unit/fonts.test.ts`).
import { ProductPage } from "@/modules/ui/product/ProductPage";

/**
 * `/{locale}/-product/{segment}/{child}/{grandchild}` — **the product page's own route file**
 * (spec 009 §2, §5.4; §14 A-founder-2026-10-18a, AC-37; TASK-127, TASK-228).
 *
 * Nobody links here and no address shows it. `next.config.ts` rewrites every product address,
 * `/{locale}/{countrySlug}/{product}/{productSlug}`, to this path (`src/lib/product-rewrites.ts`),
 * so the visitor's address, the canonical and the hreflang set stay the bare product URL. The
 * country category and the country occasion stay in `../../../[segment]/[child]/[grandchild]`,
 * which no longer reaches `ProductPage`: that is what keeps the product island's chunk off the
 * listings (Turbopack puts every client module a route file reaches into the route's script set).
 * A direct request to this path carries `X-Robots-Tag: noindex, nofollow`.
 *
 * **Its params are its existence set** (spec 009 §14 **A6**, AC-3; TASK-127 E-1): every product
 * page per (locale, published destination), in the same `{ segment, child, grandchild }` shape the
 * shared route emitted. The `[locale]` layout exports `dynamicParams = false` (spec 003's locale
 * gate) and Next computes a route's `dynamicParams` as `every` segment's, so a path this build did
 * not emit is a router 404, rendered as the x-default `not-found.tsx` document with its `lang`.
 * `dynamicParams = true` below is therefore **inert** while the layout's is `false`; it is kept so
 * that, if the gate ever moves (spec 003 §14 A3's Cache Components tripwire), the route resolves on
 * demand through `productPageExists()` rather than silently refusing.
 *
 * **The existence summary** (spec 009 AC-3, §11) is written here, by the `generateStaticParams`
 * that emits the product params it counts, once per process (`/review 96`'s carry-forward to
 * TASK-127); its "Prebuilt" column equals its "PDPs" column since A6.
 *
 * **Rendering: ISR, `revalidate` 3600 s** with §5.4's tags, through `src/lib/cache.ts`. It renders
 * the bare URL: `?tier=` / `?date=` and their form are TASK-128's, so this file reads no search
 * parameter and stays ISR. Nothing here reads a cookie or a request header.
 *
 * It mounts one module page component, `ProductPage`, over one `productView()`; the one block that
 * page cannot import — spec 008's breadcrumb — is mounted here over the same view and handed in as
 * a slot. The PDP mounts no delivery-facts block (spec 009 §14 A-founder-2026-10-14d, AC-35).
 *
 * **Its JSON-LD** (spec 009 AC-18; TASK-130) is `productJsonLd()` over the same view: the
 * `BreadcrumbList` of `product.breadcrumb`, and a `Product` + `Offer` only behind the gate, which
 * is shut on every Phase 0 PDP. It moved here with the product page (AC-37).
 */
export const revalidate = 3600;
export const dynamicParams = true;

/**
 * Next calls `generateStaticParams` more than once per build (the collection pass and the render
 * pass), and the counts describe the build rather than the call: one process, one table.
 */
let productSummaryWritten = false;

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string; grandchild: string }[]
> {
  const params = [...(await localeProductParams())];
  // The product counts of the set just emitted, where CI reads them (spec 009 AC-3).
  if (!productSummaryWritten) {
    productSummaryWritten = true;
    await writeProductExistenceSummary();
  }
  return params;
}

interface ProductParams {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}

/** The product resolution; everything else the resolver returns is a 404 here. */
type ProductMatch = Extract<LocalePathResolution, { kind: "product" }>;

async function productMatch({ params }: ProductParams): Promise<ProductMatch> {
  const { locale, segment, child, grandchild } = await params;
  const match = await resolveLocalePath(locale, [segment, child, grandchild]);
  if (match.kind !== "product") notFound();
  return match;
}

/**
 * The product page's one view model (spec 009 §5.2, T-32). `undefined` after the resolver said
 * the page exists can only mean the data moved under the page, and the honest answer is the 404
 * the existence rule now gives. The bare URL: `parameterised` is `false` because this route reads
 * no search parameter (TASK-128 owns `?tier=` / `?date=`).
 */
async function productViewFor(
  match: ProductMatch,
  deployment?: Parameters<typeof productView>[1]["deployment"],
): Promise<ProductView> {
  const view = await productView(
    { locale: match.locale, countryIso: match.iso2, sku: match.sku },
    {
      parameterised: false,
      productLinks: isPublished("product"),
      ...(deployment === undefined ? {} : { deployment }),
    },
  );
  if (view === undefined) notFound();
  return view;
}

export async function generateMetadata(
  props: ProductParams,
): Promise<Metadata> {
  const match = await productMatch(props);
  const deployment = deploymentDescriptor(process.env);
  const view = await productViewFor(match, deployment);
  const t = await getTranslations({ locale: match.locale });
  const label = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  // The description is the shop's demo sentence (N1, spec 004 §14 A23 clause 12): it is true of
  // every product page in Phase 0, and a PDP writes no new `<head>` copy of its own while every
  // one is `noindex`.
  const shop = await getTranslations({
    locale: match.locale,
    namespace: "shop",
  });
  return pageMetadata({
    title:
      view.h1.formKey === undefined
        ? view.h1.name
        : label(view.h1.key, {
            name: view.h1.name,
            descriptor: label(view.h1.formKey, {
              flower: label(view.h1.flowerKey),
            }),
          }),
    description: shop("root.demoNotice"),
    directive: view.indexability.directive,
    canonical: canonicalFor(match.locale, view.path, {
      baseUrl: deployment.siteUrl,
    }),
  });
}

export default async function LocaleProductRoute(props: ProductParams) {
  const match = await productMatch(props);
  const product = await productViewFor(match);
  setRequestLocale(match.locale);
  const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
  // The translator `ListingBreadcrumb` reads, so the JSON-LD label and the visible label are one
  // message with one value (the `[child]` route's `registryLabels()` cast, for its reason).
  const t = await getTranslations({ locale: match.locale });
  const label = t as unknown as BreadcrumbLabel;
  // The popup's options go to this product in each locale that has it (TASK-197, owed from
  // the TASK-179 review); nothing here touches the head.
  const productAlternates = (
    <LanguageAlternates
      paths={await productAlternatePaths({
        sku: match.sku,
        countryIso: match.iso2,
      })}
    />
  );
  return (
    <>
      <ProductPage
        breadcrumb={
          // The product page keeps its trail on the phone and shows no back link (spec 004
          // §14 A24 clause 4 (e)); `ProductPage` displays it below the buy section there.
          <ListingBreadcrumb crumbs={product.breadcrumb} phone="trail" />
        }
        // The fresh-flower promise links to the guarantee page where this locale has one (spec
        // 009 §14 A11 bullet 1, spec 041 §6; TASK-287): `infoPageExists()`'s answer, asked here
        // because `modules/ui` may not read the content module.
        guaranteeHref={
          infoPageExists("guarantee", match.locale)
            ? infoPagePath("guarantee", match.locale)
            : undefined
        }
        view={product}
      />
      {productAlternates}
      {/* `BreadcrumbList` from the trail above, and the gated `Product` + `Offer` (spec 009
          AC-18; TASK-130): one `productView()` in, so the markup cannot disagree with the page. */}
      <JsonLd
        nodes={
          options === undefined ? [] : productJsonLd(product, label, options)
        }
      />
    </>
  );
}
