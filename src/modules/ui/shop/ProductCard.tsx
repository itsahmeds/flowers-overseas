/**
 * `ProductCard` — the one card every country-scoped listing renders (spec 008 §2 "The product card
 * contract", §5.2, §5.3, **AC-6**, §13 Q8, T-06; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing and card blocks", rows 1–4).
 *
 * **What it renders, and it is the whole list** (AC-6): the photograph or spec 006's captioned
 * placeholder in a fixed 4∶5 box, the product name as the card's heading, **one** all-in price
 * through `formatMoney` with the `catalog.price.inclusive` wording beside it, and the honesty
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
 * Server Component. No state, no client bytes (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { type LocaleCode } from "@/config/locales";
import { formatMoney } from "@/modules/i18n";

import { MediaAsset } from "../media/MediaAsset.tsx";
import type { MediaManifest } from "../media/manifest.ts";
import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import { Photo } from "../primitives/Photo.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Display, Text } from "../primitives/typography.tsx";

import type { ProductCardView } from "./viewModel.ts";

export interface ProductCardProps {
  readonly card: ProductCardView;
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
}

/** The 4∶5 box, in every state. Named once so the four states cannot drift apart. */
const CARD_RATIO = "card" as const;

export function ProductCard({
  card,
  locale,
  priority = false,
  headingLevel = "h2",
  manifest,
}: ProductCardProps): ReactElement {
  const catalog = useTranslations("catalog");
  const media = useTranslations("media");

  const photo =
    card.photo.kind === "asset" ? (
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

  const body: ReactNode = (
    <>
      {photo}
      {/* `.card .nm` on the sheet: the display voice at `lg`, and a real heading, because §5.3
          requires the card's name to *be* its heading and the price to be adjacent text. */}
      <Display as={headingLevel} size="lg">
        <bdi>{card.name}</bdi>
      </Display>
      <Text as="span" size="lg" className="font-semibold">
        <bdi>{formatMoney(card.price, locale)}</bdi>
      </Text>
      <Text as="span" size="xs" tone="muted">
        {catalog("price.inclusive")}
      </Text>
    </>
  );

  return (
    <Stack
      as="article"
      gap="sm"
      data-fo-product-card={card.productId}
      data-fo-product-card-kind={card.href === undefined ? "tile" : "link"}
    >
      {card.href === undefined ? (
        body
      ) : (
        <a className="gap-sm flex flex-col" href={card.href}>
          {body}
        </a>
      )}
      {card.photo.kind === "asset" ? (
        <MediaProvenanceNote
          assetIds={[card.photo.assetId]}
          locale={locale}
          {...(manifest === undefined ? {} : { manifest })}
        />
      ) : null}
    </Stack>
  );
}
