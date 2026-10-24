import { getTranslations } from "next-intl/server";

import { type ListingView, listingJsonLd } from "@/modules/catalog";
import {
  type BreadcrumbLabel,
  JsonLd,
  deploymentDescriptor,
  schemaOptions,
} from "@/modules/seo";

/**
 * The listing pages' JSON-LD, mounted once per route beside the page component (spec 008 §2
 * "Schema", AC-17, AC-18; TASK-115).
 *
 * Every listing route (the shop root, the country category and occasion, both hubs and the
 * occasions index, prebuilt or through the parameter route) renders this with **the same view**
 * it hands the page component, so the trail and the list are the page's own: `app/` stays one
 * resolve and one mount, and the nodes are `listingJsonLd()`'s in `src/modules/catalog`.
 *
 * The label is the translator the components use, with the crumb's authored value passed through
 * as `{name}` exactly as `ListingBreadcrumb` passes it: one message, one value, one string. The
 * cast is `src/modules/geo/ui/labels.ts`'s reason (a key held as registry data is not one of
 * next-intl's literal keys). A deployment whose site URL is not a URL emits nothing rather than a
 * node with a broken `url` (`schemaOptions()`'s fail-closed rule).
 */
export async function ListingJsonLd({ view }: { readonly view: ListingView }) {
  const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
  if (options === undefined) return null;
  const t = await getTranslations({ locale: view.locale });
  const label: BreadcrumbLabel = (key, values) =>
    (t as unknown as BreadcrumbLabel)(key, values);
  return <JsonLd nodes={listingJsonLd(view, label, options)} />;
}
