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
import { formatDate, formatList } from "@/modules/i18n";
import {
  ChevronDown,
  Display,
  Eyebrow,
  FromPriceChip,
  GridProvenance,
  Icon,
  Text,
  TextLink,
  type CategoryTileView,
  type GridProvenanceProps,
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
      // Motion 12 (TASK-194): every listing subsection sits under the grid; the motion module
      // fades it up once it scrolls in, and never holds one that starts in the first viewport.
      data-fo-reveal=""
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
   * carry it (each card also says "Includes VAT and delivery" beside its price since spec 004
   * §14 A-founder-2026-10-19b clause 1).
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

/**
 * Every date of one occurrence as one string: each `formatDate` value, joined by `formatList`'s
 * `Intl.ListFormat` conjunction in the page's locale (spec 008 §14 A-founder-2026-10-21c item 4,
 * AC-76: Poland's Grandparents' Day prints both of its days in one cell). No message key: the
 * joining word is the locale's own, not copy.
 */
export function formatOccasionDates(
  dates: readonly string[],
  locale: LocaleCode,
  style: "calendarDate" | "dayMonth",
): string {
  return formatList(
    dates.map((date) => formatDate(instantOf(date), locale, style, "UTC")),
    locale,
  );
}

export interface OccasionDateRow {
  readonly key: string;
  readonly name: string;
  readonly date: string | null;
  /** The occurrence's other days, after `date` (the occasion hub only; AC-76). */
  readonly alsoDates?: readonly string[] | undefined;
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
                  className="link-inline inline-flex min-h-[24px] items-center"
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
                : formatOccasionDates(
                    [row.date, ...(row.alsoDates ?? [])],
                    locale,
                    "calendarDate",
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
/* The country listings' head (spec 043 §14 A-founder-10-22 items 1, 2,  */
/* 3, 5, 6 and 7, revised by design PR 347; the `lh:2026-10-24b` artboards of        */
/* design PR 347; TASK-289).                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The key of the not-open state part: the destinations' own state message for a destination that
 * is not taking orders (`destinationStateKey()`), whose value spec 007 §14 A-founder-2026-10-14c
 * clause 2 sets to "Ordering opens soon". One key, so the listing and the destinations block can
 * never say the state in two wordings.
 */
export const NOT_OPEN_STATE_KEY = "destinations.state.guideNotDelivering";

/** One chip of a listing's Categories panel: a link, or the current page marked and not a link. */
export interface ListingChip {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  readonly current?: boolean | undefined;
}

/** One part of the quiet line after the count, each its own element (never one joined string). */
export interface ListingStatusPart {
  readonly key: "state" | "prices";
  readonly text: string;
}

/** The middle dot between two parts: decoration, `aria-hidden` (item 1). */
function StatusDot({
  className,
}: {
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={["text-ink-subtle mx-[7px]", className]
        .filter(Boolean)
        .join(" ")}
      data-fo-sep
    >
      ·
    </span>
  );
}

/**
 * The status parts on their own, for the country occasion's phone, where they follow the grid
 * (spec 004 AC-57; item 1, "Below `md`"): one 13 px line, the parts as in the quiet line. Displayed
 * below `md` only, where the quiet line's own parts are not, so each band displays them once.
 */
export function ListingStatusAfterGrid({
  parts,
}: {
  readonly parts: readonly ListingStatusPart[];
}): ReactElement | null {
  if (parts.length === 0) return null;
  return (
    <p
      className="text-ink-subtle text-xs leading-[1.5] md:hidden"
      data-fo-listing-status-after-grid
    >
      {parts.map((part, index) => (
        <span key={part.key}>
          {index === 0 ? null : <StatusDot className="mx-[5px]" />}
          <span data-fo-listing-status-part={part.key}>{part.text}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * "How we sort" (item 2): one native `<details>`, closed in the server HTML, whose panel holds the
 * ranking sentence (`shop.toolbar.disclosure`) word for word, in normal flow under the toolbar row,
 * so it pushes the grid down: no overlay, no script, no focus trap.
 *
 * From `md` up its `<summary>` is a small text link directly before the sort pill on the toolbar
 * row; below `md` it ends the quiet line's count row (a 22 px line inside a 44 px hit area). It is
 * a direct child of `ListingHead`'s grid. Where the browser exposes `::details-content`, the
 * `<details>` box is dropped (`display: contents`) so the summary and the panel take their own
 * cells; elsewhere the whole `<details>` takes the summary's cell and, opened, the panel's row.
 */
function HowWeSort({
  label,
  sentence,
}: {
  readonly label: string;
  readonly sentence: string;
}): ReactElement {
  const place =
    "col-start-2 row-start-1 self-end justify-self-end md:col-start-3 md:row-start-2 md:mt-[14px] md:self-center";
  return (
    <details
      className={`group ${place} open:col-span-full open:row-start-3 open:justify-self-stretch supports-[selector(::details-content)]:contents [&::details-content]:col-span-full [&::details-content]:row-start-3 [&:not([open])::details-content]:hidden`}
      data-fo-ranking-disclosure
    >
      <summary
        className={`${place} text-ink-muted group-open:text-ink -my-[11px] inline-flex min-h-[22px] cursor-pointer list-none items-center gap-[7px] py-[11px] text-sm leading-[22px] whitespace-nowrap underline decoration-(--color-border-strong) underline-offset-4 md:my-0 md:min-h-(--target-min) md:px-[4px] md:py-0 md:no-underline [&::-webkit-details-marker]:hidden`}
      >
        {label}
        <ChevronDown className="group-open:-scale-y-100" />
      </summary>
      <p
        className="rounded-field bg-paper-2 text-ink-muted mt-[12px] px-[18px] py-[14px] text-sm leading-[1.5] md:mt-[8px]"
        data-fo-ranking-sentence
      >
        {sentence}
      </p>
    </details>
  );
}

/** One chip of the Categories panel: a link, or the current page in the selected fill. */
function PanelChip({ chip }: { readonly chip: ListingChip }): ReactElement {
  const base =
    "inline-flex min-h-(--target-min) items-center rounded-full px-[14px] text-sm whitespace-nowrap no-underline";
  return chip.current === true ? (
    <span
      aria-current="page"
      className={`${base} bg-selected text-on-selected`}
    >
      {chip.name}
    </span>
  ) : (
    <a
      className={`${base} bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
      href={chip.href}
    >
      {chip.name}
    </a>
  );
}

/** A labelled group of the Categories panel (spec 043 §5.3 E). */
export interface ListingChipGroup {
  readonly id: string;
  readonly heading: string;
  readonly chips: readonly ListingChip[];
}

/**
 * The "Categories" disclosure at the start of the toolbar row (spec 008 §14 A-founder-2026-10-15c;
 * spec 043 item 3 and §5.3 E; `.lh-cats`, `.lh-cpanel`): a pill with a plus, closed in the server
 * HTML; opened, a panel in normal flow under the toolbar row with the chips in two labelled groups,
 * what it is first, then the occasions. Every chip is the same crawlable `<a href>` open or
 * closed. Placed like `HowWeSort`, in its own panel row.
 */
export function ListingCategoriesToggle({
  label,
  heading,
  groups,
}: {
  /** The pill's words, the reviewed `nav.categories.label` ("Categories"). */
  readonly label: string;
  /** The panel's `<nav>` name ("Also for Poland", "By what it is"). */
  readonly heading: string;
  readonly groups: readonly ListingChipGroup[];
}): ReactElement | null {
  const shown = groups.filter((group) => group.chips.length > 0);
  if (shown.length === 0) return null;
  const place = "col-start-1 row-start-2 mt-[12px] md:mt-[14px]";
  return (
    <details
      className={`group ${place} open:col-span-full open:row-start-4 supports-[selector(::details-content)]:contents [&::details-content]:col-span-full [&::details-content]:row-start-4 [&:not([open])::details-content]:hidden`}
      data-fo-listing-categories
    >
      <summary
        className={`${place} text-ink bg-card group-open:bg-sage-wash md:text-ui flex min-h-(--target-min) w-fit cursor-pointer list-none items-center gap-[8px] rounded-full ps-[14px] pe-[12px] text-sm font-bold whitespace-nowrap shadow-[inset_0_0_0_1.5px_var(--color-ink)] md:gap-[10px] md:ps-[18px] md:pe-[16px] [&::-webkit-details-marker]:hidden`}
      >
        {label}
        {/* The expand affordance, `aria-hidden` because `<details>` exposes the state: a plus
            closed, a minus open, so nothing on the first screen is rotated (spec 004 AC-45). */}
        <span
          aria-hidden="true"
          className="text-[18px] leading-none font-normal group-open:hidden"
        >
          +
        </span>
        <span
          aria-hidden="true"
          className="hidden text-[18px] leading-none font-normal group-open:inline"
        >
          {"−"}
        </span>
      </summary>
      <nav
        aria-label={heading}
        className="rounded-field bg-paper-2 mt-[12px] grid grid-cols-1 gap-[8px] p-[14px] md:mt-[8px] md:grid-cols-[max-content_minmax(0,1fr)] md:gap-x-[20px] md:gap-y-[12px] md:px-[18px] md:py-[16px]"
      >
        {shown.map((group) => (
          <section
            aria-labelledby={group.id}
            className="contents"
            key={group.id}
          >
            <h3 className="label text-ink-subtle md:pt-[10px]" id={group.id}>
              {group.heading}
            </h3>
            <ul className="flex list-none flex-wrap gap-[8px] p-0">
              {group.chips.map((chip) => (
                <li key={chip.key}>
                  <PanelChip chip={chip} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </details>
  );
}

/**
 * The country occasion's start control (item 3; `.lh-also`): the "Also in {country}" label and
 * its one chip, the shop root (`shop.occasion.shopRootLink`). Below `md` the label is visually
 * hidden and stays the group's accessible name.
 */
export function ListingAlsoIn({
  id,
  label,
  chip,
}: {
  readonly id: string;
  readonly label: string;
  readonly chip: { readonly name: string; readonly href: string } | undefined;
}): ReactElement | null {
  if (chip === undefined) return null;
  return (
    <nav
      aria-labelledby={id}
      className="col-start-1 row-start-2 mt-[12px] flex min-w-0 items-center gap-[10px] md:mt-[14px]"
      data-fo-listing-also-in
    >
      <span
        className="text-ink-subtle text-sm whitespace-nowrap max-md:sr-only"
        id={id}
      >
        {label}
      </span>
      <a
        className="bg-card text-ink inline-flex min-h-(--target-min) min-w-0 items-center gap-[8px] rounded-full px-[14px] text-sm whitespace-nowrap no-underline shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]"
        href={chip.href}
      >
        {chip.name}
        <Icon name="chevron-end" size={12} />
      </a>
    </nav>
  );
}

export interface ListingHeadProps {
  /** The page's one heading, already translated (`shop.h1.*`, item 5). */
  readonly heading: string;
  /** The destination, set in the poppy italic inside one `<em>`. */
  readonly emphasis: string;
  /** The country occasion's date line, directly under the H1 (item 7). */
  readonly dateLine?: { readonly text: string; readonly date: string | null };
  /** The count: `shop.toolbar.count` on page 1, `shop.toolbar.summary` from page 2 (item 1). */
  readonly count: string;
  /** After the count, page 1 only: the not-open state while not open, then the prices part. */
  readonly parts: readonly ListingStatusPart[];
  /**
   * `after-grid`: the country occasion, whose status parts follow the grid below `md`
   * (`ListingStatusAfterGrid`); `head`: everywhere else, where they are the phone's first row.
   */
  readonly partsBelowMd: "head" | "after-grid";
  /** The start control: `ListingCategoriesToggle` or `ListingAlsoIn`. */
  readonly start: ReactNode;
  readonly howWeSort: { readonly label: string; readonly sentence: string };
  /** `ListingSortForm`. */
  readonly sort: ReactNode;
}

/**
 * The head of the three country listings, every page number (items 1, 2, 3, 5 and 7): the short
 * H1 at `--text-3xl-fluid`, on the country occasion the date line, then **one quiet line**
 * (`[data-fo-listing-status]`: the count in bold ink, then while ordering is not open the state,
 * then the prices part, each its own element with `aria-hidden` dots between them), then **one
 * toolbar row**: the start control, and at the end "How we sort" and the sort pill, closed from
 * `md` up by one hairline. Nothing else sits between the H1 and the grid: no destination line,
 * no eyebrow, no note column, no example label, no lead photograph.
 *
 * One grid holds the quiet line and the toolbar's controls, so the one "How we sort" `<details>`
 * can sit before the sort pill from `md` up and end the quiet line's count row below `md` without
 * a second copy. The toolbar row's wrapper (`[data-fo-listing-toolbar]`) is `display: contents`,
 * so its controls are that grid's cells:
 *
 * ```
 *  below md   [ state · prices            ]          from md  [ count · state · prices              ]
 *             [ count        ][ How we sort]                  [ start ][      ][ How we sort ][ sort ]
 *             [ start        ][   sort pill]                  [ How we sort's panel                 ]
 *             [ panels                     ]                  [ Categories' panel                   ]
 *                                                             [ hairline                            ]
 * ```
 */
export function ListingHead({
  heading,
  emphasis,
  dateLine,
  count,
  parts,
  partsBelowMd,
  start,
  howWeSort,
  sort,
}: ListingHeadProps): ReactElement {
  return (
    <div className="pt-[6px]" data-fo-listing-head>
      {/* Item 5: `--text-3xl-fluid` (46 px at 1440 × 900 and 1280 × 800, 32 px at 390 × 844), the
          display face with the hero variation, line height 1.06, tracking −0.02em. */}
      <Display
        as="h1"
        size="display-s"
        className="leading-[1.06] tracking-[-0.02em] [font-variation-settings:var(--font-variation-display-hero)] [&_em]:leading-[1.06]"
      >
        {emphasise(heading, emphasis)}
      </Display>
      {dateLine === undefined ? null : (
        /* Item 7: the reason this page exists, in the display face at `--text-h3` (21 px) from
           `md` up and `--text-h3-s` (18 px) below, ink-2. */
        <p
          className="font-display text-ink-muted text-h3-s md:text-h3 mt-[6px] leading-[1.3] text-balance [font-variation-settings:var(--font-variation-display-hero)]"
          data-fo-occasion-date={dateLine.date ?? ""}
        >
          {dateLine.text}
        </p>
      )}
      <div
        className="mb-[16px] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[8px] md:mb-[20px] md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-x-[12px]"
        data-fo-listing-head-grid
      >
        {/* Item 1: one quiet line. Below `md` two rows by `order` (the status parts first, then
            the count, which "How we sort" ends); from `md` up one row of inline parts. */}
        <p
          className="text-ink-muted text-fine col-span-full row-start-1 mt-[6px] flex flex-col gap-[2px] leading-[21px] md:block md:text-sm md:leading-[22px]"
          data-fo-listing-status
        >
          <span
            className="text-ink self-start font-bold"
            data-fo-listing-status-part="count"
          >
            {count}
          </span>
          {parts.length === 0 ? null : (
            <span
              className={
                partsBelowMd === "after-grid"
                  ? "max-md:hidden"
                  : "order-first md:order-none"
              }
              data-fo-listing-status-parts
            >
              {parts.map((part, index) => (
                <span key={part.key}>
                  <StatusDot
                    className={index === 0 ? "max-md:hidden" : undefined}
                  />
                  <span data-fo-listing-status-part={part.key}>
                    {part.text}
                  </span>
                </span>
              ))}
            </span>
          )}
        </p>
        <div className="contents" data-fo-listing-toolbar>
          {start}
          <HowWeSort label={howWeSort.label} sentence={howWeSort.sentence} />
          <div
            className="col-start-2 row-start-2 mt-[12px] min-w-0 justify-self-end md:col-start-4 md:mt-[14px]"
            data-fo-listing-sort
          >
            {sort}
          </div>
          {/* The one hairline under the toolbar row, from `md` up, under any opened panel. Empty,
              so nothing to hide from assistive technology. */}
          <div
            className="border-rule col-span-full row-start-5 mt-[10px] border-b max-md:hidden"
            data-fo-listing-toolbar-rule
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Under the grid's last card, before the pager (items 6 and 7; `.lh-foot`): one 13 px block in
 * ink-3. On the country occasion's phone the status parts come first (`before`); then the grid's
 * one example label (`GridProvenance`, displayed as its mode says, in the server HTML); then, on
 * the country occasion, the date note (`after`).
 */
export function ListingFootNote({
  before,
  gridProvenance,
  after,
}: {
  readonly before?: ReactNode;
  readonly gridProvenance: GridProvenanceProps;
  readonly after?: ReactNode;
}): ReactElement {
  return (
    <div
      className="text-ink-subtle [&_p]:text-ink-subtle mt-[24px] grid gap-[4px] text-xs leading-[1.5] md:mt-[32px] [&_p]:text-xs [&_p]:leading-[1.5]"
      data-fo-listing-foot
    >
      {before}
      <GridProvenance {...gridProvenance} />
      {after}
    </div>
  );
}
