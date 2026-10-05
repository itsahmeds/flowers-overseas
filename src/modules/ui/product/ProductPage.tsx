/**
 * `ProductPage` — the product detail page, assembled in the artboards' block order (spec 009 §2
 * "Page anatomy", §5.3, AC-1, AC-8, AC-10, AC-21, AC-22, AC-25; `docs/design/wireframes/
 * product-{desktop,mobile}.dc.html`; TASK-127).
 *
 * **Block order (v2, TASK-179)** — breadcrumb → gallery → destination line → eyebrow → `<h1>` →
 * the all-in price → description → 1 size → 2 date → delivery facts → 3 the card message (with
 * its printed preview under it below `lg`) → 4 add-ons → the summary and the demo sentence →
 * "Good to know" · "What we promise" → related products. That is the DOM order and the mobile
 * order; at `lg` the page is the artboard's 7∶5 pair — the gallery (sticky) with the printed-card
 * preview under it on the left, the buy column on the right — by column placement only.
 *
 * **The printed-card preview is drawn twice and shown once**: under the gallery at `lg`, under
 * the field below it (`hidden` / `lg:hidden`), exactly as the two artboards place it. The page's
 * one island, `CardMessageField`, writes into both; `display: none` keeps the hidden one out of the
 * accessibility tree. The card message never has a `name` (A21 clause 5).
 *
 * **It renders from one `ProductView` and decides nothing a view model could.** The picker's state,
 * the selected tier and date, every amount, the stale-FX state, the trust claims and the related
 * row are all `productView()`'s; this file reads them. The three picker states are therefore the
 * same template — `delivery.state` is data — which is AC-8's "zero template edits".
 *
 * Two blocks arrive as **slots** rather than imports, because of the import direction: `catalog`
 * and `geo` both import this module at runtime, so `ui` may import their *types* and nothing else.
 * The route mounts spec 008's `ListingBreadcrumb` and spec 007's delivery-facts block (reused
 * unchanged, TASK-126 E-1 (a)) and hands them in.
 *
 * **No purchase affordance** (§13 Q6, Q7): no basket, no "Continue", no checkbox. The trust block
 * renders the substitution claim only — the one whose backing exists and the one the drawing shows
 * (TASK-127's ruling); a claim the view model does not carry renders nothing, not even a heading.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { isPublished } from "@/config/site-links";
import type { ProductView } from "@/modules/catalog";
import { formatMoney, formatNumber, localePath } from "@/modules/i18n";

import { Icon } from "../icons/Icon.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import { Price } from "../primitives/Price.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";
import { equivalentsMessageValues } from "../shop/equivalents.ts";
import { ProductCard } from "../shop/ProductCard.tsx";

import { AddonPriceList } from "./AddonPriceList.tsx";
import { CardMessageField } from "./CardMessageField.tsx";
import { DeliveryDatePicker } from "./DeliveryDatePicker.tsx";
import { Gallery } from "./Gallery.tsx";
import { localeOf, messageFor } from "./labels.ts";
import { PriceSummary } from "./PriceSummary.tsx";
import { PrintedCardPreview } from "./PrintedCardPreview.tsx";
import { STEP_HEADING, StepLegend, StepNumber } from "./StepLegend.tsx";
import { TierSelector } from "./TierSelector.tsx";

export interface ProductPageProps {
  readonly view: ProductView;
  /** Spec 008's breadcrumb over `view.breadcrumb`, mounted by the route. */
  readonly breadcrumb: ReactNode;
  /** Spec 007's delivery-facts block over `view.facts`, mounted by the route. */
  readonly facts: ReactNode;
}

/** The related row's full length, which the approved heading names in words ("Six more"). */
const RELATED_SHOWN = 6;

/** The card message's limit — the artboards' counter, and the field's `maxLength`. */
export const CARD_MESSAGE_MAX = 400;

/** v2's buy-column step rhythm: 34 px between steps (product artboard "Spacing"). */
const STEP = "mt-[34px]";

/** The `h2.h2s` voice of the lower band and the related row. */
const H2S = "display text-2xl-s md:text-2xl leading-[1.08] m-0";

export function ProductPage({
  view,
  breadcrumb,
  facts,
}: ProductPageProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const corridor = useTranslations("corridor");
  const catalog = useTranslations("catalog");
  const code = localeOf(view.locale);
  const country = messageFor(t, view.country.nameKey);
  const live = view.delivery.state === "live";
  const selectedTier = view.tiers.find(
    (tier) => tier.tierKey === view.selectedTierKey,
  );

  const descriptor =
    view.h1.formKey === undefined
      ? undefined
      : messageFor(t, view.h1.formKey, {
          flower: messageFor(t, view.h1.flowerKey),
        });
  const destinations = isPublished("destinations")
    ? localePath(view.locale, "destinations")
    : undefined;
  // "What the price does not include" names the vase, so it renders only where the vase is not in
  // the price — and its reason is the photograph ("styled with one"), so only beside a photograph
  // (TASK-126 E-5, ruled 2026-10-03). On the no-photo placeholder the vase stays a priced add-on.
  const excludes = !view.product.vaseIncluded && view.gallery.kind === "photos";

  // The preview's sample line is the card add-on's own description ("Your message, printed on our
  // card and tucked into the bouquet."), so the field and the add-on row say one thing.
  const freshness = view.trust.includes("freshnessGuarantee");
  const preview = (
    <PrintedCardPreview
      printed={product("card.printed")}
      sample={catalog("addon.card.description")}
    />
  );

  return (
    <main
      className={PAGE_FRAME}
      id="main"
      data-fo-pdp={view.product.sku}
      data-fo-pdp-picker={view.delivery.state}
    >
      {breadcrumb}

      <div className="grid items-start gap-[24px] pt-[16px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[64px] lg:pt-[28px]">
        <div className="lg:sticky lg:top-[24px]">
          <Gallery
            gallery={view.gallery}
            locale={code}
            priority
            productName={view.product.name}
          />
          <div className="mt-[28px] hidden max-w-[440px] lg:block">
            {preview}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <p
            className="text-ui text-ink-muted m-0 mb-[18px]"
            data-fo-destination-line
          >
            {product("destination.label")} <b className="text-ink">{country}</b>
            {destinations === undefined ? null : (
              <>
                {" · "}
                <a
                  className="text-link hover:text-link-strong font-bold underline underline-offset-4"
                  href={destinations}
                >
                  {product("destination.change")}
                </a>
              </>
            )}
          </p>
          {/* The eyebrow: the product's catalogue descriptor and its destination ("Hand-tied rose
              bouquet · for Poland"), in the uppercase eyebrow voice. */}
          {descriptor === undefined ? null : (
            <Eyebrow className="mb-[14px]">
              {product("eyebrow", { descriptor, country })}
            </Eyebrow>
          )}
          <Display as="h1" size="title">
            <bdi>{view.h1.name}</bdi>
          </Display>
          {/* The all-in price of the selected size — the same `formatMoney` output the summary's
              total prints, so price shown = price charged = schema price (AC-21). It is not a
              second total: it is the tier's own price, as the tier chip prints it. */}
          {selectedTier === undefined ? null : (
            <p className="m-0 mt-[18px]" data-fo-pdp-price>
              <Price
                amount={formatMoney(selectedTier.price, code)}
                equivalents={
                  view.equivalents.price === undefined
                    ? undefined
                    : catalog(
                        "price.equivalents",
                        equivalentsMessageValues(view.equivalents.price, code),
                      )
                }
                qualifier={catalog("price.inclusive")}
                variant="page"
              />
            </p>
          )}
          {view.description === undefined ? null : (
            <p
              className="text-ink-muted text-body-s md:text-body m-0 mt-[16px]"
              data-fo-description
            >
              {view.description.text}
            </p>
          )}

          <div className={STEP}>
            <TierSelector
              locale={code}
              selectedTierKey={view.selectedTierKey}
              step={1}
              tiers={view.tiers}
            />
          </div>

          <div className={STEP}>
            <DeliveryDatePicker
              country={country}
              delivery={view.delivery}
              locale={code}
              step={2}
              {...(view.selectedDate === undefined
                ? {}
                : { selectedDate: view.selectedDate })}
              {...(view.country.corridorPath === undefined
                ? {}
                : { corridorPath: view.country.corridorPath })}
            />
          </div>

          <section
            aria-labelledby="pdp-facts-heading"
            className={STEP}
            data-fo-pdp-facts
          >
            <Eyebrow className="mb-[4px]">{corridor("facts.eyebrow")}</Eyebrow>
            <h2
              className="display text-h3-s md:text-h3 m-0 mb-[12px]"
              id="pdp-facts-heading"
            >
              {live
                ? corridor("facts.headingLive")
                : corridor("facts.headingGuide")}
            </h2>
            {facts}
          </section>

          <fieldset
            className={`${STEP} m-0 min-w-0 border-0 p-0`}
            data-fo-pdp-card
          >
            <StepLegend id="pdp-card-legend" step={3}>
              {product("card.legend")}
            </StepLegend>
            <CardMessageField
              labelledBy="pdp-card-legend"
              className="bg-card text-ink text-body rounded-letter mt-[12px] block min-h-[190px] w-full resize-y border-0 bg-[0_17px] bg-(image:--card-lines) px-[22px] py-[18px] leading-[38px] shadow-[inset_0_0_0_1.5px_var(--color-field-edge),0_14px_30px_-18px_var(--color-shade)]"
              id="pdp-card-message"
              limit={formatNumber(CARD_MESSAGE_MAX, code)}
              maxLength={CARD_MESSAGE_MAX}
            />
            <div className="mt-[16px] max-w-[440px] lg:hidden">{preview}</div>
          </fieldset>

          {view.addons.length === 0 ? null : (
            <section
              aria-labelledby="pdp-addons-heading"
              className={STEP}
              data-fo-pdp-addons
            >
              <h2 className="sr-only" id="pdp-addons-heading">
                {product("addons.label")}
              </h2>
              <p aria-hidden="true" className={STEP_HEADING}>
                <StepNumber step={4} />
                {product("addons.label")}
              </p>
              <AddonPriceList addons={view.addons} locale={code} />
            </section>
          )}

          <div className={STEP}>
            <PriceSummary country={country} view={view} />
          </div>
        </div>
      </div>

      <div className="border-rule mt-[32px] grid gap-[40px] border-t py-[48px] lg:grid-cols-[7fr_5fr] lg:gap-[64px] lg:py-(--section-fluid)">
        {/* The artboard heads this "Good to know"; the heading waits for the founder's copy
            batch, and the sentence stands on its own (TASK-179 Result). */}
        <div>
          {excludes ? (
            <p
              className="bg-surface-raised rounded-field text-ui text-ink-muted m-0 px-[18px] py-[14px]"
              data-fo-price-excludes
            >
              {product("excludes")}
            </p>
          ) : null}
        </div>
        {view.trust.includes("substitution") ? (
          <section aria-labelledby="pdp-promise" data-fo-pdp-trust>
            <h2 className={H2S} id="pdp-promise">
              {product("trust.label")}
            </h2>
            <ul className="m-0 mt-[18px] grid list-none gap-[18px] p-0">
              <Promise
                body={product("trust.substitution.body")}
                title={product("trust.substitution.title")}
              />
              {/* The founder's fresh-flower promise with its terms (2026-10-04), where the view model
                  carries the claim. Never a number of days: "cant promise staying fresh". */}
              {freshness ? (
                <Promise
                  body={product("trust.freshness.body")}
                  title={product("trust.freshness.title")}
                />
              ) : null}
            </ul>
          </section>
        ) : null}
      </div>

      {view.related.length === 0 ? null : (
        <section
          aria-labelledby="pdp-related"
          className="pb-(--section-fluid)"
          data-fo-pdp-related
        >
          <div className="mb-[28px] flex flex-wrap items-end justify-between gap-x-[40px] gap-y-[16px] md:mb-[48px]">
            {/* The approved heading counts six in words, so it is printed only when the row holds
                six; a shorter row is headed by its label alone rather than by a wrong number. */}
            {view.related.length === RELATED_SHOWN ? (
              <div>
                <Eyebrow className="mb-[14px]">
                  {product("related.label", { country })}
                </Eyebrow>
                <h2 className={H2S} id="pdp-related">
                  {product("related.heading")}
                </h2>
              </div>
            ) : (
              <h2 className={H2S} id="pdp-related">
                {product("related.label", { country })}
              </h2>
            )}
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-[14px] gap-y-[32px] p-0 md:grid-cols-3 lg:grid-cols-6 lg:gap-x-[24px] lg:gap-y-[40px]">
            {view.related.map((card) => (
              <li key={card.productId}>
                <ProductCard card={card} headingLevel="h3" locale={code} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** One promise: a cornflower check, the claim in bold, its terms under it. */
function Promise({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}): ReactElement {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-[14px] gap-y-[4px]">
      <span className="text-mark row-span-2 mt-[2px]">
        <Icon name="shield-check" size={24} />
      </span>
      <h3 className="font-body m-0 text-[17px] font-bold">{title}</h3>
      <p className="text-ui text-ink-muted m-0">{body}</p>
    </li>
  );
}
