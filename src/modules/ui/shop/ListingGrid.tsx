/**
 * `ListingGrid` — the card grid (spec 008 §2, §5.3, **AC-6**, §5.4; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing grid": 4-up at 1440, 2-up at 390).
 *
 * A `<ul>` with an **accessible name that carries the count**, one `<li>` per card, so a screen
 * reader is told how many bouquets there are before it walks them (§5.3's accessibility
 * paragraph, and the drawing's "semantics" note). The columns are `Grid columns="2-4"` — the set
 * spec 004 already ships — because §2's rule is that no component invents a bespoke grid.
 *
 * **One `priority` image per page** (§5.4, spec 006 AC-19): the first card of the grid is the
 * page's LCP candidate, and only when the page says so. A page that renders two grids nominates
 * one of them; `assertSinglePriority()` is the gate that catches the mistake.
 *
 * **Twelve per page, six eager** (§5.4): the grid marks nothing eager itself — `MediaAsset`
 * lazy-loads everything that is not the `priority` candidate, which is what keeps the page inside
 * spec 006's image-transfer budget.
 *
 * Server Component. No client bytes, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type LocaleCode } from "@/config/locales";

import type { MediaManifest } from "../media/manifest.ts";
import { Grid } from "../primitives/layout.tsx";

import { ProductCard } from "./ProductCard.tsx";
import type { ListingCardView } from "./viewModel.ts";

export interface ListingGridProps {
  /**
   * Priced cards on a country-scoped listing, priceless ones on a hub (spec 008 §14 **A3**). One
   * grid renders both: the geometry, the list semantics and the LCP nomination are the same
   * question on either, and a second grid would be a second place for them to drift (TASK-112).
   */
  readonly cards: readonly ListingCardView[];
  readonly locale: LocaleCode;
  /**
   * Nominate the first card's photograph as the page's single LCP candidate. Off by default: a
   * page that renders more than one grid must choose, and defaulting to "yes" would give a page
   * two preloads (spec 006 AC-19).
   */
  readonly priority?: boolean;
  readonly headingLevel?: "h2" | "h3";
  readonly manifest?: MediaManifest;
}

export function ListingGrid({
  cards,
  locale,
  priority = false,
  headingLevel = "h2",
  manifest,
}: ListingGridProps): ReactElement | null {
  const t = useTranslations("shop");

  // Nothing to show is not an empty grid: the listing renders `ListingEmpty` instead, and a grid
  // with no cards renders **nothing at all** — no heading, no skeleton, no "0 results"
  // (§2's states, AC-8, spec 004 §5.3's rule applied to a grid).
  if (cards.length === 0) return null;

  return (
    <Grid
      as="ul"
      columns="2-4"
      gap="lg"
      aria-label={t("grid.label", { count: cards.length })}
      className="list-none"
      data-fo-listing-grid={cards.length}
    >
      {cards.map((card, index) => (
        <li key={card.productId}>
          <ProductCard
            card={card}
            headingLevel={headingLevel}
            locale={locale}
            priority={priority && index === 0}
            {...(manifest === undefined ? {} : { manifest })}
          />
        </li>
      ))}
    </Grid>
  );
}
