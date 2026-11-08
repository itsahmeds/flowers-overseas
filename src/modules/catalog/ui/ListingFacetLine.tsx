/**
 * The facet line of a country shop root or country category (spec 008 §14 A-founder-2026-10-24a
 * "Facets", AC-90; TASK-390; `docs/design/wireframes/country-shop-desktop.dc.html`, "A facet
 * result" and "The facet's empty state").
 *
 * What the request filtered by, in the reader's words: the colour's catalogue label and the
 * band's amounts (`shop.price.band.under` / `.between` / `.over`, each amount through
 * `formatMoney`, the bounds `priceBands()` computed for this country), joined by `formatList`;
 * then one plain link back to the **bare** page (`shop.seeAll` with the unfiltered count). That
 * link is the only `<a>` here and carries no query string, so no crawlable link ever names
 * `price=` or `colour=` (AC-90's `<a href>` scan).
 *
 * The board's "Price:" prefix, its "Show all" wording and the empty state's sentence are
 * `[slot]`s with no message key; they are escalated in `docs/tasks/TASK-390.md` rather than
 * invented here, so the line shows the values alone and the clear link reuses `shop.seeAll`.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { FACET_PARAMETERS, facetLabelKey } from "@/config/catalogue/schemas";
import { QUERY_KEY } from "@/config/url-keys";
import { formatList, formatMoney } from "@/modules/i18n";
import { Text } from "@/modules/ui";

import type { ListingView } from "../listing";

import { localeCode, registryLabel } from "./labels";

/**
 * The query a facet result's sort form and pager carry as hidden fields, so a re-sort or a page
 * turn keeps the filter (`{}` when the view is not faceted, and both controls stay as they were).
 * The pager also carries a non-default sort; the sort form sends its own.
 */
export function facetQuery(
  view: ListingView,
  options: { readonly withSort: boolean },
): Readonly<Record<string, string>> {
  const facet = view.facet;
  if (facet === undefined) return {};
  return {
    ...(facet.price === undefined
      ? {}
      : { [QUERY_KEY.price]: facet.price.key }),
    ...(facet.colour === undefined
      ? {}
      : { [FACET_PARAMETERS.colour]: facet.colour }),
    ...(options.withSort && view.sort !== "default"
      ? { [QUERY_KEY.sort]: view.sort }
      : {}),
  };
}

export interface ListingFacetLineProps {
  readonly view: ListingView;
}

export function ListingFacetLine({
  view,
}: ListingFacetLineProps): ReactElement | null {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const facet = view.facet;
  if (facet === undefined) return null;
  const locale = localeCode(view.locale);

  const parts: string[] = [];
  if (facet.colour !== undefined) {
    parts.push(registryLabel(t, facetLabelKey("colour", facet.colour)));
  }
  const price = facet.price;
  if (price !== undefined) {
    if (price.from !== undefined && price.to !== undefined) {
      parts.push(
        shop("price.band.between", {
          from: formatMoney(price.from, locale),
          to: formatMoney(price.to, locale),
        }),
      );
    } else if (price.to !== undefined) {
      parts.push(
        shop("price.band.under", { amount: formatMoney(price.to, locale) }),
      );
    } else if (price.from !== undefined) {
      parts.push(
        shop("price.band.over", { amount: formatMoney(price.from, locale) }),
      );
    }
  }

  return (
    <div
      className="gap-sm flex flex-wrap items-baseline pt-[16px]"
      data-fo-facet-line={view.resultCount === 0 ? "empty" : "result"}
    >
      {parts.length === 0 ? null : (
        <Text as="p" size="sm" className="text-ink font-bold">
          {formatList(parts, locale)}
        </Text>
      )}
      <a
        className="text-link hover:text-link-strong text-sm font-bold underline underline-offset-4"
        data-fo-facet-clear
        href={view.path}
      >
        {shop("seeAll", { count: facet.bareCount })}
      </a>
    </div>
  );
}
