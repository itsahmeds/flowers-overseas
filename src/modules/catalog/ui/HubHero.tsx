/**
 * The hubs' first screens, round 2 (spec 004 §14 A23 clause 4 **R1–R6** and clause 5, A24 clauses
 * 2 (c), 4 and 5; `docs/design/wireframes/occasion-hub-*`, `category-hub-*`, `occasions-index-*`
 * and `all-destinations-*`; TASK-188).
 *
 * One vocabulary for the four hubs, so the four first screens cannot drift apart:
 *
 *  - `HubBand` — the hero band from `md` up: the register's ground painted to the viewport's edges
 *    (`data-register`, R1: the ground is the registry row's and never a component's), the trail
 *    inside it, and the 12-column split the artboards draw (copy on columns 1–6, the lead figure
 *    on 8–12; flipped for the `quiet` register, whose photograph sits first). Below `md` there is
 *    no ground and no figure: the phone hub is a calm shop list (A24 clause 2 (c)).
 *  - `HubLeadFigure` — R2's lead, the page's one priority image **from `md` up only**: displayed
 *    and preloaded there (`media`), and never downloaded below `md` (A24 clause 5).
 *  - `HubPills` — destinations as pills (A24 clause 2): a wrapping row from `md` up, one
 *    horizontal scroller below `md` (TASK-195's primitive).
 *  - `HubDateCards` — dates as plain cards (R3, R5): the day large, the month and weekday under it.
 *
 * Nothing here is tilted, taped, stamped or postmarked (A24 clause 2; AC-45's "no ornament"), and
 * no copy is written here: every string arrives from the page.
 */
import type { ReactElement, ReactNode } from "react";

import type { ListingRegister } from "@/config/catalogue/listing-presentation";
import type { LocaleCode } from "@/config/locales";
import { formatDateParts } from "@/modules/i18n";

import { formatOccasionDates } from "./ListingChrome";
import {
  Display,
  Eyebrow,
  HorizontalScroller,
  Icon,
  MediaAsset,
  Text,
  type HubCardView,
} from "@/modules/ui";

/**
 * Each register's ground from `md` up (R1's closed set; the round-2 artboards' `.reg-*`), painted
 * full-bleed by a 100vmax spread shadow clipped to the band's block, so the band's own box stays
 * on the page frame and AC-31's first block is still at the gutter. Written out in full because
 * Tailwind reads class names from the source text.
 */
const GROUND: Readonly<Record<ListingRegister, string>> = {
  warm: "md:bg-butter md:shadow-[0_0_0_100vmax_var(--color-butter)] md:[&_h1_em]:underline md:[&_h1_em]:decoration-sun md:[&_h1_em]:decoration-[0.09em] md:[&_h1_em]:underline-offset-[0.1em] md:[&_h1_em]:[text-decoration-skip-ink:none]",
  // `quiet`: the italic in ink-2, not poppy (R1), and no underline.
  quiet:
    "md:bg-paper-2 md:shadow-[0_0_0_100vmax_var(--color-paper-2)] md:[&_h1_em]:text-ink-muted",
  dated:
    "md:bg-blush md:shadow-[0_0_0_100vmax_var(--color-blush)] md:[&_h1_em]:underline md:[&_h1_em]:decoration-sun md:[&_h1_em]:decoration-[0.09em] md:[&_h1_em]:underline-offset-[0.1em] md:[&_h1_em]:[text-decoration-skip-ink:none]",
  cream: "md:bg-paper-2 md:shadow-[0_0_0_100vmax_var(--color-paper-2)]",
  leaf: "md:bg-leaf-wash md:shadow-[0_0_0_100vmax_var(--color-leaf-wash)]",
  sky: "md:bg-sage-wash md:shadow-[0_0_0_100vmax_var(--color-sage-wash)]",
  ink: "md:bg-surface-inverse md:shadow-[0_0_0_100vmax_var(--color-surface-inverse)] md:text-on-inverse md:[&_.eyebrow]:text-on-inverse-accent md:[&_h1]:text-on-inverse md:[&_h1_em]:text-on-inverse-accent md:[&_nav_a]:text-on-inverse md:[&_nav_li]:text-on-inverse md:[&_nav_[aria-current]]:text-on-inverse md:[&_[data-fo-hub-pills-label]]:text-on-inverse",
};

/** The ink register's muted text (deck, notes, captions) from `md` up. */
export function onGround(register: ListingRegister, muted: string): string {
  return register === "ink" ? `${muted} md:text-on-inverse` : muted;
}

export interface HubBandProps {
  readonly register: ListingRegister;
  /** The id of the page's `<h1>`, which names the band. */
  readonly labelledBy: string;
  readonly breadcrumb: ReactNode;
  /** The copy column: eyebrow, `<h1>`, deck, note and the way to a price. */
  readonly children: ReactNode;
  /** The end column from `md` up: the lead figure, or the dates. */
  readonly aside?: ReactNode;
  /** `quiet`: the photograph sits first (`occasion-hub-desktop`, the Sympathy band). */
  readonly flip?: boolean;
  /** The copy column's share of the 12 columns from `md` up (the occasions index draws 5∶7). */
  readonly split?: "6-5" | "5-7" | "6-6";
  /** A full-width row under the split, still on the band (R3's date cards). */
  readonly after?: ReactNode;
  /** The page's own hook. */
  readonly dataHook?: Readonly<Record<`data-${string}`, string | boolean>>;
}

const COPY_COLUMNS: Readonly<
  Record<NonNullable<HubBandProps["split"]>, string>
> = {
  "6-5": "md:col-span-7 lg:col-span-6",
  "5-7": "md:col-span-5",
  "6-6": "md:col-span-6",
};
const ASIDE_COLUMNS: Readonly<
  Record<NonNullable<HubBandProps["split"]>, string>
> = {
  "6-5": "md:col-start-8 md:col-span-5",
  "5-7": "md:col-start-6 md:col-span-7",
  "6-6": "md:col-start-7 md:col-span-6",
};

export function HubBand({
  register,
  labelledBy,
  breadcrumb,
  children,
  aside,
  flip = false,
  split = "6-5",
  after,
  dataHook = {},
}: HubBandProps): ReactElement {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`${GROUND[register]} flow-root md:pb-[48px] md:[clip-path:inset(0_-100vmax)]`}
      data-fo-hub-band
      data-register={register}
      {...dataHook}
    >
      {breadcrumb}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start pt-[8px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:pt-[32px]">
        <div
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-[12px] md:gap-[20px] ${COPY_COLUMNS[split]} ${flip ? "md:col-start-7 md:row-start-1" : ""}`}
          data-fo-hub-copy
        >
          {children}
        </div>
        {aside === undefined ? null : (
          <div
            className={`min-w-0 ${flip ? "md:col-span-5 md:col-start-1 md:row-start-1" : ASIDE_COLUMNS[split]}`}
          >
            {aside}
          </div>
        )}
      </div>
      {after === undefined ? null : (
        <div className="mt-[16px] md:mt-[32px]">{after}</div>
      )}
    </section>
  );
}

/**
 * R2's lead figure, from `md` up only (A24 clause 2 (c)): a 4∶5 photograph capped at
 * `--hero-photo-max` (A23 clause 9), narrowed rather than cropped, with the product's name under
 * it. It is the page's only `fetchpriority="high"` image from `md` up and its only preload there;
 * below `md` it is `display: none` and its `<picture>` selects a blank source, so nothing is
 * downloaded (`MediaAsset`'s `displayedAt`). Not a link, not a card and not an `ItemList` element:
 * the product keeps its own place in the grid (R2).
 */
export function HubLeadFigure({
  lead,
  locale,
  register,
  small = false,
}: {
  readonly lead: HubCardView;
  readonly locale: LocaleCode;
  readonly register: ListingRegister;
  /** A dated hub's smaller figure, so its date cards still sit in the first screen (R3). */
  readonly small?: boolean;
}): ReactElement {
  return (
    <figure
      className={`hidden w-full md:block ${small ? "max-w-[calc(var(--hero-photo-max)*0.5)]" : "max-w-[calc(var(--hero-photo-max)*0.8)]"}`}
      data-fo-hub-lead={lead.productId}
    >
      {lead.photo.kind === "asset" ? (
        <MediaAsset
          assetId={lead.photo.assetId}
          className="rounded-photo overflow-hidden"
          displayedAt="md-up"
          locale={locale}
          priority
          productName={lead.name}
          ratio="card"
          sizes={LEAD_SIZES}
          slot={lead.photo.slot}
        />
      ) : null}
      <figcaption
        className={onGround(
          register,
          "display text-ink mt-[18px] text-[23px] leading-[1.15]",
        )}
      >
        <bdi>{lead.name}</bdi>
      </figcaption>
    </figure>
  );
}

/**
 * The lead figure's `sizes`: about 30vw from `md` up (columns 8–12, capped at 416 px), and never
 * displayed below `md`. Its own string, not the grid's, so the figure and a first grid card of the
 * same product never collapse into one preload (React dedupes on `imagesrcset` + `imagesizes`).
 */
const LEAD_SIZES = "(min-width: 768px) 30vw, 100vw";

/** One pill: a link with its accessible name, or plain text where no page exists (A20). */
export interface HubPill {
  readonly key: string;
  readonly name: string;
  readonly href?: string | undefined;
  /** The link's accessible name, where it says more than the visible name (R4). */
  readonly label?: string | undefined;
  /** The fine line inside the pill: a count (R4) or a region (R6). */
  readonly detail?: string | undefined;
  readonly hook?: Readonly<Record<`data-${string}`, string>> | undefined;
}

const PILL =
  "inline-flex flex-none items-baseline gap-[8px] min-h-(--target-min) px-[18px] py-[10px] rounded-full whitespace-nowrap bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] no-underline";

/**
 * A pill with a fine line (R4's count, or the pending sentence): the name and the arrow on the
 * first line, the fine line under them, so a row of seven stays three rows tall in the copy column
 * and a count never becomes a one-word column (the QA finding Q18-03).
 */
const PILL_STACKED =
  "grid h-full min-h-(--target-min) grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[8px] gap-y-[2px] rounded-field bg-card px-[16px] py-[10px] text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] no-underline";

function Pill({ pill }: { readonly pill: HubPill }): ReactElement {
  const stacked = pill.detail !== undefined;
  const arrow =
    pill.href === undefined ? null : (
      <Icon className="text-link self-center" name="arrow-end" size={16} />
    );
  const body = stacked ? (
    <>
      <span className="font-bold">{pill.name}</span>
      {arrow ?? <span />}
      <span className="text-ink-subtle col-span-2 text-xs font-normal">
        {pill.detail}
      </span>
    </>
  ) : (
    <>
      <span className="font-bold">{pill.name}</span>
      {arrow}
    </>
  );
  const box = stacked ? PILL_STACKED : PILL;
  return pill.href === undefined ? (
    <span className={box} {...(pill.hook ?? {})}>
      {body}
    </span>
  ) : (
    <a
      className={`${box} hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
      href={pill.href}
      {...(pill.label === undefined ? {} : { "aria-label": pill.label })}
      {...(pill.hook ?? {})}
    >
      {body}
    </a>
  );
}

/**
 * The destinations as pills: a wrapping row from `md` up, one horizontal scroller below `md` (A24
 * clause 4 (c): every pill reachable by touch and keyboard, nothing auto-advances). The two rows
 * are the same links; each is hidden by CSS at the other width, so exactly one is in the
 * accessibility tree at a time.
 */
export function HubPills({
  label,
  heading,
  pills,
  phone = true,
}: {
  /** The list's accessible name. */
  readonly label: string;
  /** The small caps label over the row, from `md` up. */
  readonly heading?: string;
  readonly pills: readonly HubPill[];
  /** `false` where the page draws its own phone form (the destinations hub's rows). */
  readonly phone?: boolean;
}): ReactElement | null {
  if (pills.length === 0) return null;
  return (
    <>
      <div className="hidden gap-[10px] md:grid" data-fo-hub-pills>
        {heading === undefined ? null : (
          <p
            className="text-ink-subtle text-xs font-bold tracking-[0.12em] uppercase"
            data-fo-hub-pills-label
          >
            {heading}
          </p>
        )}
        <ul
          aria-label={label}
          className={
            pills.some((pill) => pill.detail !== undefined)
              ? "grid list-none grid-cols-2 gap-[10px] p-0 lg:grid-cols-3"
              : "flex list-none flex-wrap gap-[10px] p-0"
          }
        >
          {pills.map((pill) => (
            <li key={pill.key}>
              <Pill pill={pill} />
            </li>
          ))}
        </ul>
      </div>
      {phone ? (
        <div className="w-full max-md:order-last md:hidden" data-fo-phone-chips>
          <HorizontalScroller
            itemsFocusable={pills.some((pill) => pill.href !== undefined)}
            items={pills.map((pill) => ({
              key: pill.key,
              // The phone copy of the same link: no fine line (the chip row is one line), and
              // its own hook, so a probe counts each destination once per row.
              node: (
                <Pill
                  pill={{
                    ...pill,
                    detail: undefined,
                    hook: { "data-fo-hub-chip": pill.key },
                  }}
                />
              ),
            }))}
            label={label}
          />
        </div>
      ) : null}
    </>
  );
}

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** The day large, then the month and (from `md` up) the weekday: the parts of one value. */
function DateFace({
  parts,
}: {
  readonly parts: {
    readonly day: string;
    readonly month: string;
    readonly weekday: string;
  };
}): ReactElement {
  return (
    <>
      <span
        className="display text-ink text-[34px] leading-none md:text-[44px]"
        data-fo-date-face
      >
        {parts.day}
      </span>
      <span
        className="text-ink-subtle text-xs font-bold tracking-[0.08em] uppercase"
        data-fo-date-face
      >
        {parts.month}
        <span className="max-md:hidden">
          {" · "}
          {parts.weekday}
        </span>
      </span>
    </>
  );
}

/** One date card: the day large, the month and weekday under it, the name, and its link. */
export interface HubDateCard {
  readonly key: string;
  readonly name: string;
  /** ISO `YYYY-MM-DD`, or `null` where the date cannot be computed (R3's honest blank). */
  readonly date: string | null;
  /**
   * The occurrence's other days, after `date` (spec 008 §14 A-founder-2026-10-21c, AC-76): the
   * face then prints every day as one `formatList` of `dayMonth` values instead of one day's
   * parts.
   */
  readonly alsoDates?: readonly string[] | undefined;
  readonly href?: string | undefined;
  readonly hook?: Readonly<Record<`data-${string}`, string>>;
}

/**
 * Dates as plain cards (A24 clause 2; R3 and R5): a named list. Every number is `formatDate`'s,
 * in its parts (A23 clause 5's parts formatter: no component calls `Intl`), and a card whose date
 * cannot be computed prints `unknownDate` and no number. A card is a link only where its page
 * exists (spec 004 AC-14). A wrapping grid from `md` up, one horizontal scroller below `md`.
 */
export function HubDateCards({
  label,
  cards,
  locale,
  unknownDate,
  columns = 3,
  cta,
}: {
  readonly label: string;
  readonly cards: readonly HubDateCard[];
  readonly locale: LocaleCode;
  readonly unknownDate?: string;
  /** Cards per row from `md` up. */
  readonly columns?: 3 | 4 | 7;
  /** A linked card's call to action (R3: "What we make for it"). */
  readonly cta?: string;
}): ReactElement | null {
  if (cards.length === 0) return null;
  const grid =
    columns === 7
      ? "md:grid-cols-7"
      : columns === 4
        ? "md:grid-cols-4"
        : "md:grid-cols-3";
  const card = (entry: HubDateCard, hooked = true): ReactElement => {
    const hook = hooked ? (entry.hook ?? {}) : {};
    const body = (
      <>
        {entry.date === null ? (
          <span className="text-ink-muted text-sm" data-fo-date-face>
            {unknownDate}
          </span>
        ) : entry.alsoDates !== undefined && entry.alsoDates.length > 0 ? (
          <span
            className="display text-ink text-[22px] leading-[1.1] md:text-[26px]"
            data-fo-date-face
          >
            {formatOccasionDates(
              [entry.date, ...entry.alsoDates],
              locale,
              "dayMonth",
            )}
          </span>
        ) : (
          <DateFace
            parts={formatDateParts(instantOf(entry.date), locale, "UTC")}
          />
        )}
        <span className="text-ink md:font-display mt-[6px] text-sm md:text-[19px] md:leading-[1.2]">
          {entry.name}
        </span>
        {entry.href === undefined || cta === undefined ? null : (
          <span className="text-link mt-[4px] text-sm font-bold max-md:hidden">
            {cta}
          </span>
        )}
      </>
    );
    const box =
      "bg-card rounded-photo-s grid h-full min-h-[120px] content-start gap-[2px] p-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] no-underline md:p-[16px]";
    return entry.href === undefined ? (
      <div className={box} data-fo-card-date={entry.date ?? ""} {...hook}>
        {body}
      </div>
    ) : (
      <a
        className={`${box} hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
        data-fo-card-date={entry.date ?? ""}
        href={entry.href}
        {...hook}
      >
        {body}
      </a>
    );
  };
  return (
    <>
      <ul
        aria-label={label}
        className={`hidden list-none grid-cols-3 gap-[14px] p-0 md:grid ${grid}`}
        data-fo-hub-date-cards={cards.length}
      >
        {cards.map((entry) => (
          <li key={entry.key}>{card(entry)}</li>
        ))}
      </ul>
      <div className="w-full md:hidden" data-fo-phone-date-cards>
        <HorizontalScroller
          itemsFocusable={cards.some((entry) => entry.href !== undefined)}
          items={cards.map((entry) => ({
            key: entry.key,
            node: <div className="w-[132px]">{card(entry, false)}</div>,
          }))}
          label={label}
        />
      </div>
    </>
  );
}

/** The flat P.S. note with a rule (round 2): no tilt, no tape, no shadow. */
export function HubNote({
  mark,
  label,
  children,
  register,
}: {
  readonly mark?: string;
  readonly label?: string;
  readonly children: ReactNode;
  readonly register: ListingRegister;
}): ReactElement {
  return (
    <div
      {...(label === undefined ? {} : { role: "note", "aria-label": label })}
      className="border-rule max-w-[46ch] md:border-s-2 md:ps-[18px]"
      data-fo-hub-note
    >
      {mark === undefined ? null : (
        <p className="text-ink text-ui font-bold max-md:hidden">{mark}</p>
      )}
      <Text
        as="p"
        size="sm"
        className={onGround(
          register,
          "text-ink-muted mt-[4px] leading-(--line-height-tight)",
        )}
      >
        {children}
      </Text>
    </div>
  );
}

/** The hub's eyebrow and `<h1>`: the eyebrow from `md` up only (the phone draws none). */
export function HubHeading({
  id,
  eyebrow,
  children,
}: {
  readonly id: string;
  readonly eyebrow?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      {eyebrow === undefined ? null : (
        <Eyebrow className="max-md:hidden">{eyebrow}</Eyebrow>
      )}
      <Display as="h1" id={id} size="display">
        {children}
      </Display>
    </>
  );
}

/** The deck: the approved sentence (A1, A5) or the intro's own (A23 clause 6), from `md` up. */
export function HubDeck({
  children,
  register,
}: {
  readonly children: ReactNode;
  readonly register: ListingRegister;
}): ReactElement {
  return (
    <p
      className={onGround(
        register,
        "text-ink-muted hidden max-w-[40ch] text-[22px] leading-[1.42] md:block",
      )}
      data-fo-hub-deck
    >
      {children}
    </p>
  );
}
