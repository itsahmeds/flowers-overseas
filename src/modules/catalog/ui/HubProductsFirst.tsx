/**
 * The products-first hub's blocks (spec 008 §14 A-founder-2026-10-24a "Hubs", **AC-7** as
 * amended, **AC-88**, **AC-89**; spec 004 §14 A-founder-2026-10-24a items 2, 3 and 6, **AC-82**;
 * `docs/design/wireframes/category-hub-*.dc.html` and `occasion-hub-*.dc.html`, their 2026-10-24a
 * sections; TASK-388).
 *
 * Both hubs render, in this DOM order: breadcrumb, eyebrow, H1, the one-sentence lede,
 * `shop.hub.noMoney` once, the picker (the chooser's form with `next` the hub's own key), the
 * count and the grid's one example label, the grid of the hub's core products as country-less
 * cards, then (occasion hubs) the dates, the long copy, and the destination rows linking every
 * live country's version of the hub directly. The page composes these blocks; each block takes
 * resolved strings and view-model data only, so nothing here reads a country, a cookie or a
 * header, and no block can print money: the cards are `HubCardView`s, which have no price field.
 *
 * Server Components, no client JavaScript of their own.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import {
  Chip,
  CountryPicker,
  Display,
  Eyebrow,
  GridProvenance,
  ListingGrid,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

export interface HubHeadProps {
  readonly breadcrumb: ReactNode;
  /** The parent crumb's label ("Flowers", "Occasions"): `.cm-eb`. */
  readonly eyebrow: string;
  readonly heading: string;
  readonly headingId: string;
  /** The one-sentence lede (`hubDeck`), where the hub has one. */
  readonly deck?: string | undefined;
  readonly picker: NonNullable<ListingView["hubPicker"]> | undefined;
}

/** Breadcrumb, eyebrow, H1, lede, `shop.hub.noMoney` once, and the picker (AC-89's first five). */
export function HubHead({
  breadcrumb,
  eyebrow,
  heading,
  headingId,
  deck,
  picker,
}: HubHeadProps): ReactElement {
  const shop = useTranslations("shop");
  const home = useTranslations("home");
  return (
    <div data-fo-hub-head="">
      {breadcrumb}
      <div className="grid max-w-[820px] gap-[10px] pt-[14px] pb-[24px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display
          as="h1"
          className="m-0 leading-[1.04]"
          id={headingId}
          size="display-s"
        >
          {heading}
        </Display>
        {deck === undefined ? null : (
          <p
            className="text-ink-2 m-0 max-w-[70ch] text-sm md:text-[19px]"
            data-fo-hub-deck=""
          >
            {deck}
          </p>
        )}
        <p
          className="text-ink-2 m-0 max-w-[64ch] text-xs leading-[1.4] md:text-sm md:leading-[1.45]"
          data-fo-hub-no-money=""
        >
          {shop("hub.noMoney")}
        </p>
        {picker === undefined ? null : (
          <div className="mt-[6px] max-w-[640px]">
            <CountryPicker
              action={picker.action}
              chips={picker.chips}
              datalist={picker.datalist}
              idPrefix="hub-picker"
              label={home("picker.label")}
              rememberLine={shop("choose.remember")}
              searchLabel={home("picker.search")}
              submitLabel={home("picker.submit")}
              variant="flat"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export interface HubCoreGridProps {
  readonly cards: ListingView["hubItems"];
  /** Every core card the hub holds, across pages (`resultCount`), for the count line. */
  readonly resultCount: number;
  readonly locale: LocaleCode;
  /** The section's accessible name (`.cm-wrap[aria-label]`). */
  readonly label: string;
}

/**
 * The count line, the grid's one example label and the grid of country-less cards. A hub with no
 * core product renders nothing here: no grid, no count line and no placeholder card (the brief's
 * escalation, AC-8's rule; `occasion-hub-*` draws Mother's Day so).
 */
export function HubCoreGrid({
  cards,
  resultCount,
  locale,
  label,
}: HubCoreGridProps): ReactElement | null {
  const shop = useTranslations("shop");
  const first = cards[0];
  // The grid's first photograph is the page's one priority image (spec 006 AC-19).
  assertSinglePriority(
    first !== undefined && first.photo.kind === "asset"
      ? [first.photo.assetId]
      : [],
  );
  if (cards.length === 0) return null;
  return (
    <section aria-label={label} data-fo-hub-products="">
      <div className="border-rule mb-[22px] flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px] border-y py-[16px]">
        <p
          className="display m-0 text-[19px] [font-variation-settings:var(--font-variation-display)]"
          data-fo-hub-count={resultCount}
        >
          {shop("toolbar.count", { count: resultCount })}
        </p>
        <GridProvenance cards={cards} className="text-xs" locale={locale} />
      </div>
      <ListingGrid
        cards={cards}
        chooser
        headingLevel="h3"
        locale={locale}
        priority
        provenance="grid"
      />
    </section>
  );
}

export interface HubDestinationRow {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  /** The link's accessible name, which contains `name` (WCAG 2.5.3): the hub's `destinationLink`. */
  readonly label: string;
}

export interface HubDestinationRowsProps {
  readonly eyebrow?: string | undefined;
  readonly heading: string;
  readonly headingId: string;
  readonly rows: readonly HubDestinationRow[];
}

/**
 * The destination rows (AC-82, AC-89): every live country's version of the hub, each a direct
 * link (the visitor's choice made by clicking it, never through the chooser), after the copy.
 * Nothing renders when no country has that page.
 */
export function HubDestinationRows({
  eyebrow,
  heading,
  headingId,
  rows,
}: HubDestinationRowsProps): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-[14px] pt-[48px] md:pt-(--section-fluid)"
      data-fo-hub-destinations={rows.length}
    >
      {eyebrow === undefined ? null : <Eyebrow>{eyebrow}</Eyebrow>}
      <Display as="h2" id={headingId} size="2xl">
        {heading}
      </Display>
      <ul className="m-0 flex list-none flex-wrap gap-[10px] p-0">
        {rows.map((row) => (
          <li key={row.key}>
            <Chip
              aria-label={row.label}
              className="after:content-['→'] rtl:after:content-['←']"
              href={row.href}
            >
              <span data-fo-hub-destination={row.key}>{row.name}</span>
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
