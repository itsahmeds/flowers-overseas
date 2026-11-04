/**
 * The search results page (spec 045 §2.2, §2.6, §2.7, §5.3, §6; TASK-402;
 * `docs/design/wireframes/search-results-desktop.dc.html` and `-mobile`).
 *
 * The board's order, top to bottom: the H1 (`search.resultsHeading` with the query in the poppy
 * italic inside `<bdi>` when there are results, `search.heading` otherwise, so the query is never
 * said twice); the quiet line (the count, then while ordering is not open "Ordering opens soon",
 * then the prices line: the listing head's own parts, so a `demo` destination reads as its
 * listing); one toolbar row (the search form at the start; "How we sort" and the destination
 * pill at the end; on a phone the count and "How we sort" share a row, then the form and the pill
 * full width); the Pages chips; the grid; the GET-form pager. With no destination, the board's
 * frame 3: `shop.hub.noMoney` once, the chooser inline carrying the words, country-less cards.
 *
 * **No `href` here carries the query** (§6, AC-3): "Did you mean", "Show every date", Previous
 * and Next are submit buttons of small GET forms whose hidden inputs carry `q`, `to`, `date` and
 * `page`. Every other link is a hub, a product or the chooser, none with a query string. The query
 * is printed only as text inside `<bdi>`.
 *
 * Server Components, no client JavaScript: every control is a link, a GET form or a native
 * `<details>`, so the page is identical with JavaScript off. Every string is a message key; the
 * components live with the page, not in `src/modules/ui` (§5.3).
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { SEARCH_CONFIG, SEARCH_PARAM } from "@/config/search";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  ChevronDown,
  Container,
  CountryPicker,
  Display,
  GridProvenance,
  Icon,
  ListingGrid,
  VisuallyHidden,
  assertSinglePriority,
} from "@/modules/ui";

import type { SearchPageView } from "../page";

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

/** The search form (§2.2): the first control in `<main>`, no `autofocus`, `q` filled in. */
function SearchForm({
  view,
  label,
  submit,
}: {
  readonly view: SearchPageView;
  readonly label: string;
  readonly submit: string;
}): ReactElement {
  const id = "search-q";
  return (
    <form
      action={view.path}
      aria-label={label}
      className="bg-card relative flex min-h-[54px] w-full items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--color-focus) md:max-w-[640px]"
      data-fo-search-form
      method="get"
      role="search"
    >
      <span aria-hidden="true" className="text-ink-muted ps-[18px]">
        <Icon name="search" size={18} />
      </span>
      <span className="relative flex min-w-0 flex-1 items-center">
        <input
          className="peer text-ui text-ink min-h-[50px] w-full min-w-0 border-0 bg-transparent ps-[10px] pe-[8px] outline-none [&::-webkit-search-cancel-button]:hidden"
          defaultValue={view.result.query}
          id={id}
          maxLength={SEARCH_CONFIG.maxQueryChars}
          name={SEARCH_PARAM.q}
          placeholder=" "
          type="search"
        />
        {/* The visible hint is the label itself, which is also the field's accessible name
            (`<label for>`); typed, it steps out of sight and stays the name (the board's
            "Field focused, typed"). */}
        <label
          className="text-ink-subtle md:text-ui pointer-events-none absolute inset-y-0 start-[10px] end-[8px] flex items-center truncate text-sm peer-[:not(:placeholder-shown)]:sr-only"
          htmlFor={id}
        >
          {label}
        </label>
      </span>
      <HiddenInputs
        fields={[
          [SEARCH_PARAM.to, view.destination?.code],
          [SEARCH_PARAM.date, view.result.dateApplied ?? undefined],
        ]}
      />
      <button
        className="bg-ink text-paper me-[5px] inline-grid min-h-[44px] shrink-0 cursor-pointer place-items-center rounded-full px-[20px] text-sm font-bold"
        type="submit"
      >
        {submit}
      </button>
    </form>
  );
}

/** The destination pill (§2.2): a GET form with the words and the select; no island. */
function DestinationForm({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const product = useTranslations("product");
  const destination = view.destination;
  if (destination === null) return null;
  const id = "search-to";
  return (
    <form
      action={view.path}
      className="border-border-strong bg-card inline-flex min-h-(--target-min) w-full max-w-full items-center gap-[6px] rounded-full border ps-[14px] pe-[6px] md:w-auto md:gap-[8px] md:ps-[16px]"
      data-fo-search-destination={destination.code}
      method="get"
    >
      <HiddenInputs fields={[[SEARCH_PARAM.q, view.result.query]]} />
      <label
        className="text-ink-subtle text-fine whitespace-nowrap md:text-sm"
        htmlFor={id}
      >
        {product("destination.label")}
      </label>
      <span className="relative inline-flex min-w-0 flex-1 items-center md:flex-none">
        <select
          className="text-ink text-ui min-h-[40px] w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent py-0 ps-0 pe-[18px] font-bold"
          defaultValue={destination.code}
          id={id}
          name={SEARCH_PARAM.to}
        >
          {view.destinations.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <ChevronDown className="text-ink-muted pointer-events-none absolute end-[2px]" />
      </span>
      <button
        className="text-ink bg-card inline-grid min-h-[36px] shrink-0 cursor-pointer place-items-center rounded-full px-[12px] text-sm font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
        type="submit"
      >
        {product("destination.change")}
      </button>
    </form>
  );
}

/**
 * "How we sort" (§2.6): spec 043's native `<details data-fo-ranking-disclosure>`, closed in the
 * server HTML, the sentence in the HTML open or closed, its panel in normal flow under the toolbar
 * row. `search.ranking.disclosure` (the sentence without the margin clause) until TASK-406 adds
 * the `ranking.margin_preference` flag: every band is 0 today, so it is the true sentence.
 */
function HowWeSort({
  label,
  sentence,
}: {
  readonly label: string;
  readonly sentence: string;
}): ReactElement {
  const place =
    "col-start-2 row-start-2 self-center justify-self-end md:col-start-2 md:row-start-2";
  return (
    <details
      className={`group ${place} open:col-span-full open:row-start-5 open:justify-self-stretch supports-[selector(::details-content)]:contents [&::details-content]:col-span-full [&::details-content]:row-start-5 [&:not([open])::details-content]:hidden`}
      data-fo-ranking-disclosure
    >
      <summary
        className={`${place} text-ink-muted group-open:text-ink inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[7px] text-sm whitespace-nowrap underline decoration-(--color-border-strong) underline-offset-4 md:px-[4px] md:no-underline [&::-webkit-details-marker]:hidden`}
      >
        {label}
        <ChevronDown className="group-open:-scale-y-100" />
      </summary>
      <p
        className="rounded-field bg-paper-2 text-ink-muted mt-[8px] px-[18px] py-[14px] text-sm leading-[1.5]"
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
      className="text-ink-muted text-fine col-span-full row-start-1 mt-[6px] leading-[21px] md:text-sm md:leading-[22px]"
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

/** The Pages block (§2.3): at most three chips, each a page that answers 200. */
function PagesBlock({
  view,
}: {
  readonly view: SearchPageView;
}): ReactElement | null {
  const search = useTranslations("search");
  const pages = view.result.pages;
  if (pages.length === 0) return null;
  return (
    <nav
      aria-labelledby="search-pages"
      className="flex flex-wrap items-center gap-[8px] pb-[20px]"
      data-fo-search-pages={pages.length}
    >
      <span className="label text-ink-subtle me-[4px]" id="search-pages">
        {search("pagesHeading")}
      </span>
      {pages.map((page) => (
        <a
          className={`${PILL} bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
          data-fo-search-page={page.kind}
          href={page.href}
          key={page.href}
        >
          {page.label ?? view.destination?.name ?? ""}
        </a>
      ))}
    </nav>
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
   * message, the form with the words and the destination pill, and nothing searched. The status
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
  const nav = useTranslations("nav");
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
        <div className="grid items-center gap-[12px] md:grid-cols-[minmax(0,1fr)_auto]">
          <SearchForm
            label={nav("search.label")}
            submit={nav("search.submit")}
            view={view}
          />
          <DestinationForm view={view} />
        </div>
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
  const home = useTranslations("home");
  const nav = useTranslations("nav");
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
          {results
            ? around(
                search("resultsHeading", { query: MARK }),
                <Query text={result.query} />,
              )
            : search("heading")}
        </Display>

        <div
          className="mb-[16px] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[8px] gap-y-[12px] md:mb-[20px] md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-x-[12px]"
          data-fo-search-head
        >
          {results ? <QuietLine count={count} parts={parts} /> : null}
          <div
            className={`col-span-full ${results ? "row-start-3" : "row-start-2"} md:col-span-1 md:col-start-1 md:row-start-2`}
          >
            <SearchForm
              label={nav("search.label")}
              submit={nav("search.submit")}
              view={view}
            />
          </div>
          {results ? (
            <HowWeSort
              label={shop("toolbar.howWeSort")}
              sentence={search("ranking.disclosure")}
            />
          ) : null}
          {countryLess ? null : (
            <div
              className={`col-span-full ${results ? "row-start-4" : "row-start-3"} md:col-span-1 md:col-start-3 md:row-start-2`}
            >
              <DestinationForm view={view} />
            </div>
          )}
          <div
            className="border-rule col-span-full row-start-6 border-b max-md:hidden"
            data-fo-search-rule
          />
        </div>

        {state === "tooShort" ? (
          <p
            className="text-ink m-0 pb-[8px] text-[17px]"
            data-fo-search-too-short
            role="status"
          >
            {search("tooShort")}
          </p>
        ) : null}

        {countryLess && view.picker !== null ? (
          <div
            className="grid max-w-[820px] gap-[12px] pb-[28px]"
            data-fo-search-chooser
          >
            <p
              className="text-ink-2 m-0 max-w-[64ch] text-xs leading-[1.4] md:text-sm md:leading-[1.45]"
              data-fo-hub-no-money=""
            >
              {shop("hub.noMoney")}
            </p>
            <div className="max-w-[640px]">
              <CountryPicker
                action={view.picker.action}
                chips={view.picker.chips}
                datalist={view.picker.datalist}
                hidden={
                  result.query === ""
                    ? []
                    : [{ name: SEARCH_PARAM.q, value: result.query }]
                }
                idPrefix="search-picker"
                label={home("picker.label")}
                rememberLine={shop("choose.remember")}
                searchLabel={home("picker.search")}
                submitLabel={home("picker.submit")}
                variant="flat"
              />
            </div>
          </div>
        ) : null}

        <PagesBlock view={view} />
        {countryLess ? null : <HiddenByDate view={view} />}

        {results ? (
          <section
            aria-labelledby="search-results-heading"
            data-fo-search-results
          >
            <VisuallyHidden as="h2" id="search-results-heading">
              {count}
            </VisuallyHidden>
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
            {state === "noResults" ? <NoResults view={view} /> : null}
            <BrowseOccasions view={view} />
            <OurSelection priority view={view} />
          </>
        )}
      </div>
    </Container>
  );
}
