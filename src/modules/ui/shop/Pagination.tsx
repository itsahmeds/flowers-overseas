/**
 * `Pagination` — real links in a labelled `<nav>` (spec 008 §2, §5.3, AC-10's render half;
 * TASK-108; `docs/design/system/components.dc.html`, "Pagination": first page, last page, single
 * page).
 *
 * **Every control is an `<a href>`.** No "load more", because a load-more button is a client fetch
 * and a page of products a crawler cannot see (`plan/02` §14); no `<button>`, because a page of a
 * listing is a URL. The current page is not a link — it is `<b aria-current="page">`, so a screen
 * reader is told where it is and a pointer is not offered the page it is already on.
 *
 * **Page 1 links to the bare URL.** `?page=1` is a 301 to the unparameterised URL (AC-10, owned by
 * the route), so this component never emits one: the first page's href is `baseHref`. That is the
 * same rule the canonical follows, applied to the link graph, so no crawler is ever offered a URL
 * that redirects.
 *
 * **A single-page listing renders nothing** — not a disabled control, not an empty `<nav>` (the
 * drawing's third state, and spec 004 §5.3's "a block whose data is missing renders nothing").
 *
 * The numeral itself goes through `formatNumber`, so a locale that does not use Western Arabic
 * digits gets its own (`CLAUDE.md`: `Intl` for all formatting) and no component reaches for `Intl`
 * itself. It is a *count*, not copy, so it is not a message key: a catalogue entry whose whole
 * value is one placeholder has no text for the pseudo-locale to mirror.
 *
 * **The phone's compact form** (spec 008 §14 **A16 (e)**; spec 004 §14 A24 clause 10 P3; TASK-187).
 * Below `md` the same `<nav>` displays "Page {page} of {total}", the next link as a pill reading
 * "Next page" and, from page 2 on, the previous link; the numbered links are hidden by CSS only,
 * so every page's `<a href>` stays in the one `<nav>` at every width (AC-10, AC-29). The step links
 * are one element each at both widths: each carries its desktop word and its phone words, one of
 * them `display: none`, so the accessible name is the text shown at that width.
 *
 * Server Component, no client bytes.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type LocaleCode } from "@/config/locales";
import { formatNumber } from "@/modules/i18n";

export interface PaginationProps {
  readonly locale: LocaleCode;
  readonly page: number;
  readonly pageCount: number;
  /** The listing's unparameterised URL. Page 1 is this, exactly; page N is this + `?page=N`. */
  readonly baseHref: string;
  /**
   * Query parameters a facet result carries from page to page (`price`, `colour`, `sort`;
   * TASK-390). With any, the pages are buttons of one `GET` form with these as hidden fields,
   * because no `<a href>` may carry `price=` or `colour=` (spec 008 AC-90); page 1's button sends
   * no `page`, so it lands on the facet's own first page rather than `?page=1`'s redirect.
   */
  readonly keep?: Readonly<Record<string, string>>;
}

/** `?page=N`, with page 1 as the bare URL (AC-10). The one place a listing page URL is built. */
export function pageHref(baseHref: string, page: number): string {
  return page <= 1 ? baseHref : `${baseHref}?page=${String(page)}`;
}

/**
 * v2 `.pager` (spec 004 §14 A21): 44 px pills — a card fill with a rule ring for a page link,
 * ink fill for the current page — and Previous/Next as cornflower underlined words.
 */
const PILL =
  "inline-grid place-items-center min-w-(--target-min) min-h-(--target-min) px-[12px] rounded-full no-underline font-medium";
const LINK_CLASS = `${PILL} bg-card shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`;
const CURRENT_CLASS = `${PILL} bg-ink text-paper`;
const STEP_CLASS =
  "inline-grid place-items-center min-h-(--target-min) px-[12px] text-link font-bold underline underline-offset-4 hover:text-link-strong";
/** The phone's next pill: a 44 px outlined pill on the end side (the phone artboards). */
const NEXT_PHONE_CLASS =
  "max-md:ms-auto max-md:rounded-full max-md:px-[20px] max-md:text-ink max-md:no-underline max-md:shadow-[inset_0_0_0_1.5px_var(--color-ink)]";

export function Pagination({
  locale,
  page,
  pageCount,
  baseHref,
  keep = {},
}: PaginationProps): ReactElement | null {
  const t = useTranslations("shop");
  if (pageCount <= 1) return null;
  const kept = Object.entries(keep);
  if (kept.length > 0) {
    return (
      <FormPagination
        baseHref={baseHref}
        kept={kept}
        label={t("pagination.label")}
        locale={locale}
        nextLabel={t("pagination.next")}
        page={page}
        pageCount={pageCount}
        pageLabel={(n) => t("pagination.page", { page: n })}
        pageOfLabel={t("pagination.pageOf", {
          page: formatNumber(page, locale),
          total: formatNumber(pageCount, locale),
        })}
        previousLabel={t("pagination.previous")}
      />
    );
  }

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav
      aria-label={t("pagination.label")}
      className="flex flex-wrap items-center gap-[6px] max-md:gap-[12px]"
      data-fo-pagination={pageCount}
    >
      {page > 1 ? (
        <a className={STEP_CLASS} href={pageHref(baseHref, page - 1)}>
          {t("pagination.previous")}
        </a>
      ) : null}
      {/* The phone's "Page 1 of 7" (P3): text, not a control. */}
      <span
        className="text-ink-muted text-sm md:hidden"
        data-fo-pagination-compact
      >
        {t("pagination.pageOf", {
          page: formatNumber(page, locale),
          total: formatNumber(pageCount, locale),
        })}
      </span>
      {pages.map((n) =>
        n === page ? (
          <b
            aria-current="page"
            className={`${CURRENT_CLASS} max-md:hidden`}
            key={n}
          >
            {formatNumber(n, locale)}
          </b>
        ) : (
          // The visible text is the numeral; the accessible name says what the numeral means,
          // because "3" alone is not a link name (§5.3's accessibility paragraph). Below `md` the
          // numbered links are hidden by CSS and stay in the HTML (spec 008 §14 A16 (e)).
          <a
            aria-label={t("pagination.page", { page: n })}
            className={`${LINK_CLASS} max-md:hidden`}
            href={pageHref(baseHref, n)}
            key={n}
          >
            {formatNumber(n, locale)}
          </a>
        ),
      )}
      {page < pageCount ? (
        <a
          className={`${STEP_CLASS} ${NEXT_PHONE_CLASS}`}
          data-fo-pagination-next
          href={pageHref(baseHref, page + 1)}
        >
          {/* "Next" at every width: P3's "Next page" waits for the founder's batch, because a
              fifth unreviewed key would take `en-gb` over spec 003's 5 % gate (TASK-187). */}
          {t("pagination.next")}
        </a>
      ) : null}
    </nav>
  );
}

/** A page button's `name`/`value`: none on page 1, so the form sends the kept fields alone. */
function pageField(n: number): { name?: string; value?: string } {
  return n <= 1 ? {} : { name: "page", value: String(n) };
}

/**
 * The same control as one `GET` form (a facet result, TASK-390): identical pills and order, each
 * page a submit button. Rendered by `Pagination` only; the labels are its translations.
 */
function FormPagination({
  baseHref,
  kept,
  label,
  locale,
  nextLabel,
  page,
  pageCount,
  pageLabel,
  pageOfLabel,
  previousLabel,
}: {
  readonly baseHref: string;
  readonly kept: readonly (readonly [string, string])[];
  readonly label: string;
  readonly locale: LocaleCode;
  readonly nextLabel: string;
  readonly page: number;
  readonly pageCount: number;
  readonly pageLabel: (n: number) => string;
  readonly pageOfLabel: string;
  readonly previousLabel: string;
}): ReactElement {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  return (
    <nav aria-label={label} data-fo-pagination={pageCount}>
      <form
        action={baseHref}
        className="flex flex-wrap items-center gap-[6px] max-md:gap-[12px]"
        method="get"
      >
        {kept.map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        {page > 1 ? (
          <button className={STEP_CLASS} type="submit" {...pageField(page - 1)}>
            {previousLabel}
          </button>
        ) : null}
        <span
          className="text-ink-muted text-sm md:hidden"
          data-fo-pagination-compact
        >
          {pageOfLabel}
        </span>
        {pages.map((n) =>
          n === page ? (
            <b
              aria-current="page"
              className={`${CURRENT_CLASS} max-md:hidden`}
              key={n}
            >
              {formatNumber(n, locale)}
            </b>
          ) : (
            <button
              aria-label={pageLabel(n)}
              className={`${LINK_CLASS} max-md:hidden`}
              key={n}
              type="submit"
              {...pageField(n)}
            >
              {formatNumber(n, locale)}
            </button>
          ),
        )}
        {page < pageCount ? (
          <button
            className={`${STEP_CLASS} ${NEXT_PHONE_CLASS}`}
            data-fo-pagination-next
            type="submit"
            {...pageField(page + 1)}
          >
            {nextLabel}
          </button>
        ) : null}
      </form>
    </nav>
  );
}
