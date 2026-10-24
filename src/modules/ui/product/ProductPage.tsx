/**
 * `ProductPage` — the product detail page, v3: the approved two-column desktop and the phone
 * "sheet" (spec 004 §14 A23 clause 1, A24 clauses 1, 4, 5 and 10, AC-46's product half, AC-48 to
 * AC-50; spec 009 §14 A12, AC-30 to AC-33; `docs/design/wireframes/product-{desktop,mobile}.dc.html`
 * round 2; TASK-197, after TASK-127 and TASK-179).
 *
 * **One DOM order, the same at every width** (A12): the visible trail, the gallery, then the **buy
 * section** holding exactly the seven elements of A12 move 1 (the eyebrow, the `<h1>`, the price
 * with its inclusive text, the sizes, the dates as `pickerState()` renders them, the primary action
 * and the destination line), then the sections below the action in A12's default
 * order (description with "Read more" and the exclusion sentence outside the clamp, the trust
 * block, the card message with its printed preview, the add-ons, "The price", related products).
 * There is **no delivery-facts block** (spec 009 §14 A-founder-2026-10-14d, AC-35): the picker says
 * what is true about delivery, and nothing else does. No CSS `order` and no placement moves a
 * section out of its DOM place; the desktop's two columns below the action are auto-placed row by
 * row, so reading left to right, top to bottom is the DOM order.
 *
 * **The trail** (A24 clause 4 (e), AC-50; TASK-249). It comes **first in the DOM**, so from `md` up,
 * where it sits on the grid's first row above the gallery, 20 px under the header (AC-32), it is
 * also the first stop in `<main>` by keyboard and the visual order is the tab order (WCAG 2.4.3,
 * QA N-07: it used to come after the gallery, the sizes and the dates). Below `md` the same one
 * element is placed on the grid's third row, under the buy section and before the sections, as the
 * desktop trail at the phone's size, the product page's only visible breadcrumb (no back link);
 * `reading-flow: grid-rows` there makes the focus order follow the rows (gallery, buy section,
 * trail) where the browser supports it, and the DOM order (trail first) is the fallback. It is in
 * the server HTML once, at every width, so a `BreadcrumbList` built from `view.breadcrumb` equals
 * it item for item.
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
 * same `TierOption` the sheet prints) and an in-page link to the status. It is on the first screen
 * from load, where `product-mobile.dc.html` draws the dock (spec 004 §14 A-founder-2026-10-14h),
 * so the primary action is in view before any scroll.
 *
 * **Every figure of the size follows the buyer** (spec 009 §14 A12, AC-31; spec 004 AC-48;
 * TASK-228). The buy price, "The price" tier row and equivalents line, the total and the bar's
 * size and price are `data-fo-tier-slot`s; each size's radio carries the server's string for each
 * slot (`TierSelector`'s `say`), and the page's one island copies the chosen size's strings in. The
 * server HTML holds one amount per place, the selected tier's, and no money is computed in the
 * browser.
 *
 * **It renders from one `ProductView` and decides nothing a view model could.** One block arrives
 * as a slot (spec 008's breadcrumb) because `catalog` imports this module at runtime. **No purchase affordance** (§13 Q6, Q7): Phase 0's primary action is the
 * "Ordering is not open yet" status, never a disabled button.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { CARD_MESSAGE_MAX } from "@/config/card-message";
import { isPublished } from "@/config/site-links";
import type { ProductView } from "@/modules/catalog";
import { formatMoney, formatNumber, localePath } from "@/modules/i18n";

import { Icon } from "../icons/Icon.tsx";
import { PAGE_FRAME } from "../primitives/layout.tsx";
import { StickyActionBar } from "../primitives/StickyActionBar.tsx";
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
import { STEP_HEADING, StepLegend } from "./StepLegend.tsx";
import { TierSelector, tierLabel } from "./TierSelector.tsx";

export interface ProductPageProps {
  readonly view: ProductView;
  /** Spec 008's breadcrumb over `view.breadcrumb`, mounted by the route. */
  readonly breadcrumb: ReactNode;
  /**
   * The guarantee page's path where it exists in this locale (spec 009 §14 A11 bullet 1, spec 041
   * §6; TASK-287), or absent. The route asks `infoPageExists("guarantee", locale)` and hands it
   * in, because this module may not read `src/modules/content` (`plan/01` §5). Present: the
   * fresh-flower promise's title links to it. Absent: the title is plain text, as before.
   */
  readonly guaranteeHref?: string | undefined;
  /**
   * The checkout entry the route decided with `checkoutEntryFor()` (spec 010 §5.3, the spec 009
   * amendment; AC-5; TASK-206): `demo` draws "Try a demo order", `continue` the live label with
   * the total, both beside "Add to basket"; `none` (or absent) keeps the status pill. Both are
   * submits of the buy section's form posting to `action`, so no JavaScript, no new island, no
   * link and nothing that varies by visitor.
   */
  readonly checkout?: {
    readonly entry: "none" | "demo" | "continue";
    readonly action: string;
  };
}

/** The related row's full length, which the approved heading names in words ("Six more"). */
const RELATED_SHOWN = 6;

/** The `h2` of every section below the action: the display face at `--text-md` (`.pv-sec h2`). */
const H2 = STEP_HEADING;

/** The related row's heading voice. */
const H2S = "display text-2xl-s md:text-2xl leading-[1.08] m-0";

/** The 12-column grid's gutter on the product artboard (`.g12`). */
const G12 = "lg:grid-cols-12 lg:gap-x-[clamp(24px,2.22vw,32px)]";

/** A section's place below the action on desktop: the wide column 1–7 or the narrow 9–12. */
const LEFT = "lg:col-[1/8]";
const RIGHT = "lg:col-[9/13]";

/** The checkout entry's two submits (spec 010 AC-5): 56 px tall, full width, the pill's shape. */
const ENTRY_BUTTON =
  "inline-grid min-h-[56px] w-full cursor-pointer place-items-center rounded-full px-[20px] text-center font-bold";
const ENTRY_GHOST =
  "bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] hover:bg-surface-muted";
const ENTRY_PRIMARY = "bg-accent text-on-accent hover:bg-accent-strong";

/** The id of the primary action in the flow, which the docked bar links to (AC-48's twin). */
export const BUY_ACTION_ID = "buy";

/** The buy section's form, which the docked bar's twins of the checkout entry submit (AC-5). */
export const BUY_FORM_ID = "buy-form";

export function ProductPage({
  view,
  breadcrumb,
  guaranteeHref,
  checkout,
}: ProductPageProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const catalog = useTranslations("catalog");
  const code = localeOf(view.locale);
  const country = messageFor(t, view.country.nameKey);
  const entryOpen = checkout !== undefined && checkout.entry !== "none";
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
  // The checkout entry's first submit, in the flow and in the docked bar alike: "Continue" and the
  // selected size's total live, "Try a demo order" in preview. The founder-approved
  // `finder.submit` until a reviewed "Continue, {total}" key exists: a new unreviewed key here
  // would push the counted share past 5 %.
  const entryLabel =
    checkout?.entry === "continue" ? (
      <>
        {t("finder.submit")}
        {selectedPrice === undefined ? null : (
          <bdi className="num ms-[8px]">{selectedPrice}</bdi>
        )}
      </>
    ) : (
      product("entry.demo")
    );
  // What each size's radio carries for the island (AC-31): the total of that size on the selected
  // date (the totals table's entry, or the size's own price when no date is chosen) and its own
  // equivalents line. Strings formatted here, from the view model's amounts; never summed.
  const say = new Map(
    view.tiers.map((tier) => {
      const total =
        view.selectedDate === undefined
          ? tier.price.amountMinor
          : view.totals[tier.tierKey]?.[view.selectedDate];
      const line = view.equivalents.tiers?.[tier.tierKey];
      return [
        tier.tierKey,
        {
          ...(total === undefined
            ? {}
            : {
                total: formatMoney(
                  { amountMinor: total, currency: tier.price.currency },
                  code,
                ),
              }),
          ...(line === undefined
            ? {}
            : {
                equivalents: catalog(
                  "price.equivalents",
                  equivalentsMessageValues(line, code),
                ),
              }),
        },
      ] as const;
    }),
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
        <div
          className={`grid max-md:[reading-flow:grid-rows] md:grid-cols-1 ${G12}`}
          data-fo-pdp-first
        >
          {/* The trail first in the DOM, so it is the first stop in `<main>` (TASK-249, N-07): on
              the first row from `md`, and placed on the third row below it, under the buy section
              (AC-50), where the gallery and the buy section fill rows 1 and 2 by auto-placement. */}
          <div
            className="max-md:row-start-3 max-md:pt-[8px] md:col-span-full md:row-start-1"
            data-fo-pdp-trail
          >
            {breadcrumb}
          </div>
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
                  <bdi data-fo-tier-slot="price">{selectedPrice}</bdi>
                </strong>
                <span className="text-included max-w-[11ch] text-xs font-bold md:max-w-none md:text-sm">
                  {catalog("price.inclusive")}
                </span>
              </p>
            )}

            {/* The buy section's form (spec 010 AC-5): the size and date radios, the selection's
                keys and what the page displayed for each size, so the start route can open step 1
                with the price-changed notice when its total differs (AC-6). `display: contents`
                keeps the grid's rows. A plain submit (Enter) reloads this page, which reads no
                parameter. */}
            <form
              className="contents"
              data-fo-pdp-form=""
              id={BUY_FORM_ID}
              method="get"
            >
              {entryOpen ? (
                <>
                  <input name="locale" type="hidden" value={view.locale} />
                  <input
                    name="countryIso"
                    type="hidden"
                    value={view.country.iso2}
                  />
                  <input name="sku" type="hidden" value={view.product.sku} />
                  <input
                    name="expectedCurrency"
                    type="hidden"
                    value={view.price.displayPrice.currency}
                  />
                  {view.tiers.map((tier) => (
                    <input
                      key={tier.tierKey}
                      name={`expect-${tier.tierKey}`}
                      type="hidden"
                      value={String(tier.price.amountMinor)}
                    />
                  ))}
                </>
              ) : null}
              <div className="col-span-full">
                <TierSelector
                  locale={code}
                  look="buy"
                  say={say}
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
                {entryOpen ? (
                  <div
                    className={`grid gap-[10px] ${checkout?.entry === "demo" ? "sm:grid-cols-2" : ""}`}
                    data-fo-pdp-entry={checkout?.entry}
                  >
                    <button
                      className={`${ENTRY_BUTTON} ${checkout?.entry === "continue" ? ENTRY_PRIMARY : ENTRY_GHOST}`}
                      formAction={checkout?.action}
                      formMethod="post"
                      name="then"
                      type="submit"
                      value="checkout"
                    >
                      {entryLabel}
                    </button>
                    <button
                      className={`${ENTRY_BUTTON} ${ENTRY_GHOST}`}
                      formAction={checkout?.action}
                      formMethod="post"
                      name="then"
                      type="submit"
                      value="basket"
                    >
                      {product("entry.addToBasket")}
                    </button>
                  </div>
                ) : (
                  <p
                    className="bg-surface-muted text-ink-muted m-0 grid min-h-[56px] place-items-center rounded-full px-[20px] text-center font-bold shadow-[inset_0_0_0_1px_var(--color-rule)]"
                    data-fo-pdp-status
                    role="status"
                  >
                    {product("demo.heading")}
                  </p>
                )}
                {live ? null : (
                  <p
                    className="text-ink-muted text-ui m-0 leading-[1.4]"
                    data-fo-pdp-demo
                  >
                    {product("demo.body")}
                  </p>
                )}
              </div>
            </form>

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
                    href={guaranteeHref}
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
            {/* The artboards' `.pv-card` as spec 042's band redraws it (motion 15; TASK-308): the
                field with its counter under it, end-aligned, beside an upright card 200 px wide
                from `md` that grows with the message. On the phone the card sits above the field,
                so the keyboard never hides it, and where the browser sizes a field to its content the
                field is one line (38 px) taller than its words and grows with them (elsewhere it
                keeps its five rows). The printed label is the card's caption. */}
            <div
              className="grid items-start gap-[12px] md:grid-cols-[minmax(0,1fr)_200px] md:gap-[24px]"
              data-fo-pdp-card-row
            >
              <div className="min-w-0" data-fo-pdp-card-field>
                <CardMessageField
                  labelledBy="pdp-card-legend"
                  className="bg-card text-ink text-body rounded-letter block w-full resize-y border-0 bg-[0_17px] bg-(image:--card-lines) px-[22px] py-[18px] leading-[38px] wrap-anywhere shadow-[inset_0_0_0_1.5px_var(--color-field-edge),0_14px_30px_-18px_var(--color-shade)] max-md:[field-sizing:content] max-md:supports-[field-sizing:content]:pb-[56px] md:min-h-[190px]"
                  counterClassName="text-ink-subtle num m-0 mt-[6px] text-end text-xs"
                  id="pdp-card-message"
                  limit={formatNumber(CARD_MESSAGE_MAX, code)}
                  max={CARD_MESSAGE_MAX}
                />
              </div>
              <PrintedCardPreview
                caption={product("card.printed")}
                className="max-md:order-first"
                messageFieldId="pdp-card-message"
                sample={catalog("addon.card.description")}
              />
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
                  <ProductCard
                    card={card}
                    headingLevel="h3"
                    locale={code}
                    qualifierBelow
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      {/* The phone's docked bar (AC-48): the selected size and its price, the same strings the
          sheet prints and the same slots the island fills, and an in-page link to the status in
          the flow. On the first screen from load (spec 004 §14 A-founder-2026-10-14h). With the
          checkout entry open it holds the entry's two submits instead, "Add to basket" first
          and narrower, as `product-mobile.dc.html` draws it (spec 010 AC-5). */}
      <StickyActionBar
        action={{ href: `#${BUY_ACTION_ID}`, label: product("demo.heading") }}
        submits={
          entryOpen && checkout !== undefined
            ? [
                {
                  form: BUY_FORM_ID,
                  formAction: checkout.action,
                  name: "then",
                  value: "basket",
                  label: product("entry.addToBasket"),
                  look: "ghost",
                  narrow: true,
                },
                {
                  form: BUY_FORM_ID,
                  formAction: checkout.action,
                  name: "then",
                  value: "checkout",
                  label: entryLabel,
                  look: checkout.entry === "continue" ? "accent" : "ghost",
                },
              ]
            : undefined
        }
        className="[&_a]:bg-surface-muted [&_a]:text-ink-muted [&_a:hover]:bg-surface-muted [&_a]:text-sm [&_a]:shadow-[inset_0_0_0_1px_var(--color-rule)]"
        price={
          selectedTier === undefined || selectedPrice === undefined
            ? undefined
            : {
                amount: <bdi data-fo-tier-slot="price">{selectedPrice}</bdi>,
                caption: (
                  <span data-fo-tier-slot="label">
                    {tierLabel(t, selectedTier)}
                  </span>
                ),
              }
        }
      />
    </>
  );
}

/**
 * One promise: a cornflower check, the claim in bold, its terms under it. With `href` the claim is
 * a link to the page that states it in full (the guarantee page, TASK-287); the words stay the same.
 */
function Promise({
  title,
  body,
  href,
}: {
  readonly title: string;
  readonly body: string;
  readonly href?: string | undefined;
}): ReactElement {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-[14px] gap-y-[4px]">
      <span className="text-mark row-span-2 mt-[2px]">
        <Icon name="shield-check" size={24} />
      </span>
      <h3 className="font-body m-0 text-[17px] font-bold">
        {href === undefined ? (
          title
        ) : (
          <a
            className="text-link hover:text-link-strong inline-flex min-h-[24px] items-center underline underline-offset-4"
            data-fo-pdp-guarantee-link
            href={href}
          >
            {title}
          </a>
        )}
      </h3>
      <p className="text-ui text-ink-muted m-0">{body}</p>
    </li>
  );
}
