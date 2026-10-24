/**
 * `ProductCard` — the one card every country-scoped listing renders (spec 008 §2 "The product card
 * contract", §5.2, §5.3, **AC-6**, §13 Q8, T-06; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing and card blocks", rows 1–4).
 *
 * **What it renders, and it is the whole list** (AC-6 as amended by spec 004 §14
 * A-founder-2026-10-19b; TASK-285): the photograph or the wordless, `aria-hidden` placeholder box
 * (spec 043 AC-14; TASK-290) in a fixed 4∶5 box,
 * the product name as the card's heading, **one** all-in price through `formatMoney` with
 * `catalog.price.inclusive` ("Includes VAT and delivery"; the authored legal formula in `de` and
 * `pl`) beside it, and the honesty label wherever the asset it displayed is `ai`, displayed or
 * hidden as the grid's rule says (`provenance`).
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
 * **No approximate equivalents** (spec 004 §14 A-founder-2026-10-19b clause 2): the other
 * currencies are the product page's alone. The view model has no field for them, so there is
 * nothing here to print a second price line from. The `ItemList` builder reads the same `price`.
 *
 * **Or no price at all** (spec 008 §14 **A3**, **AC-7**; TASK-112). A destination-less hub shows
 * the same card with the money removed: it takes a `HubCardView`, which is this schema without
 * `price` and `priceLabelKey`, and prints the photograph and the name only (A-founder-2026-10-19b
 * clause 4: the page says once, above the grid, why there is no price). There is no second card
 * component — the geometry, the heading level, the photo box and
 * the provenance note are the same objects on both hubs and every country-scoped listing, which is
 * what keeps a card lifted from one surface to another from changing its claims. Which branch is
 * taken is decided by the **shape**, through `hasCardPrice()`: a country-scoped card cannot reach
 * the priceless branch, because its schema has no way to be missing a price.
 *
 * Server Component. No state, no client bytes (§5.4). Its hover motion (motion 6, premium: a 4 px
 * lift, a 6 % photo zoom, a shadow layer fading in and the name's line drawing; spec 004 §14
 * A-founder-2026-10-19e) is CSS on `data-fo-card-motion` and the two `cardMotion.tsx` layers, and
 * the priority card has none of them.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { type LocaleCode } from "@/config/locales";
import { formatMoney } from "@/modules/i18n";

import { MediaAsset } from "../media/MediaAsset.tsx";
import type { MediaManifest } from "../media/manifest.ts";
import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import {
  CARD_MOTION_ATTRIBUTE,
  CARD_MOTION_HEADING,
  CardMotionFrame,
  CardMotionLine,
} from "../primitives/cardMotion.tsx";
import { Photo } from "../primitives/Photo.tsx";
import { Price } from "../primitives/Price.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Display } from "../primitives/typography.tsx";

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
   * Where the "Example arrangement" label is displayed (spec 004 §14 A-founder-2026-10-19b
   * clause 3; `gridProvenanceMode()`). It is in the server HTML in every mode (spec 006 AC-17);
   * only CSS differs. `card` (the default, outside a listing grid): under the card at every width.
   * `md`: under the card from `md` up only, because below `md` the grid prints it once, above
   * itself (a mixed grid, and the country occasion's lead figure). `hidden`: at no width, because
   * the grid prints it once at every width (an all-example grid).
   */
  readonly provenance?: CardProvenance;
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
  /**
   * Keep "Includes VAT and delivery" on its own line under the amount at every width, for a grid
   * whose cards are too narrow to hold both on one line from `md` (the product page's six-up
   * related row at `lg`).
   */
  readonly qualifierBelow?: boolean;
}

/** Where a card's own example label is displayed (`ProductCardProps.provenance`). */
export type CardProvenance = "card" | "md" | "hidden";

/** The CSS each mode puts on the label's wrapper. `display: none` only, never removal. */
const CARD_PROVENANCE_CLASS: Readonly<
  Record<Exclude<CardProvenance, "card">, string>
> = {
  md: "max-md:hidden",
  hidden: "hidden",
};

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
  qualifierBelow = false,
}: ProductCardProps): ReactElement {
  const catalog = useTranslations("catalog");
  // Motion 6 moves a card that links to its page and is not the priority card (AC-44): the LCP
  // photograph and its ancestors carry no transition, no shadow layer and no line.
  const moving = card.href !== undefined && !priority;

  const photoBox =
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
      // No asset at all for this product: the wordless, `aria-hidden` box, and **no `<img>`**: the
      // same box the asset path degrades to, so the two placeholder routes are one rendered
      // result (spec 006 §5.3, `plan/10` §3; spec 043 §5.3 F, AC-14).
      <Photo
        decorative
        ratio={CARD_RATIO}
        dataset={{
          "data-fo-media-slot": card.photo.slot,
          "data-fo-media-placeholder": "no-asset",
        }}
      />
    );

  const photo = moving ? (
    <CardMotionFrame>{photoBox}</CardMotionFrame>
  ) : (
    photoBox
  );

  const provenanceNote =
    card.photo.kind === "asset" ? (
      <MediaProvenanceNote
        assetIds={[card.photo.assetId]}
        locale={locale}
        {...(manifest === undefined ? {} : { manifest })}
      />
    ) : null;
  // Where the grid prints the label once, this one stays in the HTML and is hidden by CSS (spec 004
  // §14 A-founder-2026-10-19b clause 3's mechanism); the default keeps the shipped markup exactly.
  const note =
    provenanceNote === null || provenance === "card" ? (
      provenanceNote
    ) : (
      <div
        className={CARD_PROVENANCE_CLASS[provenance]}
        data-fo-card-provenance={provenance}
      >
        {provenanceNote}
      </div>
    );

  const caption: ReactNode = (
    <>
      {/* The card name: Fraunces at the `h3` step (21/18), 14 px under the photograph (10 on a
          phone), and a real heading, because §5.3 requires the card's name to *be* its heading
          and the price to be adjacent text. On a moving card the line draws under it on hover
          (one line, never a `text-decoration` too); the priority card's name underlines. */}
      <Display
        as={headingLevel}
        size="lg"
        className={
          moving
            ? `mt-[10px] md:mt-[14px] ${CARD_MOTION_HEADING}`
            : "mt-[10px] decoration-1 underline-offset-[5px] group-hover:underline md:mt-[14px]"
        }
      >
        <bdi>{card.name}</bdi>
        {moving ? <CardMotionLine /> : null}
      </Display>
      {/* One price line: the amount and "Includes VAT and delivery" (`catalog.price.inclusive`,
          spec 003's price-display text). A hub card prints nothing here: the page says once why
          there is no price (spec 004 §14 A-founder-2026-10-19b clauses 1 and 4). */}
      {hasCardPrice(card) ? (
        <Price
          className="mt-[2px] md:mt-[6px]"
          amount={formatMoney(card.price, locale)}
          qualifier={catalog("price.inclusive")}
          {...(qualifierBelow ? { qualifierBelow: true } : {})}
        />
      ) : null}
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
          // Motion 6 (spec 004 §14 A-founder-2026-10-19e; TASK-277): the card lifts 4 px and its
          // photograph zooms 6 % inside its clipped box on a fine pointer's hover (`globals.css`).
          {...(moving ? CARD_MOTION_ATTRIBUTE : {})}
        >
          {body}
        </a>
      )}
      {lead ? null : note}
    </Stack>
  );
}
