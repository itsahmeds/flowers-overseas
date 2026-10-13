/**
 * The v2 listing chrome every listing page type shares (spec 004 §14 A21 clause 1; TASK-178;
 * `docs/design/wireframes/country-shop-*.dc.html`, `country-category-*`, `country-occasion-*`,
 * `category-hub-*`, `occasion-hub-*`, `occasions-index-*` and `all-destinations-*`).
 *
 * The artboards draw one vocabulary across seven pages, and this file is that vocabulary once, so
 * the seven pages cannot drift apart:
 *
 *  - `ListingIntro` — the artboards' `.shop-intro`: the one `<h1>` in the display face with the
 *    destination (or the subject) set in the poppy italic, the lede, and on the end side the
 *    page's note card (the "P.S." letter, `--shadow-letter`, `--tilt-ps`, sunflower tape).
 *    Seven columns to four from `md` up, one column on a phone.
 *  - `ListingSubsection` — `.subsec`: 72 px above (48 on a phone), optionally in `.two`'s
 *    4fr∶7fr split with the heading on the start side.
 *  - `ListingTiles` — `.tiles`: the category tiles, four across on cards with a rule ring, a ruled
 *    list on a phone; each tile one link with its count and its `from` price.
 *  - `OccasionDatesTable` — `.cal`: the destination's own dates as a captioned table.
 *
 * **No copy is written here.** Every string arrives from the page, which reads its own message
 * keys; the emphasis is presentation of a sentence the catalogue already holds (`emphasise`), so
 * no key gains markup and no locale's sentence is split into fragments a translator cannot see.
 * The founder's copy batch for this task (the eyebrow "Sending to …", the "P.S." mark, the
 * printed-card note in the grid, "Narrow it down") is listed in `docs/tasks/TASK-178.md` and is
 * not rendered until it is approved (spec 004 §14 A21 clause 7; the 5 % unreviewed gate).
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatDate } from "@/modules/i18n";
import {
  Chip,
  Display,
  Eyebrow,
  FromPriceChip,
  HorizontalScroller,
  MediaProvenanceNote,
  Text,
  TextLink,
  needsAiProvenanceNote,
  type CategoryTileView,
  type ProductCardView,
} from "@/modules/ui";

/**
 * `text` with the **last** occurrence of `phrase` set in the poppy italic (`display-em`), or
 * `text` unchanged when the phrase does not occur — a declined or inflected country name in a
 * locale's sentence ("dla Polski") simply renders without the emphasis, never with a broken one.
 */
export function emphasise(text: string, phrase: string): ReactNode {
  if (phrase === "") return text;
  const at = text.lastIndexOf(phrase);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <em className="display-em text-accent">{phrase}</em>
      {text.slice(at + phrase.length)}
    </>
  );
}

export interface ListingIntroProps {
  /** The page's one heading, already translated. */
  readonly heading: string;
  /** The part of the heading set in the poppy italic (the destination, or the hub's subject). */
  readonly emphasis?: string;
  /** The eyebrow over the heading, where the page has one in shipped copy. */
  readonly eyebrow?: string;
  /** Whatever sits between the heading and the lede (the occasion page's dated stamp). */
  readonly children?: ReactNode;
  readonly lede?: ReactNode;
  /** The note card on the end side: the demo sentence on a country-scoped page. */
  readonly note?: ReactNode;
  /** The note card's mark ("P.S.") and its accessible name ("A note before you choose"). */
  readonly noteMark?: string;
  readonly noteLabel?: string;
}

export function ListingIntro({
  heading,
  emphasis = "",
  eyebrow,
  children,
  lede,
  note,
  noteMark,
  noteLabel,
}: ListingIntroProps): ReactElement {
  return (
    <div
      className="pt-lg md:gap-2xl md:pt-xl grid grid-cols-1 items-end gap-[28px] pb-[36px] md:grid-cols-[7fr_4fr] md:pb-[56px]"
      data-fo-listing-intro
    >
      <div>
        {eyebrow === undefined ? null : (
          <Eyebrow className="mb-[14px]">{eyebrow}</Eyebrow>
        )}
        <Display as="h1" size="display">
          {emphasise(heading, emphasis)}
        </Display>
        {children}
        {lede === undefined ? null : (
          <Text
            size="lg"
            tone="muted"
            className="mt-[18px] max-w-(--measure-lede)"
          >
            {lede}
          </Text>
        )}
      </div>
      {note === undefined ? null : (
        <ListingNote
          {...(noteMark === undefined ? {} : { mark: noteMark })}
          {...(noteLabel === undefined ? {} : { label: noteLabel })}
        >
          {note}
        </ListingNote>
      )}
    </div>
  );
}

/**
 * The letter-like note card (`.ps`): a card on `--shadow-letter`, tilted by `--tilt-ps`, with a
 * strip of sunflower tape across its top. A `<div>`, not an `<aside>`: an `aside` inside `<main>`
 * is a nested complementary landmark (axe `landmark-complementary-is-top-level`), and the note is
 * part of the page's own argument rather than tangential to it.
 */
export function ListingNote({
  children,
  mark,
  label,
}: {
  readonly children: ReactNode;
  /** "P.S.", in the poppy italic of the display face (not Caveat: A21 clause 3). */
  readonly mark?: string;
  /** The note's accessible name, exposed through `role="note"`. */
  readonly label?: string;
}): ReactElement {
  return (
    <div
      {...(label === undefined ? {} : { role: "note", "aria-label": label })}
      className="bg-card rounded-letter px-lg pb-lg before:bg-sun relative rotate-(--tilt-ps) pt-[22px] shadow-(--shadow-letter) before:absolute before:start-1/2 before:-top-[10px] before:-ms-[42px] before:h-[22px] before:w-[84px] before:-rotate-3 before:opacity-75 before:content-['']"
      data-fo-listing-note
    >
      {mark === undefined ? null : (
        <p className="display-em text-accent text-lg leading-[1.15]">{mark}</p>
      )}
      <Text
        as="p"
        size="md"
        tone="muted"
        className={mark === undefined ? "text-ui" : "text-ui mt-[6px]"}
      >
        {children}
      </Text>
    </div>
  );
}

export interface ListingSubsectionProps {
  readonly id: string;
  readonly heading: string;
  readonly emphasis?: string;
  readonly eyebrow?: string;
  /** `.two`: the heading on the start side (4fr), the body on the end side (7fr), from `md`. */
  readonly split?: boolean;
  readonly children: ReactNode;
  /** The page's own data hook, kept stable for its tests and e2e. */
  readonly dataHook?: Readonly<Record<`data-${string}`, string | boolean>>;
}

export function ListingSubsection({
  id,
  heading,
  emphasis = "",
  eyebrow,
  split = false,
  children,
  dataHook = {},
}: ListingSubsectionProps): ReactElement {
  const head = (
    <div>
      {eyebrow === undefined ? null : (
        <Eyebrow className="mb-[14px]">{eyebrow}</Eyebrow>
      )}
      <Display as="h2" size="2xl" id={id}>
        {emphasise(heading, emphasis)}
      </Display>
    </div>
  );
  return (
    <section
      aria-labelledby={id}
      className="pt-[48px] md:pt-(--section-fluid)"
      {...dataHook}
    >
      {split ? (
        <div className="gap-lg md:gap-2xl grid grid-cols-1 items-start md:grid-cols-[4fr_7fr]">
          {head}
          <div>{children}</div>
        </div>
      ) : (
        <>
          <div className="mb-[28px] md:mb-[48px]">{head}</div>
          {children}
        </>
      )}
    </section>
  );
}

/** Running prose at the artboards' `.prose` size (19 px desktop, 17 on a phone), in ink-2. */
export function ListingProse({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Text size="md" tone="muted" className="max-w-(--measure) md:text-[19px]">
      {children}
    </Text>
  );
}

/**
 * The toolbar's count and ranking disclosure without a sort form, between the toolbar's two
 * rules — for a listing page type that has no parameter route, where a sort control would be a
 * control that does nothing (spec 004 §14 A20).
 */
export function ListingCount({
  count,
  disclosure,
  inclusive,
}: {
  readonly count: string;
  readonly disclosure: string;
  /**
   * The full VAT-and-delivery wording, once for the page, where the page's lede does not already
   * carry it: the cards say only "all in" (the founder's copy batch).
   */
  readonly inclusive?: string;
}): ReactElement {
  return (
    <div className="border-rule flex flex-col border-y py-[18px]">
      <Text as="span" size="md" className="display text-md">
        {count}
        {inclusive === undefined ? null : (
          <span className="text-ink-subtle font-body text-sm">
            {" · "}
            {inclusive}
          </span>
        )}
      </Text>
      <Text as="span" size="sm" tone="subtle" className="mt-[6px] max-w-[70ch]">
        {disclosure}
      </Text>
    </div>
  );
}

/** One destination row of a hub: a link with its count, or the pending sentence and no link. */
export type HubDestinationRow =
  | {
      readonly iso2: string;
      readonly name: string;
      readonly href: string;
      readonly count: string;
      readonly link: string;
    }
  | { readonly iso2: string; readonly name: string; readonly pending: string };

export interface HubDestinationsProps {
  readonly id: string;
  readonly eyebrow: string;
  readonly heading: string;
  /** Spec 008 AC-7's one sentence: why a hub shows no money. */
  readonly noMoney: string;
  readonly rows: readonly HubDestinationRow[];
}

/**
 * The destination-less hubs' "First, the destination" block (`category-hub-*` and
 * `occasion-hub-*` artboards): the heading and the no-money sentence on a sage-wash note on the
 * start side, the destinations as a ruled list on the end side — name in the display face, the
 * count, and a cornflower arrow link. A destination with no page has no link and says so
 * (spec 004 AC-14).
 */
export function HubDestinations({
  id,
  eyebrow,
  heading,
  noMoney,
  rows,
}: HubDestinationsProps): ReactElement {
  return (
    <section
      aria-labelledby={id}
      className="gap-lg md:gap-2xl grid grid-cols-1 items-start md:grid-cols-[4fr_7fr]"
      data-fo-hub-destinations
    >
      <div>
        <Eyebrow className="mb-[14px]">{eyebrow}</Eyebrow>
        <Display as="h2" size="2xl" id={id}>
          {heading}
        </Display>
        <Text
          as="p"
          size="md"
          className="bg-sage-wash rounded-field text-ui px-md mt-[20px] py-[12px]"
        >
          {noMoney}
        </Text>
      </div>
      <ul className="border-rule list-none border-t">
        {rows.map((row) => (
          <li
            className="border-rule md:py-lg grid grid-cols-1 items-baseline gap-[6px] border-b py-[20px] md:grid-cols-[220px_minmax(0,1fr)_auto] md:gap-x-[32px]"
            data-fo-hub-destination={row.iso2}
            data-fo-hub-destination-kind={"href" in row ? "link" : "text"}
            key={row.iso2}
          >
            <Display
              as="h3"
              size="xl"
              className="md:text-[30px] md:leading-[1.1]"
            >
              {row.name}
            </Display>
            {"href" in row ? (
              <>
                <Text as="p" size="md" tone="muted">
                  {row.count}
                </Text>
                <TextLink arrow href={row.href}>
                  {row.link}
                </TextLink>
              </>
            ) : (
              <Text as="p" size="md" tone="muted">
                {row.pending}
              </Text>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ListingTilesProps {
  readonly tiles: readonly CategoryTileView[];
  readonly locale: LocaleCode;
  /** `shop.root.tileCount`, resolved per tile by the page. */
  readonly countLabel: (tile: CategoryTileView) => string;
}

export function ListingTiles({
  tiles,
  locale,
  countLabel,
}: ListingTilesProps): ReactElement {
  return (
    <ul className="grid list-none grid-cols-1 md:grid-cols-4 md:gap-[12px]">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <a
            className="border-rule md:bg-card md:rounded-field group grid gap-[2px] border-b py-[18px] no-underline md:border-0 md:px-[20px] md:shadow-[inset_0_0_0_1px_var(--color-rule)] md:hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]"
            data-fo-category-tile={tile.key}
            href={tile.href}
          >
            <Display
              as="h3"
              size="lg"
              className="decoration-1 underline-offset-[5px] group-hover:underline"
            >
              {tile.name}
            </Display>
            <Text as="span" size="sm" tone="muted">
              {countLabel(tile)}
            </Text>
            {/* The stale-FX sentence is the page's, once, under the grid: a row of tiles each
                repeating it would be one snapshot claimed many times. */}
            <FromPriceChip locale={locale} price={tile.fromPrice} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface OccasionDateRow {
  readonly key: string;
  readonly name: string;
  readonly date: string | null;
  readonly href?: string | undefined;
  readonly nameKey: string;
  /** The page's own row hook (`data-fo-hub-date`), kept stable for its tests. */
  readonly hook?: Readonly<Record<`data-${string}`, string>>;
  /** The row header as a link (the occasions index: each occasion's own hub). */
  readonly nameHref?: string;
  /** The row header link's hook (`data-fo-occasion`). */
  readonly nameHook?: Readonly<Record<`data-${string}`, string>>;
}

export interface OccasionDatesTableProps {
  readonly caption: string;
  /** Two columns (occasion/country, date) or three (… and the page link, spec 008 §14 A10). */
  readonly columns:
    readonly [string, string] | readonly [string, string, string];
  readonly rows: readonly OccasionDateRow[];
  readonly locale: LocaleCode;
  /** The third column's link text. */
  readonly linkLabel?: string;
  /** What a row with no computable date says (the occasion hub's `dateUnknown`). */
  readonly unknownDate?: string;
}

/**
 * `.cal`: a captioned table with row headers, because a calendar read by a screen reader is a
 * table. Every date is `formatDate`'s, from the view model's ISO date; a row without a page of
 * its own has an **empty** third cell, never a disabled link (spec 004 AC-14, spec 008 §14 A10).
 */
export function OccasionDatesTable({
  caption,
  columns,
  rows,
  locale,
  linkLabel = "",
  unknownDate,
}: OccasionDatesTableProps): ReactElement {
  const head =
    "label text-ink-subtle border-rule border-b py-[14px] pe-[12px] text-start";
  const cell = "border-rule border-b py-[14px] pe-[12px] align-baseline";
  const withPage = columns.length === 3;
  return (
    <table className="text-ui w-full border-collapse">
      <caption className="text-ink-subtle pb-[12px] text-start text-sm">
        {caption}
      </caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th className={head} key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} {...(row.hook ?? {})}>
            <th
              className={`${cell} display text-body-s text-start md:text-[19px]`}
              scope="row"
            >
              {row.nameHref === undefined ? (
                row.name
              ) : (
                <a
                  className="link-inline"
                  href={row.nameHref}
                  {...(row.nameHook ?? {})}
                >
                  {row.name}
                </a>
              )}
            </th>
            <td className={`${cell} num text-ink-muted`}>
              {row.date === null
                ? (unknownDate ?? null)
                : formatDate(
                    instantOf(row.date),
                    locale,
                    "calendarDate",
                    "UTC",
                  )}
            </td>
            {withPage ? (
              <td className={`${cell} text-ink-subtle text-sm`}>
                {row.href === undefined ? null : (
                  <a
                    className="link-inline"
                    data-fo-occasion-page={row.nameKey}
                    href={row.href}
                  >
                    {linkLabel}
                  </a>
                )}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Round 2: the country listings' first screens (spec 004 §14 A24 clause 2;   */
/* spec 008 §14 A15, A16; TASK-187).                                          */
/* -------------------------------------------------------------------------- */

/**
 * The destination's state as one quiet text line (spec 004 §14 A23 **R7**, A24 clause 2): the
 * message for `listingView().country.state`, never a postmark. The dot is a 7 px decoration, so
 * it is `aria-hidden` and far under AC-45's 48 px ornament bound.
 */
export function ListingStateLine({
  state,
  text,
}: {
  readonly state: "guide" | "live";
  readonly text: string;
}): ReactElement {
  return (
    <p
      className="text-ink-muted mt-[8px] flex items-center gap-[8px] text-sm"
      data-fo-listing-state-line={state}
    >
      <span
        aria-hidden="true"
        className={`size-[7px] flex-none rounded-full ${state === "live" ? "bg-success" : "bg-ink-subtle"}`}
      />
      {text}
    </p>
  );
}

export interface CountryListingHeadProps {
  /** The page's one heading, already translated. */
  readonly heading: string;
  readonly emphasis: string;
  /** Spec 004 §14 A23 R7's line: `ListingStateLine`, or nothing on page 2 and later. */
  readonly stateLine?: ReactNode;
  /** Between the state line and the end of the start column (the occasion's dated line). */
  readonly children?: ReactNode;
  /** `shop.root.demoNotice` (N1): a flat P.S. with a rule from `md` up, a muted line on a phone. */
  readonly note?: string;
  readonly noteMark?: string;
  readonly noteLabel?: string;
}

/**
 * The shop root's and the country category's head (round 2): the H1 with the destination in the
 * poppy italic, the state line directly under it, and the shop's note on the end side as a flat
 * P.S. with a rule, nothing tilted and no tape (the round-2 artboards; A24 clause 2). On a phone
 * the note is the one muted line under the state line (`country-*-mobile`). One rule closes the
 * head from `md` up. No lede and no eyebrow here: a lede longer than two lines moves under the
 * first screen, and the first screen is the H1, the state line, the count and the first row.
 */
export function CountryListingHead({
  heading,
  emphasis,
  stateLine,
  children,
  note,
  noteMark,
  noteLabel,
}: CountryListingHeadProps): ReactElement {
  return (
    <div
      className="md:border-rule md:gap-2xl grid grid-cols-1 items-start gap-[10px] pt-[12px] pb-[16px] md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] md:border-b md:pt-[28px] md:pb-[28px]"
      data-fo-listing-hero
    >
      <div>
        <Display as="h1" size="display">
          {emphasise(heading, emphasis)}
        </Display>
        {stateLine}
        {children}
      </div>
      {note === undefined ? null : (
        <div
          {...(noteLabel === undefined
            ? {}
            : { role: "note", "aria-label": noteLabel })}
          className="md:border-rule md:border-s md:ps-[20px]"
          data-fo-listing-note
        >
          {noteMark === undefined ? null : (
            <p className="text-ink text-sm font-bold max-md:hidden">
              {noteMark}
            </p>
          )}
          <Text
            as="p"
            size="sm"
            tone="muted"
            className="md:text-ui max-w-[52ch] md:mt-[6px]"
          >
            {note}
          </Text>
        </div>
      )}
    </div>
  );
}

/** One chip of the phone's chip row: a link, or the current page marked and not a link. */
export interface PhoneChip {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  readonly current?: boolean | undefined;
}

/**
 * The phone's one chip row (spec 004 §14 A24 clause 4 (c), AC-49; TASK-195's scroller): a single
 * horizontal scroller of real links, every chip reachable by touch and keyboard, shown below `md`
 * only. From `md` up the page shows its own row in its own place, so this one is `display: none`
 * there and out of the accessibility tree.
 */
export function PhoneChipRow({
  label,
  chips,
}: {
  readonly label: string;
  readonly chips: readonly PhoneChip[];
}): ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label} className="md:hidden" data-fo-phone-chips>
      <HorizontalScroller
        itemsFocusable
        items={chips.map((chip) => ({
          key: chip.key,
          node:
            chip.current === true ? (
              <Chip aria-current="page">{chip.name}</Chip>
            ) : (
              <Chip href={chip.href}>{chip.name}</Chip>
            ),
        }))}
        label={label}
      />
    </nav>
  );
}

export interface CountryListingResultsProps {
  /** The count line: `phone` below `md` ("84 bouquets"), `desktop` from `md` up (with the page). */
  readonly count: { readonly phone: string; readonly desktop: string };
  readonly disclosure: string;
  /** The once-per-grid "Example arrangement" label shown below `md` (spec 008 §14 A16 (a)). */
  readonly gridLabel?: ReactNode;
  readonly grid: ReactNode;
  readonly fx?: ReactNode;
  readonly pager?: ReactNode;
  readonly sortForm: ReactNode;
  /**
   * Where the sort form sits from `md` up: `below` the grid (the shop root and the country
   * category, R8 and the round-2 shop artboard) or `above` it, beside the count (the country
   * occasion, A15 (d)).
   */
  readonly sortFormPlacement: "above" | "below";
}

/**
 * The results block of the three country listings, one element per part, laid out by CSS grid
 * placement so the DOM order is the phone's reading order:
 *
 * ```
 * phone (one column):  count · label · grid · fx · pager · disclosure · sort form
 * md, form below:      count | disclosure  ·  grid  ·  fx  ·  sort form  ·  pager
 * md, form above:      count, disclosure | sort form  ·  grid  ·  fx  ·  pager
 * ```
 *
 * So the ranking disclosure follows the grid on a phone and stands above it from `md` up, visible
 * at both (spec 008 §14 A16 (c), AC-32; spec 004 §14 A24 clause 2 (e)); the sort form is after the
 * grid in the DOM, and below it from `md` up where R8 puts it.
 */
export function CountryListingResults({
  count,
  disclosure,
  gridLabel,
  grid,
  fx,
  pager,
  sortForm,
  sortFormPlacement,
}: CountryListingResultsProps): ReactElement {
  const above = sortFormPlacement === "above";
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-[32px]"
      data-fo-listing-results={sortFormPlacement}
    >
      <p
        className={`md:col-start-1 md:row-start-1 ${above ? "md:pt-[24px]" : "md:py-[20px]"}`}
        data-fo-listing-count
      >
        <Text as="span" size="sm" tone="muted" className="md:hidden">
          {count.phone}
        </Text>
        <Text as="span" size="md" className="display text-md max-md:hidden">
          {count.desktop}
        </Text>
      </p>
      {gridLabel === undefined ? null : (
        <div className="mt-[8px] md:hidden" data-fo-grid-provenance>
          {gridLabel}
        </div>
      )}
      <div
        className={`mt-[12px] md:col-span-2 md:mt-0 ${above ? "md:border-rule md:row-start-3 md:mt-[24px] md:border-t md:pt-[32px]" : "md:row-start-2 md:mt-[4px]"}`}
        data-fo-listing-grid-slot
      >
        {grid}
      </div>
      {fx === undefined ? null : (
        <div
          className={`mt-[28px] md:col-span-2 ${above ? "md:row-start-4" : "md:row-start-3"}`}
        >
          {fx}
        </div>
      )}
      {pager === undefined ? null : (
        <div
          className={`mt-[28px] md:col-span-2 md:mt-[32px] ${above ? "md:row-start-5" : "md:row-start-5"}`}
        >
          {pager}
        </div>
      )}
      <Text
        as="p"
        size="sm"
        tone="subtle"
        className={`mt-[20px] max-w-[70ch] ${above ? "md:col-start-1 md:row-start-2 md:mt-[6px]" : "md:col-start-2 md:row-start-1 md:mt-0 md:self-center md:text-end"}`}
        data-fo-listing-disclosure
      >
        {disclosure}
      </Text>
      <div
        className={`mt-[24px] ${above ? "md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:self-end" : "md:col-span-2 md:row-start-4 md:mt-[40px]"}`}
        data-fo-listing-sort
      >
        {sortForm}
      </div>
    </div>
  );
}

/**
 * The message each destination state reads (spec 004 §14 A23 R7). The state comes from
 * `listingView().country.state` and nothing else; the words are the destinations hub's own.
 */
export const STATE_KEYS = {
  guide: "destinations.state.guideNotDelivering",
  live: "destinations.state.deliveringNow",
} as const satisfies Readonly<Record<"guide" | "live", string>>;

/**
 * Page 2 and later: **no hero** (spec 004 §14 A23 clause 5; spec 008 §14 A15 (a)). The H1 alone,
 * compact, then the results start the page. No state line, no note, no lead figure, no date.
 */
export function ListingPageHead({
  heading,
  emphasis,
}: {
  readonly heading: string;
  readonly emphasis: string;
}): ReactElement {
  return (
    <div className="pt-[12px] pb-[8px] md:pt-[24px]" data-fo-listing-page-head>
      <Display as="h1" size="2xl">
        {emphasise(heading, emphasis)}
      </Display>
    </div>
  );
}

/**
 * The phone's "Example arrangement" label, **once per grid** (spec 008 §14 A16 (a)): rendered only
 * where at least one card of this grid shows an `ai` asset (`MediaProvenanceNote` decides, from the
 * same manifest), placed by the page directly above the grid and shown below `md` only.
 */
export function GridProvenance({
  cards,
  locale,
}: {
  readonly cards: readonly ProductCardView[];
  readonly locale: LocaleCode;
}): ReactElement | null {
  const assetIds = cards.flatMap((card) =>
    card.photo.kind === "asset" ? [card.photo.assetId] : [],
  );
  if (!needsAiProvenanceNote(assetIds, locale)) return null;
  return <MediaProvenanceNote assetIds={assetIds} locale={locale} />;
}
