/**
 * `ProductCard` — the one card every country-scoped listing renders (spec 008 §2 "The product card
 * contract", §5.2, §5.3, **AC-6**, §13 Q8, T-06; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing and card blocks", rows 1–4).
 *
 * **What it renders, and it is the whole list** (AC-6): the photograph or spec 006's captioned
 * placeholder in a fixed 4∶5 box, the product name as the card's heading, **one** all-in price
 * through `formatMoney` with "all in" (`catalog.price.allIn`; the legal VAT-and-delivery formula
 * in `de` and `pl`) beside it — the page lede carries the full words — and the honesty
 * label wherever the asset it displayed is `ai`.
 *
 * **What it cannot render**, and the mechanism rather than the promise: `ProductCardViewSchema`
 * has no field for a rating, a star, a review count, a badge, a delivery-timing claim, a
 * strike-through, an old price, a countdown or an add-to-basket, so there is nothing here to
 * render one *from* (§8, §5.2). The component takes one `ProductCardView` and no loose props.
 *
 * **Tile or link, one geometry** (§13 Q8, AC-12). Until spec 009 publishes the `product` link id
 * the view model carries no `href`, and the card renders as an `<article>` with no `<a>` inside
 * it — never a link to a URL that 404s (spec 004 AC-14, 007 AC-17). When the id is published the
 * same children are wrapped in one `<a>`: same elements, same order, same box, so the flip is a
 * data change that costs zero layout shift and no template edit.
 *
 * **Price**: a `Money` in, `formatMoney` out. No component here receives a number, computes a
 * total or touches `Intl` (`fo/no-adhoc-intl`, `fo/no-float-money`; §5.2). The name and the price
 * are wrapped in `<bdi>` so a Latin product name inside an RTL run — `/ar-XB`, and Arabic when it
 * ships — cannot reorder the digits of the price beside it (T-30).
 *
 * **Approximate equivalents** (spec 004 §14 A21 clause 6; TASK-178): when the view model carries
 * `equivalents`, the price primitive's slot prints "about … at the rate of …" under the amount —
 * the other currencies of {EUR, GBP, PLN, USD}, never the charged one. Absent (a stale rate, the
 * destination-currency fallback), nothing is printed. The line is never in JSON-LD: the `ItemList`
 * builder reads `price` only.
 *
 * **Or no price at all** (spec 008 §14 **A3**, **AC-7**; TASK-112). A destination-less hub shows
 * the same card with the money removed: it takes a `HubCardView`, which is this schema without
 * `price` and `priceLabelKey`, and prints the one line that says why there is none instead of an
 * amount. There is no second card component — the geometry, the heading level, the photo box and
 * the provenance note are the same objects on both hubs and every country-scoped listing, which is
 * what keeps a card lifted from one surface to another from changing its claims. Which branch is
 * taken is decided by the **shape**, through `hasCardPrice()`: a country-scoped card cannot reach
 * the priceless branch, because its schema has no way to be missing a price.
 *
 * Server Component. No state, no client bytes (§5.4). Its hover motion (motion 6: a 2 px lift and a
 * 3 % photo zoom, transform only) is CSS on `data-fo-card-motion`, and the priority card has none.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { type LocaleCode } from "@/config/locales";
import { formatMoney } from "@/modules/i18n";

import { MediaAsset } from "../media/MediaAsset.tsx";
import type { MediaManifest } from "../media/manifest.ts";
import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import { Photo } from "../primitives/Photo.tsx";
import { Price } from "../primitives/Price.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Display, Text } from "../primitives/typography.tsx";

import { equivalentsMessageValues } from "./equivalents.ts";
import { type ListingCardView, hasCardPrice } from "./viewModel.ts";

export interface ProductCardProps {
  readonly card: ListingCardView;
  readonly locale: LocaleCode;
  /**
   * The page's single LCP candidate — the first photograph of the first card, and nowhere else
   * (§5.4, spec 006 AC-19). The grid decides; the card obeys.
   */
  readonly priority?: boolean;
  /** `h2` inside a listing; `h3` where the gallery nests the grid under its own heading. */
  readonly headingLevel?: "h2" | "h3";
  /**
   * The manifest the page resolved against, where it is not the committed one
   * (`/dev/components`). It changes which assets display, never whether a generated one is
   * labelled.
   */
  readonly manifest?: MediaManifest;
  /**
   * Where the "Example arrangement" label shows (spec 008 §14 **A16 (a)**). `card` (the default):
   * under every card at every width, as A2 rules. `md`: under the card from `md` up only; below
   * `md` it stays in the HTML, hidden by CSS, because the grid then prints it once, above itself.
   */
  readonly provenance?: "card" | "md";
  /**
   * The country occasion's lead (spec 008 §14 **A16 (b)**; spec 004 §14 A24 clause 2 (b)): from
   * `md` up the name, the price and the label sit on a white card over the foot of the photograph,
   * as the artboard's lead figure draws them; below `md` the card is an ordinary grid card. One
   * element at every width; only its CSS differs.
   */
  readonly lead?: boolean;
  /**
   * Where `priority` holds (spec 004 §14 A24 clause 5): `below-md` on a hub, whose lead figure is
   * the priority image from `md` up. The card then carries its photograph twice in one box slot,
   * each displayed at one width: the priority copy below `md` (preloaded with `media`, and never
   * downloaded from `md` up) and a lazy copy from `md` up. One card, one link, one heading.
   */
  readonly priorityAt?: "below-md";
}

/** The 4∶5 box, in every state. Named once so the four states cannot drift apart. */
const CARD_RATIO = "card" as const;

export function ProductCard({
  card,
  locale,
  priority = false,
  headingLevel = "h2",
  manifest,
  provenance = "card",
  lead = false,
  priorityAt,
}: ProductCardProps): ReactElement {
  const catalog = useTranslations("catalog");
  const media = useTranslations("media");
  const shop = useTranslations("shop");

  const photo =
    card.photo.kind === "asset" && priority && priorityAt === "below-md" ? (
      <>
        <MediaAsset
          assetId={card.photo.assetId}
          className="md:hidden"
          displayedAt="below-md"
          locale={locale}
          priority
          productName={card.name}
          ratio={CARD_RATIO}
          slot={card.photo.slot}
          {...(manifest === undefined ? {} : { manifest })}
        />
        <MediaAsset
          assetId={card.photo.assetId}
          className="max-md:hidden"
          displayedAt="md-up"
          locale={locale}
          productName={card.name}
          ratio={CARD_RATIO}
          slot={card.photo.slot}
          {...(manifest === undefined ? {} : { manifest })}
        />
      </>
    ) : card.photo.kind === "asset" ? (
      <MediaAsset
        assetId={card.photo.assetId}
        locale={locale}
        priority={priority}
        productName={card.name}
        ratio={CARD_RATIO}
        slot={card.photo.slot}
        {...(manifest === undefined ? {} : { manifest })}
      />
    ) : (
      // No asset at all for this product: the captioned box, and **no `<img>`** — the same box the
      // asset path degrades to, so the two placeholder routes are one rendered result
      // (spec 006 §5.3, `plan/10` §3).
      <Photo
        caption={media("placeholder.product")}
        ratio={CARD_RATIO}
        dataset={{
          "data-fo-media-slot": card.photo.slot,
          "data-fo-media-placeholder": "no-asset",
        }}
      />
    );

  const provenanceNote =
    card.photo.kind === "asset" ? (
      <MediaProvenanceNote
        assetIds={[card.photo.assetId]}
        locale={locale}
        {...(manifest === undefined ? {} : { manifest })}
      />
    ) : null;
  // Below `md` on a page that prints the label once per grid, this one stays in the HTML and is
  // hidden by CSS (spec 008 §14 A16 (a)); the default keeps the shipped markup exactly.
  const note =
    provenanceNote === null || provenance === "card" ? (
      provenanceNote
    ) : (
      <div className="max-md:hidden" data-fo-card-provenance="md">
        {provenanceNote}
      </div>
    );

  const caption: ReactNode = (
    <>
      {/* The card name: Fraunces at the `h3` step (21/18), 14 px under the photograph (10 on a
          phone), and a real heading, because §5.3 requires the card's name to *be* its heading
          and the price to be adjacent text. Underlined on the card link's hover. */}
      <Display
        as={headingLevel}
        size="lg"
        className="mt-[10px] decoration-1 underline-offset-[5px] group-hover:underline md:mt-[14px]"
      >
        <bdi>{card.name}</bdi>
      </Display>
      {hasCardPrice(card) ? (
        <Price
          className="mt-[6px]"
          amount={formatMoney(card.price, locale)}
          qualifier={catalog("price.allIn")}
          equivalents={
            card.equivalents === undefined
              ? undefined
              : catalog(
                  "price.equivalents",
                  equivalentsMessageValues(card.equivalents, locale),
                )
          }
        />
      ) : (
        /* The hub card's one line, in the place the price would be and drawn there on both hub
           artboards: the claim stands beside the thing it is about (spec 008 §14 A2's reasoning,
           applied to the absence of a price). The page also carries the fuller sentence once,
           above the grid (AC-7). */
        <Text
          as="span"
          size="sm"
          tone="muted"
          className="mt-[6px] leading-(--line-height-tight)"
        >
          {shop("card.noPrice")}
        </Text>
      )}
    </>
  );

  const body: ReactNode = lead ? (
    <>
      {photo}
      {/* The lead figure's tag from `md` up: the card's own name, price and label on a white card
          over the photograph's foot (the country occasion artboard). The price is this card's
          `formatMoney` output: the tag is the card, larger (price shown = price charged). */}
      <div
        className="md:bg-card md:rounded-field md:absolute md:start-[16px] md:end-[16px] md:bottom-[16px] md:px-[20px] md:pt-[6px] md:pb-[16px] md:shadow-(--shadow-letter)"
        data-fo-lead-tag
      >
        {caption}
        {note === null ? null : <div className="md:mt-[8px]">{note}</div>}
      </div>
    </>
  ) : (
    <>
      {photo}
      {caption}
    </>
  );

  return (
    <Stack
      as="article"
      gap="xs"
      {...(lead ? { className: "md:relative", "data-fo-lead": true } : {})}
      data-fo-product-card={card.productId}
      data-fo-product-card-kind={card.href === undefined ? "tile" : "link"}
      data-fo-product-card-money={hasCardPrice(card) ? "priced" : "none"}
    >
      {card.href === undefined ? (
        body
      ) : (
        <a
          className="group flex flex-col"
          href={card.href}
          // Motion 6 (spec 004 §14 A24 clause 9; TASK-194): the card lifts 2 px and its photograph
          // zooms 3 % inside its clipped box on a fine pointer's hover (`globals.css`). Never on
          // the priority card: the LCP photograph and its ancestors carry no transition (AC-44).
          {...(priority ? {} : { "data-fo-card-motion": "" })}
        >
          {body}
        </a>
      )}
      {lead ? null : note}
    </Stack>
  );
}
