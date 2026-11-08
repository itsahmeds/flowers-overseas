/**
 * `GET /api/prices/{locale}/{iso2}`: the remembered country's prices document (spec 004 §14
 * A-founder-2026-10-24a item 3 "With a remembered country", "Rendering", AC-80, T-86; TASK-391).
 *
 * @purpose The cached prices document the deferred island fills country-less pages from
 *
 * ISR (`revalidate` 3,600 s), `public` cache, the same bytes for everyone: it reads no cookie, no
 * header and no query, only its two path segments. Its paths carry `catalog:{iso2}` in the cache
 * registry (`src/lib/cache.ts`), so a go-live or a core-list change re-renders it with the
 * country's listings. Under `/api/`, which `robots.txt` disallows. A locale that is not a launch
 * locale or a country outside the shop set answers 404, and the island leaves the page as served.
 *
 * Every string is server-formatted with the locale's messages, exactly as the country card prints
 * it (`ProductCard`'s `catalog.price.from`, `.inclusive`, `.equivalents`), so the filled card and
 * the shop root's card are the same text. Thin: the view is `rememberedPricesView()`'s.
 */
import { createTranslator } from "next-intl";

import { isLocaleCode, LOCALES } from "@/config/locales";
import { pricesDocuments, rememberedPricesView } from "@/modules/catalog";
import { formatMoney, loadMessages } from "@/modules/i18n";
import { equivalentsMessageValues } from "@/modules/ui";

export const revalidate = 3600;

/** The CDN keeps it as long as the origin does; the browser revalidates within the hour. */
const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function generateStaticParams(): Promise<
  { locale: string; iso2: string }[]
> {
  return (await pricesDocuments()).map(({ locale, iso2 }) => ({
    locale,
    iso2: iso2.toLowerCase(),
  }));
}

type Values = Readonly<Record<string, string | number>>;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; iso2: string }> },
): Promise<Response> {
  const { locale, iso2 } = await params;
  const launch = LOCALES.find((entry) => entry.code === locale)?.isLaunch;
  if (!isLocaleCode(locale) || launch !== true || iso2 !== iso2.toLowerCase()) {
    return new Response(null, { status: 404 });
  }
  const view = await rememberedPricesView(locale, iso2, new Date());
  if (view === undefined) return new Response(null, { status: 404 });

  const t = createTranslator({
    locale,
    messages: loadMessages(locale, [
      "catalog",
      "shop",
      "product",
      "destinations",
    ]),
  }) as unknown as (key: string, values?: Values) => string;
  const country = t(view.nameKey);

  const document = {
    iso2: view.iso2.toLowerCase(),
    chooser: view.chooser,
    line: t("shop.chosen.line", { country }),
    change: t("product.destination.change"),
    cards: Object.fromEntries(
      view.cards.map((card) => [
        card.productId,
        {
          price: t("catalog.price.from", {
            price: formatMoney(card.price, locale),
          }),
          inclusive: t("catalog.price.inclusive"),
          equivalents:
            card.equivalents === null
              ? null
              : t(
                  "catalog.price.equivalents",
                  equivalentsMessageValues(card.equivalents, locale),
                ),
          slots: card.slots,
        },
      ]),
    ),
    links: view.links,
  };

  return Response.json(document, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
