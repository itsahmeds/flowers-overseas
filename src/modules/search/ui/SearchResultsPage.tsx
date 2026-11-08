/**
 * The search results page (spec 045 §2.2, §2.6, §2.7, §5.3, §6, §14 A-founder-2026-11-08a items 1
 * and 4; TASK-402, TASK-520; `docs/design/wireframes/search-results-desktop.dc.html` and `-mobile`,
 * the 2026-11-08 section).
 *
 * The board's order, top to bottom: the H1 (`search.resultsHeading` with the query in the poppy
 * italic inside `<bdi>` when anything matched, `search.heading` otherwise); the quiet line (priced
 * results only: the count, "Ordering opens soon" while ordering is not open, the prices line);
 * the "Sending to" chip (a change form and, with a country, a remove form, both GET forms that
 * keep the words); the link groups (Countries, Occasions, Flowers, Help and information) in one
 * band, each only when it has a match; then "Bouquets" with the count and "How we sort", the
 * grid and the GET-form pager. With no destination the cards are country-less and
 * `shop.hub.noMoney` shows once: no amount anywhere. **The page has no search form of its own**:
 * the header's field holds the words, so the page has one search landmark (AC-43).
 *
 * **No `href` here carries the query** (§6, AC-3): the chip, "Did you mean", "Show every date",
 * Previous and Next are submit buttons of small GET forms whose hidden inputs carry `q`, `to`,
 * `date` and `page`. Every other link is a hub, a country page, an info page, a product or the
 * chooser, none with a query string. The query is printed only as text inside `<bdi>`.
 *
 * Server Components, no client JavaScript: every control is a link, a GET form or a native
 * `<details>`, so the page is identical with JavaScript off. Every string is a message key; the
 * components live with the page, not in `src/modules/ui` (§5.3).
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { SEARCH_PARAM } from "@/config/search";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  ChevronDown,
  Container,
  Display,
  GridProvenance,
  ListingGrid,
  assertSinglePriority,
} from "@/modules/ui";

import type { SearchPageView } from "../page";
import { type SearchGroupKind, searchGroupKinds } from "../schemas";

/** A private-use marker a message is formatted around, so one argument can become an element. */
const MARK = "";

/** `text` with the one `MARK` in it replaced by `node` (the translator sees the whole sentence). */
function around(text: string, node: ReactNode): ReactNode[] {
  const [before = "", after = ""] = text.split(MARK);
  return [before, <bdi key="q">{node}</bdi>, after];
}

/** The query as the board sets it in a heading or a sentence: the poppy italic (`emphasise`'s). */
function Query({ text }: { readonly text: string }): ReactElement {
  return <em className="display-em text-accent">{text}</em>;
}

type Hidden = readonly (readonly [string, string | undefined])[];

/** Hidden inputs for the parameters that have a value, in a fixed order. */
function HiddenInputs({ fields }: { readonly fields: Hidden }): ReactElement {
  return (
    <>
      {fields.flatMap(([name, value]) =>
        value === undefined || value === ""
          ? []
          : [<input key={name} name={name} type="hidden" value={value} />],
      )}
    </>
  );
}

const PILL =
  "inline-flex min-h-(--target-min) items-center rounded-full px-[14px] text-sm whitespace-nowrap no-underline";
const LINK_BUTTON =
  "text-link hover:text-link-strong inline-flex min-h-(--target-min) cursor-pointer items-center font-bold underline underline-offset-4";

/**
 * The "Sending to" chip (§14 A-founder-2026-11-08a item 1, AC-40): directly under the H1, server
 * HTML, two GET forms that keep the words. With a destination: `shop.chosen.line`, the change
 * form (a native `<select name="to">` of the shop countries and `product.destination.change`) and
 * the remove form (`search.chip.remove`, `q` alone minus the country words). With none: the change
 * form under `home.picker.label`. A choice loads the results directly and sets no cookie.
 */
function DestinationChip({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const shop = useTranslations("shop");
  const search = useTranslations("search");
  const home = useTranslations("home");
  const product = useTranslations("product");
  if (view.destinations.length === 0) return null;
  const destination = view.destination;
  const id = "search-to";
  return (
    <div
      className="mt-[12px] flex flex-wrap items-center gap-x-[12px] gap-y-[8px] max-md:grid max-md:justify-items-start"
      data-fo-search-chip={destination?.code ?? ""}
    >
      {destination === null ? null : (
        <p
          className="bg-card text-ink m-0 inline-flex min-h-(--target-min) items-center rounded-full ps-[14px] pe-[16px] text-sm whitespace-nowrap shadow-[inset_0_0_0_1.5px_var(--color-sky)]"
          data-fo-search-chip-line
        >
          {shop("chosen.line", { country: destination.name })}
        </p>
      )}
      <form
        action={view.path}
        className="m-0 inline-flex flex-wrap items-center gap-[8px]"
        data-fo-search-chip-change
        method="get"
      >
        <HiddenInputs fields={[[SEARCH_PARAM.q, view.result.query]]} />
        <label
          className={
            destination === null ? "text-ink-muted text-sm" : "sr-only"
          }
          htmlFor={id}
        >
          {home("picker.label")}
        </label>
        <span className="relative inline-flex items-center">
          <select
            className="bg-card text-ink min-h-(--target-min) min-w-[150px] cursor-pointer appearance-none rounded-full border-0 ps-[16px] pe-[34px] text-sm font-bold shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
            defaultValue={destination?.code ?? ""}
            id={id}
            name={SEARCH_PARAM.to}
            required
          >
            {destination === null ? (
              <option disabled value="">
                {search("chip.choose")}
              </option>
            ) : null}
            {view.destinations.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
          <ChevronDown className="text-ink-muted pointer-events-none absolute end-[14px]" />
        </span>
        <button
          className="bg-card text-ink inline-flex min-h-(--target-min) cursor-pointer items-center rounded-full border-0 px-[16px] text-sm font-bold whitespace-nowrap shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
          type="submit"
        >
          {product("destination.change")}
        </button>
      </form>
      {destination === null ? null : (
        <form
          action={view.path}
          className="m-0"
          data-fo-search-chip-remove
          method="get"
        >
          <HiddenInputs
            fields={[[SEARCH_PARAM.q, view.result.queryWithoutDestination]]}
          />
          <button className={LINK_BUTTON} type="submit">
            {search("chip.remove")}
          </button>
        </form>
      )}
    </div>
  );
}

/** Each link group's heading key (§14 A-founder-2026-11-08a item 1). */
const GROUP_HEADING = {
  destinations: "groups.destinations",
  occasions: "groups.occasions",
  categories: "groups.categories",
  help: "groups.help",
} as const satisfies Record<SearchGroupKind, string>;

/**
 * The link groups (§14 A-founder-2026-11-08a item 1): one band between two hairlines, each group
 * its eyebrow heading then its chips, in item 1's order, each drawn only when it has a match.
 */
function LinkGroups({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const search = useTranslations("search");
  const groups = searchGroupKinds.filter(
    (kind) => view.result.groups[kind].length > 0,
  );
  if (groups.length === 0) return null;
  return (
    <div
      className="border-rule mt-[16px] flex flex-wrap items-center gap-x-[40px] border-y py-[4px] max-md:block max-md:border-b-0 max-md:py-0"
      data-fo-search-groups={groups.join(" ")}
    >
      {groups.map((kind) => (
        <section
          aria-labelledby={`search-group-${kind}`}
          className="max-md:border-rule flex min-h-[52px] flex-wrap items-center gap-x-[14px] gap-y-[8px] py-[4px] max-md:gap-[8px] max-md:border-b max-md:py-[12px]"
          data-fo-search-group={kind}
          key={kind}
        >
          <h2
            className="label text-ink-subtle m-0 flex-none max-md:w-full"
            id={`search-group-${kind}`}
          >
            {search(GROUP_HEADING[kind])}
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-[8px] p-0">
            {view.result.groups[kind].map((link) => (
              <li key={link.href}>
                <a
                  className={`${PILL} bg-card text-ink gap-[9px] shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
                  href={link.href}
                >
                  <bdi>{link.label}</bdi>
                  <ChevronDown className="-rotate-90 rtl:rotate-90" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "How we sort" (§2.6): spec 043's native `<details data-fo-ranking-disclosure>`, closed in the
 * server HTML, the sentence in the HTML open or closed. On the "Bouquets" line, at its end; open,
 * it takes the line's full width and its sentence sits under it in normal flow.
 * `search.ranking.disclosure` (the sentence without the margin clause) until TASK-406 adds the
 * `ranking.margin_preference` flag: every band is 0 today, so it is the true sentence.
 */
function HowWeSort({
  label,
  sentence,
}: {
  readonly label: string;
  readonly sentence: string;
}): ReactElement {
  return (
    <details
      className="group open:basis-full open:text-end"
      data-fo-ranking-disclosure
    >
      <summary className="text-ink-muted group-open:text-ink inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[7px] text-sm whitespace-nowrap underline decoration-(--color-border-strong) underline-offset-4 md:px-[4px] md:no-underline [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="group-open:-scale-y-100" />
      </summary>
      <p
        className="rounded-field bg-paper-2 text-ink-muted mt-[8px] px-[18px] py-[14px] text-start text-sm leading-[1.5]"
        data-fo-ranking-sentence
      >
        {sentence}
      </p>
    </details>
  );
}

/** The quiet line's parts after the count, each its own element, dots between them. */
function QuietLine({
  count,
  parts,
}: {
  readonly count: string;
  readonly parts: readonly { key: string; text: string }[];
}): ReactElement {
  return (
    <p
      className="text-ink-muted text-fine m-0 mt-[6px] leading-[21px] md:text-sm md:leading-[22px]"
      data-fo-search-status
    >
      <span className="text-ink font-bold" data-fo-search-count>
        {count}
      </span>
      {parts.map((part) => (
        <span key={part.key}>
          <span aria-hidden="true" className="px-[8px]">
            ·
          </span>
          <span data-fo-search-status-part={part.key}>{part.text}</span>
        </span>
      ))}
    </p>
  );
}

/** "Browse by occasion": the header's occasion links, the existing labels. */
function BrowseOccasions({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const t = useTranslations();
  const search = useTranslations("search");
  if (view.occasions.length === 0) return null;
  return (
    <section
      aria-labelledby="search-occasions"
      className="pt-[32px] md:pt-[40px]"
      data-fo-search-occasions={view.occasions.length}
    >
      <Display as="h2" id="search-occasions" size="2xl">
        {search("browseOccasions")}
      </Display>
      <ul className="m-0 mt-[14px] flex list-none flex-wrap gap-[8px] p-0">
        {view.occasions.map((occasion) => (
          <li key={occasion.id}>
            <a
              className={`${PILL} bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
              href={occasion.href}
            >
              {occasion.label ??
                t(occasion.labelKey as Parameters<typeof t>[0])}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Our selection" (§2.7): the destination's first twelve in its default order, or the core range's. */
function OurSelection({
  view,
  priority,
}: {
  readonly view: SearchPageView;
  readonly priority: boolean;
}): ReactElement | null {
  const nav = useTranslations("nav");
  const selection =
    view.destination === null
      ? (view.result.countryLess?.selection ?? [])
      : view.result.selection;
  if (selection.length === 0) return null;
  return (
    <section
      aria-labelledby="search-selection"
      className="pt-[32px] md:pt-[48px]"
      data-fo-search-selection={selection.length}
    >
      <Display as="h2" id="search-selection" size="2xl">
        {nav("category.ourSelection")}
      </Display>
      <div className="mt-[16px]">
        <GridProvenance
          cards={selection}
          className="text-xs"
          locale={view.locale}
        />
        <ListingGrid
          cards={selection}
          chooser={view.destination === null}
          headingLevel="h3"
          locale={view.locale}
          priority={priority}
          provenance="grid"
        />
      </div>
    </section>
  );
}

/** "Previous page" and "Next page": GET forms, never a link with the query (AC-3). */
function SearchPagination({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const search = useTranslations("search");
  const shop = useTranslations("shop");
  const { page, pageCount, query, dateApplied } = view.result;
  if (pageCount <= 1) return null;
  const step = (target: number, label: string, key: string): ReactElement => (
    <form action={view.path} data-fo-search-step={key} method="get">
      <HiddenInputs
        fields={[
          [SEARCH_PARAM.q, query],
          [SEARCH_PARAM.to, view.destination?.code],
          [SEARCH_PARAM.date, dateApplied ?? undefined],
          [SEARCH_PARAM.page, target === 1 ? undefined : String(target)],
        ]}
      />
      <button
        className="text-ink bg-card inline-grid min-h-(--target-min) cursor-pointer place-items-center rounded-full px-[20px] text-sm font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
        type="submit"
      >
        {label}
      </button>
    </form>
  );
  return (
    <nav
      aria-label={shop("pagination.label")}
      className="mt-[28px] flex flex-wrap items-center gap-[12px]"
      data-fo-search-pagination={pageCount}
    >
      {page > 1 ? step(page - 1, search("previous"), "previous") : null}
      <span className="text-ink-muted text-sm">
        {shop("pagination.pageOf", {
          page: formatNumber(page, view.locale),
          total: formatNumber(pageCount, view.locale),
        })}
      </span>
      {page < pageCount ? step(page + 1, search("next"), "next") : null}
    </nav>
  );
}

/** The date line (§2.4, AC-15): how many cannot arrive on the date, and the same search without it. */
function HiddenByDate({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const search = useTranslations("search");
  const { dateApplied, hiddenByDate, query } = view.result;
  if (dateApplied === null || hiddenByDate === 0) return null;
  const date = formatDate(
    new Date(`${dateApplied}T12:00:00Z`),
    view.locale,
    "deliveryDate",
    "UTC",
  );
  return (
    <div
      className="flex flex-wrap items-center gap-x-[12px] pb-[16px] text-sm"
      data-fo-search-hidden-by-date={hiddenByDate}
    >
      <p className="text-ink-muted m-0">
        {search("hiddenByDate", { count: hiddenByDate, date })}
      </p>
      <form action={view.path} method="get">
        <HiddenInputs
          fields={[
            [SEARCH_PARAM.q, query],
            [SEARCH_PARAM.to, view.destination?.code],
          ]}
        />
        <button className={LINK_BUTTON} data-fo-search-any-date type="submit">
          {search("anyDate")}
        </button>
      </form>
    </div>
  );
}

/** "We found nothing for …", then "Did you mean …?" as a GET form button (§14 A item 2, AC-37). */
function NoResults({ view }: { readonly view: SearchPageView }): ReactElement {
  const search = useTranslations("search");
  const suggestion = view.result.didYouMean;
  return (
    <div className="grid gap-[8px] pt-[8px]" data-fo-search-no-results>
      <p className="text-ink m-0 text-[17px] leading-[1.45] md:text-[19px]">
        {around(
          search("noResults", { query: MARK }),
          <Query text={view.result.query} />,
        )}
      </p>
      {suggestion === null ? null : (
        <form action={view.path} data-fo-search-did-you-mean method="get">
          <HiddenInputs
            fields={[
              [SEARCH_PARAM.q, suggestion],
              [SEARCH_PARAM.to, view.destination?.code],
            ]}
          />
          <button className={LINK_BUTTON} type="submit">
            {around(search("didYouMean", { suggestion: MARK }), suggestion)}
          </button>
        </form>
      )}
    </div>
  );
}

export interface SearchResultsPageProps {
  readonly view: SearchPageView;
  /**
   * The "rate limited" state (§2.7, AC-26; TASK-403): the H1, `search.rateLimited` as a status
   * message, the chip (the header's field keeps the words), and nothing searched. The status
   * (429 or 503) and `Retry-After` are the proxy's.
   */
  readonly rateLimited?: boolean;
}

/** The "rate limited" state, the board's "Rate limited · HTTP 429" frame. */
function RateLimited({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement {
  const search = useTranslations("search");
  return (
    <Container as="main" data-fo-search-state="rateLimited" id="main">
      <div className="pt-[18px] pb-(--section-fluid)" data-fo-search>
        <Display
          as="h1"
          className="leading-[1.06] tracking-[-0.02em] [font-variation-settings:var(--font-variation-display-hero)]"
          size="display-s"
        >
          {search("heading")}
        </Display>
        <div
          className="mt-[8px] mb-[16px] grid max-w-[60ch] justify-items-start gap-[6px] md:mb-[20px]"
          data-fo-search-rate-limited
          role="status"
        >
          <p className="text-ink m-0 text-[17px] leading-[1.45] md:text-[19px]">
            {search("rateLimited")}
          </p>
        </div>
        <DestinationChip view={view} />
      </div>
    </Container>
  );
}

/**
 * The GA4 `search` event's payload (§8, AC-23; TASK-403): one hidden element's
 * `data-fo-analytics`, counts only, never the words. Spec 023's deferred chunk reads it and sends
 * it only with analytics granted (`sendPageAnalytics`).
 */
function SearchAnalytics({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  if (view.analytics === null) return null;
  return <div data-fo-analytics={JSON.stringify(view.analytics)} hidden />;
}

export function SearchResultsPage({
  view,
  rateLimited = false,
}: SearchResultsPageProps): ReactElement {
  if (rateLimited) return <RateLimited view={view} />;
  return <SearchResultsBody view={view} />;
}

function SearchResultsBody({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement {
  const t = useTranslations();
  const search = useTranslations("search");
  const shop = useTranslations("shop");
  const { result } = view;
  const countryLess = view.destination === null;
  const state = countryLess
    ? (result.countryLess?.state ?? "empty")
    : result.state === "results" ||
        result.state === "noResults" ||
        result.state === "tooShort"
      ? result.state
      : "empty";
  const results = state === "results";
  const cards = countryLess ? (result.countryLess?.cards ?? []) : result.cards;
  const linked = searchGroupKinds.some(
    (kind) => result.groups[kind].length > 0,
  );
  // "No results" means every group is empty (§14 A-founder-2026-11-08a item 1); when only link
  // groups match, they show, then "Our selection" as in the empty state.
  const nothing = state === "noResults" && !linked;

  // The page's one LCP candidate: the first card of the first grid on the page.
  const first = results ? cards[0] : undefined;
  assertSinglePriority(
    first !== undefined && first.photo.kind === "asset"
      ? [first.photo.assetId]
      : [],
  );

  const count =
    result.page > 1
      ? shop("toolbar.summary", {
          count: result.count,
          page: result.page,
          pageCount: result.pageCount,
        })
      : shop("toolbar.count", { count: result.count });
  const parts: { key: string; text: string }[] = [];
  if (view.destination !== null && result.page === 1) {
    if (!view.destination.orderingOpen) {
      parts.push({
        key: "state",
        text: t("destinations.state.guideNotDelivering"),
      });
    }
    parts.push({ key: "prices", text: t("nav.utility.pricesInclude") });
  }

  const noMoney = countryLess ? (
    <p
      className="text-ink-2 m-0 mt-[4px] mb-[18px] max-w-[64ch] text-xs leading-[1.4] md:text-sm md:leading-[1.45]"
      data-fo-hub-no-money=""
    >
      {shop("hub.noMoney")}
    </p>
  ) : null;

  return (
    <Container
      as="main"
      data-fo-search-state={countryLess ? `noDestination-${state}` : state}
      id="main"
    >
      <div className="pt-[18px] pb-(--section-fluid)" data-fo-search>
        <SearchAnalytics view={view} />
        <Display
          as="h1"
          className="leading-[1.06] tracking-[-0.02em] [font-variation-settings:var(--font-variation-display-hero)]"
          size="display-s"
        >
          {results || (linked && result.query !== "")
            ? around(
                search("resultsHeading", { query: MARK }),
                <Query text={result.query} />,
              )
            : search("heading")}
        </Display>
        {results && !countryLess ? (
          <QuietLine count={count} parts={parts} />
        ) : null}

        <DestinationChip view={view} />

        {state === "tooShort" ? (
          <p
            className="text-ink m-0 pt-[16px] pb-[8px] text-[17px]"
            data-fo-search-too-short
            role="status"
          >
            {search("tooShort")}
          </p>
        ) : null}

        <LinkGroups view={view} />
        {countryLess ? null : <HiddenByDate view={view} />}

        {results ? (
          <section
            aria-labelledby="search-results-heading"
            data-fo-search-results
          >
            <div
              className="mt-[22px] flex flex-wrap items-baseline justify-between gap-x-[16px] gap-y-[6px] max-md:mt-[24px]"
              data-fo-search-head
            >
              <Display as="h2" id="search-results-heading" size="lg">
                {search("groups.bouquets")}
              </Display>
              <div className="ms-auto flex flex-wrap items-center justify-end gap-x-[18px]">
                <span className="text-ink-muted text-sm" data-fo-search-count>
                  {count}
                </span>
                <HowWeSort
                  label={shop("toolbar.howWeSort")}
                  sentence={search("ranking.disclosure")}
                />
              </div>
            </div>
            {noMoney}
            <GridProvenance
              cards={cards}
              className="text-xs"
              locale={view.locale}
            />
            <ListingGrid
              cards={cards}
              chooser={countryLess}
              headingLevel="h3"
              locale={view.locale}
              priority
              provenance="grid"
            />
            <SearchPagination view={view} />
          </section>
        ) : (
          <>
            {nothing ? <NoResults view={view} /> : null}
            {countryLess ? <div className="pt-[24px]">{noMoney}</div> : null}
            {linked ? null : <BrowseOccasions view={view} />}
            <OurSelection priority view={view} />
          </>
        )}
      </div>
    </Container>
  );
}
