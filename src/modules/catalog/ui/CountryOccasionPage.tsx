/**
 * The country occasion `/{locale}/{country}/{occasions}/{occasion}` (spec 008 §2 row 8, §5.2,
 * §5.3 row 2, §5.4, §12 task 7 — the country half of **AC-11**; T-01, T-11;
 * `docs/design/wireframes/country-occasion-desktop.dc.html` and `-mobile.dc.html`; TASK-111).
 *
 * **Why the page type exists.** Mother's Day is a different day in every country a buyer might
 * send to. This page answers "what can you make for it *there*, and when is it *there*" on one
 * URL, and the dated line is the whole reason it deserves to rank (`plan/02` §6: "a wrong
 * Mother's Day is worse than no page").
 *
 * **Block order, from the artboard** — breadcrumb · `h1` · the dated line · the lede · the demo
 * sentence · the priced grid · the "also in {country}" row. §5.3 row 2 is the normative list
 * ("the same, minus the tiles; occasion adds the dated line for that country").
 *
 * **The date is never computed here** (AC-11, T-11). It arrives on `listingView().occasionDates`
 * as one row for this destination, produced by spec 007's `occasionDate`/`nextOccasions` through
 * `upcomingOccasions()` — the same path the shop root's table and the occasion hub read, so no two
 * page types can print different days for one occasion. This component formats it with spec 003's
 * `formatDate` and composes nothing: there is no date literal here and none in any message string.
 *
 * **`date: null` is the honest blank** (§14 design round **Q6**). An occasion whose rule is `none`,
 * and Romania's Orthodox Easter until spec 009 task 2 adds the rule type (`plan/13` B15), carries
 * no date: the page says it is not printing one and why. The Western date is never reused.
 *
 * **No empty state.** A country occasion exists only where six deliverable products do (§2 row 8,
 * §13 Q7), so the grid can never be empty — the artboard draws that cell as unreachable, and
 * `tests/unit/catalog-occasion-page.test.tsx` asserts the existence set keeps it so.
 *
 * **What is deliberately not here.** The delivery-facts panel the desktop artboard draws under the
 * demo sentence is spec 007's `CorridorFacts` in its `facts-unknown` form: it reads a
 * `CorridorView`, and §5.2 makes `listingView()` the **only** source for this page. Spec 008 §14
 * **A9** already ruled that for the shop root — spec text governs over the drawing — and §5.3
 * row 2's block list names it no more than row 1 does, so it stays on the corridor page the
 * breadcrumb links to (dated row in `docs/design/README.md`). The **toolbar** and **pagination**
 * the artboard draws are TASK-114's (§14 **A8** (c)): nothing here reads `searchParams`, and a
 * sort form that cannot sort is a control the page does not pretend to have. `BreadcrumbList` and
 * `ItemList` are TASK-115's. No client island, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate, formatDateParts, sortBy } from "@/modules/i18n";
import {
  type ChipLinkView,
  Container,
  Display,
  Eyebrow,
  ListingGrid,
  ListingSortForm,
  Pagination,
  Text,
  VisuallyHidden,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import {
  CountryListingResults,
  GridProvenance,
  ListingChipRow,
  ListingPageHead,
  ListingPhoneNote,
  ListingProse,
  ListingStateLine,
  ListingSubsection,
  STATE_KEYS,
  emphasise,
} from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

/**
 * The register's ground from `md` up, full-bleed: the band's own box stays on the page frame (so
 * AC-31's first block is still at the gutter) and its colour is painted to the viewport's edges.
 */
const BAND =
  "md:bg-blush md:shadow-[0_0_0_100vmax_var(--color-blush)] md:[clip-path:inset(0_-100vmax)]";

/**
 * The lead figure's box from `md` up: a 4∶5 photograph capped at `--hero-photo-max` (spec 004
 * §14 A23 clause 9), narrowed rather than cropped, and never wider than the end column allows.
 */
const LEAD_BOX =
  "md:w-[min(calc(var(--hero-photo-max)*0.8),36vw)] md:aspect-[4/5]";

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface CountryOccasionPageProps {
  readonly view: ListingView;
}

export function CountryOccasionPage({
  view,
}: CountryOccasionPageProps): ReactElement {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const catalog = useTranslations("catalog");
  const code = localeCode(view.locale);
  const country = registryLabel(t, view.country?.nameKey ?? "");
  // The occasion's name is the founder's **authored copy** in this locale (spec 006's corpus), not
  // a message key: `listingView()` carries it on the entity, and nothing here composes a name.
  const occasion = view.entity?.name ?? "";

  // AC-24, asserted where the nomination is made: the first card of the one grid, and nothing else
  // on the page, carries `priority`.
  const lcp = view.items[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  /** This destination's row — the one `occasionDates` entry a country occasion carries. */
  const dated = view.occasionDates?.[0];
  const date = dated?.date ?? null;

  /**
   * The artboard's row, as one list: the **other** occasions of this destination that have a page,
   * then the shop root. The current occasion is left out rather than repeated as a marker — the
   * drawing's row is the way *out* of this page — and an occasion below the floor has no URL, so
   * it is absent rather than disabled (§13 Q7, spec 004 AC-14). Nothing is invented: every href
   * is one `listingView()` already resolved, and the shop root's label is a message.
   */
  const alsoIn: readonly ChipLinkView[] = [
    ...view.links.chips.filter((chip) => chip.current !== true),
    ...(view.links.shopRoot === undefined
      ? []
      : [
          {
            key: "shop-root",
            name: shop("occasion.shopRootLink", { country }),
            href: view.links.shopRoot,
          },
        ]),
  ];

  const register = view.entity?.register ?? "dated";
  const firstPage = view.page === 1;
  const heading = shop("h1.countryOccasion", { occasion, country });
  const dateInstant = date === null ? undefined : instantOf(date);
  const datedLine =
    dateInstant === undefined
      ? shop("occasion.undatedLine", { occasion, country })
      : shop("occasion.datedLine", {
          occasion,
          country,
          date: formatDate(dateInstant, code, "calendarDate", "UTC"),
        });
  const parts =
    dateInstant === undefined
      ? undefined
      : formatDateParts(dateInstant, code, "UTC");

  return (
    <Container
      as="main"
      id="main"
      data-fo-country-occasion={view.entity?.key ?? ""}
      data-fo-listing-state={view.items.length === 0 ? "empty" : "populated"}
    >
      <div className="pb-(--section-fluid)">
        {/* The register's ground (spec 004 §14 A23 R1: the occasion's own row, always `dated`
            here) runs full-bleed behind the breadcrumb and the hero from `md` up. */}
        <div
          className={firstPage ? BAND : undefined}
          {...(firstPage ? { "data-register": register } : {})}
        >
          <ListingBreadcrumb crumbs={view.breadcrumb} />
        </div>

        {/* The positioning context of the lead figure (spec 008 §14 A16 (b)): `items[0]` is the
            grid's first `<li>` at every width, and from `md` up its `<li>` is placed over the
            hero's end column, which holds an empty box of the same size. One element in the DOM,
            its URL once in `<main>`, no `display: none` copy. */}
        <div className={firstPage ? "md:relative" : undefined}>
          {firstPage ? (
            <div
              className={`${BAND} grid grid-cols-1 gap-x-[48px] pt-[12px] pb-[6px] md:grid-cols-[minmax(0,1fr)_auto] md:pt-[24px] md:pb-[40px]`}
              data-fo-listing-hero
              data-register={register}
            >
              <div>
                <Eyebrow className="mb-[14px] max-md:hidden">
                  {shop("listing.eyebrow", { country })}
                </Eyebrow>
                <Display
                  as="h1"
                  size="display"
                  className="max-md:text-[32px] max-md:leading-[1.08]"
                >
                  {emphasise(heading, country)}
                </Display>
                {view.country === undefined ? null : (
                  <ListingStateLine
                    state={view.country.state}
                    text={t(STATE_KEYS[view.country.state])}
                  />
                )}
                {/* The date: one `formatDate` value (AC-11), the reason this page exists. */}
                <p
                  className="text-ink-muted md:display md:text-ink mt-[8px] max-w-[44ch] text-sm md:mt-[24px] md:text-[26px] md:leading-[1.2]"
                  data-fo-occasion-date={date ?? ""}
                >
                  {datedLine}
                </p>
                {date === null ? null : (
                  <Text
                    size="sm"
                    tone="muted"
                    className="mt-[8px] max-w-[44ch] max-md:hidden"
                  >
                    {shop("occasion.dateNote", { country })}
                  </Text>
                )}
                {/* From `md` up: the date card and N1 beside it. Below `md` neither renders here:
                    the card is the desktop's, and N1 follows the grid (`ListingPhoneNote`; spec
                    004 §14 A-founder-2026-10-18c clause 3), so this row is `display: none`. */}
                <div
                  className="mt-[28px] flex items-start gap-[32px] max-md:hidden"
                  data-fo-hero-note-row
                >
                  {parts === undefined ? null : (
                    /* The date card: the day, month, weekday and year of that **one** value,
                       set apart (spec 004 §14 A23 clause 5; `formatDateParts`). */
                    <div
                      className="bg-card rounded-field border-rule flex-none border px-[22px] pt-[14px] pb-[16px] max-md:hidden"
                      data-fo-date-card
                    >
                      <p className="display text-ink text-[88px] leading-none">
                        {parts.day}
                      </p>
                      <p className="label text-ink-muted mt-[10px]">
                        {[parts.month, parts.weekday, parts.year].join(" · ")}
                      </p>
                      <p className="text-ui text-ink mt-[8px]">{occasion}</p>
                    </div>
                  )}
                  <div
                    aria-label={shop("note.label")}
                    className="md:border-rule md:border-s md:ps-[20px]"
                    data-fo-listing-note
                    role="note"
                  >
                    <p className="text-ink text-sm font-bold max-md:hidden">
                      {shop("note.mark")}
                    </p>
                    <Text
                      as="p"
                      size="sm"
                      tone="muted"
                      className="md:text-ui max-w-[44ch] md:mt-[6px]"
                    >
                      {shop("root.demoNotice")}
                    </Text>
                  </div>
                </div>
              </div>
              {/* The lead figure's box: empty, the size of the figure placed over it. */}
              <div className={`${LEAD_BOX} hidden md:block`} data-fo-lead-box />
            </div>
          ) : (
            <ListingPageHead emphasis={country} heading={heading} />
          )}

          {/* Products before prose (§5.3). */}
          <section aria-labelledby="occasion-grid-heading" data-fo-shop-listing>
            <VisuallyHidden as="h2" id="occasion-grid-heading">
              {heading}
            </VisuallyHidden>
            {/* The founder's C3 (spec 008 §14 A-founder-2026-10-14c, AC-33): the count, the ranking
                disclosure, "Also in Poland" and the sort form, in that order, above the grid at
                every width; then the grid; then the pager. The lead figure is the grid's first
                `<li>`, drawn over the hero from `md` up (A16 (b)). */}
            <CountryListingResults
              count={{
                phone: shop("toolbar.count", { count: view.resultCount }),
                desktop:
                  view.pageCount > 1
                    ? shop("toolbar.summary", {
                        count: view.resultCount,
                        page: view.page,
                        pageCount: view.pageCount,
                      })
                    : shop("toolbar.count", { count: view.resultCount }),
              }}
              disclosure={shop("toolbar.disclosure")}
              chips={
                <ListingChipRow
                  labelFromMd
                  chips={sortBy(alsoIn, code, (chip) => chip.name)}
                  label={shop("occasion.siblingsHeading", { country })}
                />
              }
              gridLabel={<GridProvenance cards={view.items} locale={code} />}
              afterGrid={
                firstPage ? (
                  <ListingPhoneNote
                    label={shop("note.label")}
                    note={shop("root.demoNotice")}
                  />
                ) : undefined
              }
              grid={
                <ListingGrid
                  cards={view.items}
                  lead={firstPage}
                  leadItemClassName={`md:absolute md:top-[24px] md:end-0 ${LEAD_BOX}`}
                  locale={code}
                  priority
                  provenance="md"
                />
              }
              fx={
                view.fxFallback ? (
                  <div data-fo-fx-fallback>
                    <Text measure size="sm" tone="muted">
                      {catalog("availability.fxUnavailable")}
                    </Text>
                  </div>
                ) : undefined
              }
              pager={
                <Pagination
                  baseHref={view.path}
                  locale={code}
                  page={view.page}
                  pageCount={view.pageCount}
                />
              }
              sortForm={<ListingSortForm sort={view.sort} variant="bare" />}
              toolbar="column"
            />
          </section>
        </div>

        {/* The lede, under the first screen. */}
        {firstPage ? (
          <div className="pt-[40px] md:pt-[48px]" data-fo-shop-lede>
            <ListingProse>{shop("occasion.lede", { country })}</ListingProse>
          </div>
        ) : null}

        {/* "How it reaches Poland", last: the country's paragraph, as on the shop root. */}
        <ListingSubsection
          dataHook={{ "data-fo-shop-intro": true }}
          emphasis={country}
          heading={shop("root.introHeading", { country })}
          id="occasion-how-heading"
          split
        >
          <ListingProse>{shop("root.introBody", { country })}</ListingProse>
        </ListingSubsection>
      </div>
    </Container>
  );
}
