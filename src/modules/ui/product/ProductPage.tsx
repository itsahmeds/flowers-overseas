/**
 * `ProductPage` — the product detail page, v3: the approved two-column desktop and the phone
 * "sheet" (spec 004 §14 A23 clause 1, A24 clauses 1, 4, 5 and 10, AC-46's product half, AC-48 to
 * AC-50; spec 009 §14 A12, AC-30 to AC-33; `docs/design/wireframes/product-{desktop,mobile}.dc.html`
 * round 2; TASK-197, after TASK-127 and TASK-179).
 *
 * **One DOM order, the same at every width** (A12): the gallery, then the **buy section** holding
 * exactly the seven elements of A12 move 1 (the eyebrow, the `<h1>`, the price with its inclusive
 * text, the sizes, the dates as `pickerState()` renders them, the primary action and the
 * destination line), then the visible trail, then the sections below the action in A12's default
 * order (description with "Read more" and the exclusion sentence outside the clamp, the trust
 * block, the card message with its printed preview, the add-ons, "The price", spec 007's
 * delivery facts (A12 open item (b)), related products). No CSS `order` and no placement moves a
 * section out of its DOM place; the desktop's two columns below the action are auto-placed row by
 * row, so reading left to right, top to bottom is the DOM order.
 *
 * **The trail** (A24 clause 4 (e), AC-50). Below `md` it is displayed below the buy section and
 * before the sections, as the desktop trail at the phone's size, the product page's only visible
 * breadcrumb (no back link). From `md` up the same one element is placed on the grid's first row,
 * above the gallery, 20 px under the header (AC-32). It is in the server HTML once, at every
 * width, so a `BreadcrumbList` built from `view.breadcrumb` equals it item for item.
 *
 * **Desktop** (`lg`): a 12-column grid inside the frame. The gallery spans columns 1–7 (thumbnails
 * on 1, the photograph a full 4∶5 on 2–7, no height cap: A24 clause 5); column 8 is air; the buy
 * section is sticky on 9–12, under the 82 px sticky header plus the artboard's 24 px.
 *
 * **Phone** (below `md`): the photograph full-bleed at `min(470px, 100svh − 300px)`, then the buy
 * section as a paper sheet rising 28 px over its foot with 24 px top corners, the name and the
 * price side by side, the sizes as a segmented control and the dates as a scroller. **No grip
 * handle** (A24 clause 4 (d): a grip invites a drag that does nothing). The demo sentence (N2)
 * stays under the status, although the phone artboard drops it (A24 clause 1). The docked bar
 * (`StickyActionBar`, AC-48) repeats the selected size, its price (the same `formatMoney` of the
 * same `TierOption` the sheet prints) and an in-page link to the status; it appears only once the
 * buy section has scrolled out, by a CSS scroll-driven animation in `globals.css` (no island), and
 * a browser without scroll timelines never shows it, which loses nothing because it only repeats.
 *
 * **It renders from one `ProductView` and decides nothing a view model could.** Two blocks arrive
 * as slots (spec 008's breadcrumb, spec 007's delivery facts) because `catalog` and `geo` import
 * this module at runtime. **No purchase affordance** (§13 Q6, Q7): Phase 0's primary action is the
 * "Ordering is not open yet" status, never a disabled button.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { isPublished } from "@/config/site-links";
import type { ProductView } from "@/modules/catalog";
import { formatMoney, formatNumber, localePath } from "@/modules/i18n";

import { Icon } from "../icons/Icon.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import { StickyActionBar } from "../primitives/StickyActionBar.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";
import { ProductCard } from "../shop/ProductCard.tsx";

import { AddonPriceList } from "./AddonPriceList.tsx";
import { CardMessageField } from "./CardMessageField.tsx";
import { DeliveryDatePicker } from "./DeliveryDatePicker.tsx";
import { Gallery } from "./Gallery.tsx";
import { localeOf, messageFor } from "./labels.ts";
import { PriceSummary } from "./PriceSummary.tsx";
import { PrintedCardPreview } from "./PrintedCardPreview.tsx";
import { STEP_HEADING, StepLegend } from "./StepLegend.tsx";
import { TierSelector, tierLabel } from "./TierSelector.tsx";

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

/** The `h2` of every section below the action: the display face at `--text-md` (`.pv-sec h2`). */
const H2 = STEP_HEADING;

/** The related row's heading voice. */
const H2S = "display text-2xl-s md:text-2xl leading-[1.08] m-0";

/** The 12-column grid's gutter on the product artboard (`.g12`). */
const G12 = "lg:grid-cols-12 lg:gap-x-[clamp(24px,2.22vw,32px)]";

/** A section's place below the action on desktop: the wide column 1–7 or the narrow 9–12. */
const LEFT = "lg:col-[1/8]";
const RIGHT = "lg:col-[9/13]";

/** The id of the primary action in the flow, which the docked bar links to (AC-48's twin). */
export const BUY_ACTION_ID = "buy";

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
  // The one formatted amount of the selected tier: the sheet's price, the docked bar's price and
  // "The price" tier row are this string (price shown = price charged; A12, AC-48).
  const selectedPrice =
    selectedTier === undefined
      ? undefined
      : formatMoney(selectedTier.price, code);

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
  // the price, and only beside a photograph (TASK-126 E-5).
  const excludes = !view.product.vaseIncluded && view.gallery.kind === "photos";
  const freshness = view.trust.includes("freshnessGuarantee");

  return (
    <>
      <main
        className={PAGE_FRAME}
        id="main"
        data-fo-pdp={view.product.sku}
        data-fo-pdp-picker={view.delivery.state}
      >
        <div className={`grid md:grid-cols-1 ${G12}`} data-fo-pdp-first>
          <div
            className="max-md:-mx-(--gutter-s) md:row-start-2 md:mt-[24px] lg:col-[1/8] lg:grid lg:grid-cols-subgrid lg:self-start"
            data-fo-pdp-gallery
          >
            <Gallery
              gallery={view.gallery}
              locale={code}
              priority
              productName={view.product.name}
            />
          </div>

          {/* The buy section: exactly A12 move 1's seven elements, in that order. */}
          <section
            aria-labelledby="pdp-h1"
            className="bg-surface relative z-[2] grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-[12px] gap-y-[18px] max-md:-mx-(--gutter-s) max-md:-mt-[28px] max-md:rounded-t-[24px] max-md:px-(--gutter-s) max-md:pt-[22px] md:row-start-3 md:mt-[32px] md:grid-cols-1 md:gap-y-[18px] lg:sticky lg:top-[106px] lg:col-[9/13] lg:row-start-2 lg:mt-[24px] lg:self-start"
            data-fo-pdp-buy
          >
            <div className="grid content-start gap-[8px] md:contents">
              {/* The eyebrow: the desktop's "{descriptor} · for {country}" from `md`, the phone
                  sheet's shorter "{category} · {country}" (P2, founder copy pending) below it. One
                  element, two spans, so the buy section still holds one eyebrow. */}
              {descriptor === undefined ? null : (
                <Eyebrow className="m-0 md:-mb-[10px]">
                  <span className="max-md:hidden">
                    {product("eyebrow", { descriptor, country })}
                  </span>
                  <span className="md:hidden">
                    {product("eyebrowPhone", { category: descriptor, country })}
                  </span>
                </Eyebrow>
              )}
              <Display
                as="h1"
                className="max-md:text-[34px]! md:mb-0"
                id="pdp-h1"
                size="title"
              >
                <bdi>{view.h1.name}</bdi>
              </Display>
            </div>
            {/* The all-in price of the selected size and its inclusive text, and nothing else: no
                equivalents here (A12 move 2, AC-31). Price shown = price charged. */}
            {selectedPrice === undefined ? null : (
              <p
                className="m-0 grid content-start justify-items-end gap-0 text-end md:flex md:flex-wrap md:items-baseline md:gap-x-[12px] md:gap-y-[4px] md:text-start"
                data-fo-pdp-price
              >
                <strong className="display num text-[26px] leading-none font-normal md:text-[30px]">
                  <bdi>{selectedPrice}</bdi>
                </strong>
                <span className="text-included max-w-[11ch] text-xs font-bold md:max-w-none md:text-sm">
                  {catalog("price.inclusive")}
                </span>
              </p>
            )}

            <div className="col-span-full">
              <TierSelector
                locale={code}
                look="buy"
                selectedTierKey={view.selectedTierKey}
                tiers={view.tiers}
              />
            </div>

            <div className="col-span-full">
              <DeliveryDatePicker
                country={country}
                delivery={view.delivery}
                locale={code}
                look="buy"
                {...(view.selectedDate === undefined
                  ? {}
                  : { selectedDate: view.selectedDate })}
                {...(view.country.corridorPath === undefined
                  ? {}
                  : { corridorPath: view.country.corridorPath })}
              />
            </div>

            {/* The primary action. Phase 0: the round-2 status pill, never a button, with the demo
                sentence (N2) under it at every width (A24 clause 1). */}
            <div
              className="col-span-full grid gap-[10px]"
              data-fo-pdp-action
              id={BUY_ACTION_ID}
            >
              <p
                className="bg-surface-muted text-ink-muted m-0 grid min-h-[56px] place-items-center rounded-full px-[20px] text-center font-bold shadow-[inset_0_0_0_1px_var(--color-rule)]"
                data-fo-pdp-status
                role="status"
              >
                {product("demo.heading")}
              </p>
              {live ? null : (
                <p
                  className="text-ink-muted text-ui m-0 leading-[1.4]"
                  data-fo-pdp-demo
                >
                  {product("demo.body")}
                </p>
              )}
            </div>

            <p
              className="text-ink-muted border-rule col-span-full m-0 border-t pt-[16px] text-sm"
              data-fo-destination-line
            >
              {product("destination.label")}{" "}
              <b className="text-ink">{country}</b>
              {destinations === undefined ? null : (
                <>
                  {" · "}
                  <a
                    className="text-link hover:text-link-strong inline-flex min-h-[24px] items-center font-bold underline underline-offset-4"
                    href={destinations}
                  >
                    {product("destination.change")}
                  </a>
                </>
              )}
            </p>
          </section>

          {/* The trail: below the buy section on the phone, on the first row from `md`. */}
          <div
            className="pt-[8px] md:col-span-full md:row-start-1 md:pt-0"
            data-fo-pdp-trail
          >
            {breadcrumb}
          </div>
        </div>

        <div
          className={`grid gap-y-[40px] py-[48px] lg:gap-y-[56px] lg:py-(--section-fluid) ${G12}`}
          data-fo-pdp-more
        >
          {view.description === undefined ? (
            <div className={LEFT} />
          ) : (
            <section
              className={`${LEFT} grid content-start gap-[14px]`}
              data-fo-pdp-about
            >
              {/* Three lines and "Read more" (A12 move 3, AC-32): the whole text is in the server
                  HTML once; the clamp is CSS, and the native disclosure lifts it with JavaScript
                  off, by `:has()`. The exclusion sentence sits outside the clamp. */}
              <div className="grid justify-items-start gap-[4px] has-[details[open]]:[&>p]:line-clamp-none">
                <p
                  className="text-ink-muted text-body-s md:text-body m-0 line-clamp-3 max-w-[64ch]"
                  data-fo-description
                >
                  {view.description.text}
                </p>
                <details data-fo-read-more>
                  <summary className="text-link hover:text-link-strong inline-flex min-h-(--target-min) cursor-pointer list-none items-center font-bold [&::-webkit-details-marker]:hidden">
                    {product("readMore")}
                  </summary>
                </details>
              </div>
              {excludes ? (
                <p
                  className="bg-surface-raised rounded-field text-ui text-ink-muted m-0 px-[18px] py-[14px]"
                  data-fo-price-excludes
                >
                  {product("excludes")}
                </p>
              ) : null}
            </section>
          )}

          {view.trust.includes("substitution") ? (
            <section
              aria-labelledby="pdp-promise"
              className={RIGHT}
              data-fo-pdp-trust
            >
              <h2 className={H2} id="pdp-promise">
                {product("trust.label")}
              </h2>
              <ul className="m-0 grid list-none gap-[18px] p-0">
                <Promise
                  body={product("trust.substitution.body")}
                  title={product("trust.substitution.title")}
                />
                {/* The founder's fresh-flower promise with its terms (2026-10-04), never a number
                    of days. */}
                {freshness ? (
                  <Promise
                    body={product("trust.freshness.body")}
                    title={product("trust.freshness.title")}
                  />
                ) : null}
              </ul>
            </section>
          ) : (
            <div className={RIGHT} />
          )}

          <fieldset
            className={`${LEFT} m-0 min-w-0 border-0 p-0`}
            data-fo-pdp-card
          >
            <StepLegend id="pdp-card-legend">
              {product("card.legend")}
            </StepLegend>
            <div className="grid items-start gap-[16px] md:grid-cols-[minmax(0,1fr)_200px] md:gap-[24px]">
              <CardMessageField
                labelledBy="pdp-card-legend"
                className="bg-card text-ink text-body rounded-letter block min-h-[190px] w-full resize-y border-0 bg-[0_17px] bg-(image:--card-lines) px-[22px] py-[18px] leading-[38px] shadow-[inset_0_0_0_1.5px_var(--color-field-edge),0_14px_30px_-18px_var(--color-shade)]"
                id="pdp-card-message"
                limit={formatNumber(CARD_MESSAGE_MAX, code)}
                maxLength={CARD_MESSAGE_MAX}
              />
              <div className="max-w-[440px]">
                <PrintedCardPreview
                  printed={product("card.printed")}
                  sample={catalog("addon.card.description")}
                />
              </div>
            </div>
          </fieldset>

          {view.addons.length === 0 ? (
            <div className={RIGHT} />
          ) : (
            <section
              aria-labelledby="pdp-addons-heading"
              className={RIGHT}
              data-fo-pdp-addons
            >
              <h2 className={H2} id="pdp-addons-heading">
                {product("addons.label")}
              </h2>
              <AddonPriceList addons={view.addons} locale={code} />
            </section>
          )}

          <div className={`${LEFT} max-w-[440px]`} data-fo-pdp-the-price>
            <PriceSummary view={view} />
          </div>

          <section
            aria-labelledby="pdp-facts-heading"
            className={RIGHT}
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
        </div>

        {view.related.length === 0 ? null : (
          <section
            aria-labelledby="pdp-related"
            className="pb-(--section-fluid)"
            data-fo-pdp-related
          >
            <div className="mb-[28px] flex flex-wrap items-end justify-between gap-x-[40px] gap-y-[16px] md:mb-[48px]">
              {/* The approved heading counts six in words, so it is printed only when the row
                  holds six; a shorter row is headed by its label alone. */}
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
      {/* The phone's docked bar (AC-48): the selected size and its price, the same string the
          sheet prints, and an in-page link to the status in the flow. Shown only after the buy
          section has scrolled out (`[data-fo-pdp-bar]` in `globals.css`). */}
      <StickyActionBar
        action={{ href: `#${BUY_ACTION_ID}`, label: product("demo.heading") }}
        className="pdp-bar [&_a]:bg-surface-muted [&_a]:text-ink-muted [&_a:hover]:bg-surface-muted [&_a]:text-sm [&_a]:shadow-[inset_0_0_0_1px_var(--color-rule)]"
        price={
          selectedTier === undefined || selectedPrice === undefined
            ? undefined
            : { amount: selectedPrice, caption: tierLabel(t, selectedTier) }
        }
      />
    </>
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
