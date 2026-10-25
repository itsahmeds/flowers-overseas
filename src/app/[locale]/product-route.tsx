import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isPublished } from "@/config/site-links";
import {
  ListingBreadcrumb,
  type LocalePathResolution,
  type ProductView,
  type ProductViewOptions,
  productAlternatePaths,
  productJsonLd,
  productView,
  resolveLocalePath,
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
 * The product page's head and body, **once**, for the two route files that render it (spec 009
 * §2, §5.4, §14 **A10**, AC-15, AC-24; TASK-127, TASK-228, TASK-128), as `./country-listing.tsx`
 * is for the country category and occasion:
 *
 * ```
 * /{locale}/{country}/{product}/{slug}             -product/[segment]/[child]/[grandchild]/page.tsx          prebuilt (ISR)
 * /{locale}/{country}/{product}/{slug}?tier=…      %5Fquery/-product/[segment]/[child]/[grandchild]/page.tsx per request
 * ```
 *
 * The product route reads no query string, so it stays prebuilt (A6) and the router's
 * `dynamicParams = false` gate holds there. `next.config.ts` rewrites a product address that
 * carries `?tier=` or `?date=` to the parameter route (`src/lib/product-rewrites.ts`), the one
 * file that reads them. Both call this module, the product route with `parameterised: false` and
 * no selection, the parameter route with `parameterised: true` and the request's own selection,
 * so `productView()`, the head and the body are one code path, and only those two values differ.
 * The robots directive is the view's (`productPageIndexability()`'s `unparameterised` term), never
 * a literal here; the canonical is `view.path`, the bare URL, on both.
 */

/** The route params both product route files receive: the visitor's address, depth 3. */
export interface ProductRouteParams {
  readonly locale: string;
  readonly segment: string;
  readonly child: string;
  readonly grandchild: string;
}

/** What differs between the two route files: whether the URL carried a parameter, and which. */
export type ProductRequest = Pick<
  ProductViewOptions,
  "parameterised" | "selection"
>;

/** The product resolution; everything else the resolver returns is a 404 here. */
export type ProductMatch = Extract<LocalePathResolution, { kind: "product" }>;

/**
 * The resolver's answer for the address, or a 404. `resolveLocalePath()` compares the locale and
 * the `product` segment exactly, so the uppercase spellings a case-insensitive rewrite captures
 * are 404s here.
 */
export async function productMatch({
  locale,
  segment,
  child,
  grandchild,
}: ProductRouteParams): Promise<ProductMatch> {
  const match = await resolveLocalePath(locale, [segment, child, grandchild]);
  if (match.kind !== "product") notFound();
  return match;
}

/**
 * The product page's one view model (spec 009 §5.2, T-32). `undefined` after the resolver said
 * the page exists can only mean the data moved under the page, and the honest answer is the 404
 * the existence rule now gives.
 */
async function productViewFor(
  match: ProductMatch,
  request: ProductRequest,
  deployment?: ProductViewOptions["deployment"],
): Promise<ProductView> {
  const view = await productView(
    { locale: match.locale, countryIso: match.iso2, sku: match.sku },
    {
      parameterised: request.parameterised,
      ...(request.selection === undefined
        ? {}
        : { selection: request.selection }),
      productLinks: isPublished("product"),
      ...(deployment === undefined ? {} : { deployment }),
    },
  );
  if (view === undefined) notFound();
  return view;
}

/** The product page's `<head>`: its title, the demo description, the view's robots, the bare canonical. */
export async function productRouteMetadata(
  match: ProductMatch,
  request: ProductRequest,
): Promise<Metadata> {
  const deployment = deploymentDescriptor(process.env);
  const view = await productViewFor(match, request, deployment);
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

/**
 * The product page's body: `ProductPage`, the language alternates and the JSON-LD. A function the
 * route awaits rather than a component it mounts, so the route returns this tree itself
 * (`tests/unit/product-route.test.tsx` reads it as Next renders it).
 */
export async function productRouteBody(
  match: ProductMatch,
  request: ProductRequest,
): Promise<ReactElement> {
  const product = await productViewFor(match, request);
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
