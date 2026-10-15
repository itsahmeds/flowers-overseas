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
  Icon,
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
      className="md:border-rule md:gap-2xl grid grid-cols-1 items-start gap-[8px] pt-[12px] pb-[16px] md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] md:border-b md:pt-[12px] md:pb-[8px]"
      data-fo-listing-hero
    >
      <div>
        {/* The C3 artboards' title size (PR 236): `--text-title-fluid` from `md` up, 32 px on a
            phone, so the toolbar above the grid still leaves the first row on the first screen
            (spec 004 rebound AC-34). */}
        <Display
          as="h1"
          size="title"
          className="max-md:text-[32px] max-md:leading-[1.08]"
        >
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

/** One chip of a listing's chip row: a link, or the current page marked and not a link. */
export interface ListingChip {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  readonly current?: boolean | undefined;
}

/**
 * The listing's chip row (spec 008 §14 A-founder-2026-10-14c, AC-33; spec 004 AC-49; TASK-195's
 * scroller; TASK-241; the C3 artboards of PR 236): the category or occasion links of this
 * destination, above the grid: one horizontal scroller at every width (one line of the first
 * screen), every chip a real link reachable by touch, keyboard and a trackpad's sideways scroll. Phase 0's "category filters" are links to real pages
 * (§13 Q6), never facet parameters.
 *
 * - `phoneOnly`: the shop root, whose desktop draws no chip row (its tiles are the categories),
 *   so the row is `display: none` from `md` up and out of the accessibility tree there.
 * - `labelFromMd`: the country occasion draws its row's name ("Also in Poland") over the chips
 *   from `md` up; elsewhere the name is the `<nav>`'s and is not drawn.
 */
export function ListingChipRow({
  label,
  chips,
  phoneOnly = false,
  labelFromMd = false,
  id = "listing-chips",
}: {
  readonly label: string;
  /** The base of the drawn label's id, where `labelFromMd` draws one. */
  readonly id?: string;
  readonly chips: readonly ListingChip[];
  readonly phoneOnly?: boolean;
  readonly labelFromMd?: boolean;
}): ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <nav
      {...(labelFromMd
        ? { "aria-labelledby": `${id}-label` }
        : { "aria-label": label })}
      className={phoneOnly ? "md:hidden" : undefined}
      data-fo-listing-chips
    >
      {labelFromMd ? (
        <p
          className="label text-ink-subtle mb-[8px] max-md:hidden"
          id={`${id}-label`}
        >
          {label}
        </p>
      ) : null}
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

/**
 * The country category's sibling categories from `md` up, folded into one "Categories" button on
 * the toolbar row (spec 008 §14 A-founder-2026-10-15c, the founder's "A your pick" on E-1;
 * TASK-241 E-1): a native `<details>`/`<summary>`, so it opens and closes with no client script
 * and every chip link is in the server HTML whether the panel is open or not. The panel overlays
 * the grid rather than pushing it, so the first row of cards keeps its place on the first screen
 * (spec 004 rebound AC-34). Below `md` the page shows its one chip scroller instead.
 */
export function ListingCategoriesToggle({
  label,
  heading,
  chips,
}: {
  /** The button's words, `shop.category.chipsToggle` ("Categories"). */
  readonly label: string;
  /** The row's name ("Also for Poland"), on the panel's `<nav>`. */
  readonly heading: string;
  readonly chips: readonly ListingChip[];
}): ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <details
      className="group relative max-md:hidden"
      data-fo-listing-categories
    >
      <summary className="text-ink text-ui hover:bg-surface-raised flex min-h-(--control-sm) cursor-pointer list-none items-center gap-[8px] rounded-full px-[18px] font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)] [&::-webkit-details-marker]:hidden">
        {label}
        <Icon
          className="rotate-90 group-open:-rotate-90"
          name="chevron-end"
          size={16}
        />
      </summary>
      <nav
        aria-label={heading}
        className="bg-card rounded-field border-rule absolute end-0 top-[calc(100%+8px)] z-20 w-[min(720px,70vw)] border p-[20px] shadow-(--shadow-letter)"
      >
        <ul className="gap-sm flex list-none flex-wrap p-0">
          {chips.map((chip) => (
            <li key={chip.key}>
              {chip.current === true ? (
                <Chip aria-current="page">{chip.name}</Chip>
              ) : (
                <Chip href={chip.href}>{chip.name}</Chip>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}

export interface CountryListingResultsProps {
  /** The count line: `phone` below `md` ("84 bouquets"), `desktop` from `md` up (with the page). */
  readonly count: { readonly phone: string; readonly desktop: string };
  readonly disclosure: string;
  /** The page's `ListingChipRow`, where it has one. */
  readonly chips?: ReactNode;
  /**
   * The country category's `ListingCategoriesToggle`: from `md` up its chips fold into one
   * button on the count-and-sort row, before the sort form (A-founder-2026-10-15c).
   */
  readonly chipsToggle?: ReactNode;
  /** The sort form (`ListingSortForm`). */
  readonly sortForm: ReactNode;
  /**
   * Where the chip line sits from `md` up: `band` (the shop root and the country category) shows
   * none there (the shop root's categories are its tiles; the category's fold into
   * `chipsToggle`); `column` (the country occasion, whose line carries its drawn label) puts it
   * under the count-and-sort row.
   */
  readonly toolbar: "band" | "column";
  /** The once-per-grid "Example arrangement" label shown below `md` (spec 008 §14 A16 (a)). */
  readonly gridLabel?: ReactNode;
  readonly grid: ReactNode;
  readonly fx?: ReactNode;
  readonly pager?: ReactNode;
}

const TOOLBAR_PLACEMENT = {
  band: { chips: "md:hidden" },
  column: { chips: "md:col-span-full md:row-start-2 md:pt-[10px]" },
} as const;

/**
 * The results block of the three country listings (spec 008 §14 A-founder-2026-10-14c, the
 * founder's C3 ruling, AC-33; TASK-241). One order in the DOM at every width:
 *
 * ```
 * count · disclosure · chip row · sort form  ·  label (phone) · grid  ·  fx  ·  pager
 * ```
 *
 * Below `md` each part is its own line, as the phone artboards draw them. From `md` up the count,
 * the disclosure and the sort form share one row (count on the start side, sort on the end side);
 * the country category's chips fold into a "Categories" button on that row, before the sort form
 * (A-founder-2026-10-15c), and the occasion's chip line sits under it. All of
 * it ends above the grid. Nothing that sorts or narrows the list follows it, and the ranking
 * disclosure is visible above the grid at every width (§8 L240).
 */
export function CountryListingResults({
  count,
  disclosure,
  chips,
  chipsToggle,
  sortForm,
  toolbar,
  gridLabel,
  grid,
  fx,
  pager,
}: CountryListingResultsProps): ReactElement {
  const place = TOOLBAR_PLACEMENT[toolbar];
  return (
    <div data-fo-listing-results={toolbar}>
      <div
        className={`md:border-rule grid grid-cols-1 gap-y-[10px] md:items-center md:gap-x-[24px] md:gap-y-0 md:border-b md:py-[6px] ${chipsToggle === undefined ? "md:grid-cols-[auto_minmax(0,1fr)_auto]" : "md:grid-cols-[auto_minmax(0,1fr)_auto_auto]"}`}
        data-fo-listing-toolbar-band
      >
        <p className="md:col-start-1 md:row-start-1" data-fo-listing-count>
          <Text as="span" size="sm" tone="muted" className="md:hidden">
            {count.phone}
          </Text>
          <Text as="span" size="md" className="display text-md max-md:hidden">
            {count.desktop}
          </Text>
        </p>
        {/* The hook sits on a plain wrapper, because `Text` forwards no `data-*` attribute. */}
        <div
          className="-mt-[6px] max-w-[70ch] md:col-start-2 md:row-start-1 md:mt-0"
          data-fo-listing-disclosure
        >
          <Text as="p" size="xs" tone="subtle" className="md:text-sm">
            {disclosure}
          </Text>
        </div>
        {chips === undefined ? null : (
          <div className={`min-w-0 ${place.chips}`}>{chips}</div>
        )}
        {chipsToggle === undefined ? null : (
          <div className="max-md:hidden md:col-start-3 md:row-start-1">
            {chipsToggle}
          </div>
        )}
        <div
          className={`md:row-start-1 ${chipsToggle === undefined ? "md:col-start-3" : "md:col-start-4"}`}
          data-fo-listing-sort
        >
          {sortForm}
        </div>
      </div>
      {gridLabel === undefined ? null : (
        <div className="mt-[14px] md:hidden" data-fo-grid-provenance>
          {gridLabel}
        </div>
      )}
      <div className="mt-[12px] md:mt-[16px]" data-fo-listing-grid-slot>
        {grid}
      </div>
      {fx === undefined ? null : <div className="mt-[28px]">{fx}</div>}
      {pager === undefined ? null : (
        <div className="mt-[28px] md:mt-[32px]">{pager}</div>
      )}
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
