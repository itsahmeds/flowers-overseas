/**
 * `ProductPage` — the product detail page, assembled in the artboards' block order (spec 009 §2
 * "Page anatomy", §5.3, AC-1, AC-8, AC-10, AC-21, AC-22, AC-25; `docs/design/wireframes/
 * product-{desktop,mobile}.dc.html`; TASK-127).
 *
 * **Block order** — breadcrumb → destination line → gallery → `<h1>` → description → tier selector
 * → date picker → delivery facts → add-on list → price summary → trust → related products. That
 * is the DOM order and the mobile order; at `lg` the gallery moves into a left column with CSS
 * grid placement only, so a screen reader and a crawler read the sequence above at every width.
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
import { localePath } from "@/modules/i18n";

import { Container, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";
import { ProductCard } from "../shop/ProductCard.tsx";

import { AddonPriceList } from "./AddonPriceList.tsx";
import { DeliveryDatePicker } from "./DeliveryDatePicker.tsx";
import { Gallery } from "./Gallery.tsx";
import { localeOf, messageFor } from "./labels.ts";
import { PriceSummary } from "./PriceSummary.tsx";
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

/** Everything in the right-hand column at `lg`; the gallery owns the left. */
const COLUMN = "lg:col-start-2";

export function ProductPage({
  view,
  breadcrumb,
  facts,
}: ProductPageProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const corridor = useTranslations("corridor");
  const code = localeOf(view.locale);
  const country = messageFor(t, view.country.nameKey);
  const live = view.delivery.state === "live";

  const descriptor =
    view.h1.formKey === undefined
      ? undefined
      : messageFor(t, view.h1.key, {
          name: view.h1.name,
          descriptor: messageFor(t, view.h1.formKey, {
            flower: messageFor(t, view.h1.flowerKey),
          }),
        });
  const destinations = isPublished("destinations")
    ? localePath(view.locale, "destinations")
    : undefined;

  return (
    <Container
      as="main"
      id="main"
      data-fo-pdp={view.product.sku}
      data-fo-pdp-picker={view.delivery.state}
    >
      <Stack gap="xl" className="py-xl">
        <Stack gap="md">
          {breadcrumb}
          <div
            className="border-border gap-md py-sm flex flex-wrap items-center justify-between border-y"
            data-fo-destination-line
          >
            <p className="text-md m-0">
              {product("destination.label")} <b>{country}</b>
              {destinations === undefined ? null : (
                <>
                  {" · "}
                  <a
                    className="text-accent underline underline-offset-[3px]"
                    href={destinations}
                  >
                    {product("destination.change")}
                  </a>
                </>
              )}
            </p>
          </div>
        </Stack>

        <div className="gap-xl grid items-start lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div className="lg:col-start-1 lg:row-span-6 lg:row-start-1">
            <Gallery
              gallery={view.gallery}
              locale={code}
              priority
              productName={view.product.name}
            />
          </div>

          <Stack gap="sm" className={COLUMN}>
            <Display as="h1" size="2xl">
              <bdi>{view.h1.name}</bdi>
            </Display>
            {descriptor === undefined ? null : (
              <Text size="sm" tone="subtle">
                {descriptor}
              </Text>
            )}
            {view.description === undefined ? null : (
              <Text measure size="sm" tone="muted" data-fo-description>
                {view.description.text}
              </Text>
            )}
          </Stack>

          <div className={COLUMN}>
            <TierSelector
              locale={code}
              selectedTierKey={view.selectedTierKey}
              tiers={view.tiers}
            />
          </div>

          <div className={COLUMN}>
            <DeliveryDatePicker
              country={country}
              delivery={view.delivery}
              locale={code}
              {...(view.selectedDate === undefined
                ? {}
                : { selectedDate: view.selectedDate })}
              {...(view.country.corridorPath === undefined
                ? {}
                : { corridorPath: view.country.corridorPath })}
            />
          </div>

          <Stack as="section" gap="sm" className={COLUMN} data-fo-pdp-facts>
            <Label>{corridor("facts.eyebrow")}</Label>
            <Text size="sm" className="font-semibold">
              {live
                ? corridor("facts.headingLive")
                : corridor("facts.headingGuide")}
            </Text>
            {facts}
          </Stack>

          {view.addons.length === 0 ? null : (
            <Stack as="section" gap="sm" className={COLUMN} data-fo-pdp-addons>
              <Label>{product("addons.label")}</Label>
              <AddonPriceList addons={view.addons} locale={code} />
            </Stack>
          )}

          <div className={COLUMN}>
            <PriceSummary country={country} view={view} />
          </div>

          {view.trust.includes("substitution") ? (
            <Stack as="section" gap="sm" className={COLUMN} data-fo-pdp-trust>
              <Label>{product("trust.label")}</Label>
              <div className="border-border pt-sm flex flex-col gap-[2px] border-t">
                <Text size="sm" className="font-semibold">
                  {product("trust.substitution.title")}
                </Text>
                <Text size="sm" tone="muted">
                  {product("trust.substitution.body")}
                </Text>
              </div>
            </Stack>
          ) : null}
        </div>

        {view.related.length === 0 ? null : (
          <Stack as="section" gap="md" data-fo-pdp-related>
            {/* The approved heading counts six in words, so it is printed only when the row holds
                six; a shorter row is headed by its label alone rather than by a wrong number. */}
            {view.related.length === RELATED_SHOWN ? (
              <Stack gap="xs">
                <Label>{product("related.label", { country })}</Label>
                <Display as="h2" size="xl">
                  {product("related.heading")}
                </Display>
              </Stack>
            ) : (
              <Display as="h2" size="xl">
                {product("related.label", { country })}
              </Display>
            )}
            <ul className="gap-md m-0 grid list-none grid-cols-2 p-0 md:grid-cols-3 lg:grid-cols-6">
              {view.related.map((card) => (
                <li key={card.productId}>
                  <ProductCard card={card} headingLevel="h3" locale={code} />
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
