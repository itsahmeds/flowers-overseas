/**
 * The home's product grids (spec 004 §14 A-founder-2026-10-24a items 2, 4 and 8, AC-95, AC-107;
 * TASK-386, TASK-387; `home-*.dc.html` `.cm-g5`, `.cm-g4`, `.cm-card`).
 *
 * Every card is the **country-less card**: the photograph, the name, "Choose a country to see the
 * price" in the price's reserved box, "Choose where to send", and one link through the chooser with
 * `rel="nofollow"` (`ProductCard`'s `chooser` form). No amount anywhere: the view model has no
 * field for one.
 *
 * **The example label once per grid** (A-founder-2026-10-19b clause 3, extended to the home's
 * sections by item 8): `HomeGridLabel` prints the reviewed text once on the section's heading row
 * wherever a displayed card's photograph is generated, and each card keeps its own label in the
 * HTML, hidden by CSS (`provenance="hidden"`), so a card lifted elsewhere keeps its claim.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LocaleCode } from "../../../config/locales.ts";
import { needsAiProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import { ProductCard } from "../shop/ProductCard.tsx";

import type { HomeCardView } from "./home-view.ts";

/** The grids' column sets, each the board's (`.cm-g5`, `.cm-g4`), two columns on a phone. */
export const HOME_GRID_COLUMNS = {
  five: "grid-cols-2 gap-x-[14px] gap-y-[28px] md:grid-cols-3 md:gap-x-[24px] md:gap-y-[40px] lg:grid-cols-5",
  four: "grid-cols-2 gap-x-[14px] gap-y-[28px] md:grid-cols-4 md:gap-x-[28px] md:gap-y-[44px]",
  three:
    "grid-cols-2 gap-x-[14px] gap-y-[28px] md:grid-cols-3 md:gap-x-[28px] md:gap-y-[44px]",
} as const;

/** The asset ids a grid displays: what decides whether its example label is printed. */
export function gridAssetIds(cards: readonly HomeCardView[]): string[] {
  return cards.flatMap((card) =>
    card.photo.kind === "asset" ? [card.photo.assetId] : [],
  );
}

export interface HomeGridLabelProps {
  readonly cards: readonly HomeCardView[];
  readonly locale: string;
  readonly className?: string;
}

/** The grid's one example label, or nothing where no displayed photograph is generated. */
export function HomeGridLabel({
  cards,
  locale,
  className,
}: HomeGridLabelProps): ReactElement | null {
  const t = useTranslations("media");
  if (!needsAiProvenanceNote(gridAssetIds(cards), locale)) return null;
  return (
    <p
      className={["text-ink-3 m-0 text-xs", className]
        .filter(Boolean)
        .join(" ")}
      data-fo-media-provenance="ai"
      data-fo-grid-label=""
    >
      {t("provenance.aiExample")}
    </p>
  );
}

export interface HomeCardGridProps {
  readonly cards: readonly HomeCardView[];
  readonly locale: LocaleCode;
  /** The list's accessible name: the section heading's id, or the panel's own name. */
  readonly name: { readonly labelledBy: string } | { readonly label: string };
  readonly columns: keyof typeof HOME_GRID_COLUMNS;
  /**
   * The first card's photograph is the page's LCP candidate below `md` only (item 4.2: the hero
   * photograph is from `md` up), so the two preloads never overlap (AC-94).
   */
  readonly priorityBelowMd?: boolean;
  /** Which section the grid is: the `ItemList` and the tests find it by this. */
  readonly section: string;
}

export function HomeCardGrid({
  cards,
  locale,
  name,
  columns,
  priorityBelowMd = false,
  section,
}: HomeCardGridProps): ReactElement {
  return (
    <ul
      {...("label" in name
        ? { "aria-label": name.label }
        : { "aria-labelledby": name.labelledBy })}
      className={`m-0 grid list-none p-0 ${HOME_GRID_COLUMNS[columns]}`}
      data-fo-home-grid={section}
    >
      {cards.map((card, index) => (
        <li key={card.productId} className="min-w-0">
          <ProductCard
            card={card}
            locale={locale}
            headingLevel="h3"
            provenance="hidden"
            chooser
            {...(priorityBelowMd && index === 0
              ? { priority: true, priorityAt: "below-md" as const }
              : {})}
          />
        </li>
      ))}
    </ul>
  );
}
