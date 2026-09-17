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
 * The numeral itself goes through an ICU `{page, number}` message rather than being interpolated
 * raw, so a locale that does not use Western Arabic digits gets its own (`CLAUDE.md`: `Intl` for
 * all formatting) and no component calls `Intl` directly.
 *
 * Server Component, no client bytes.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  /** The listing's unparameterised URL. Page 1 is this, exactly; page N is this + `?page=N`. */
  readonly baseHref: string;
}

/** `?page=N`, with page 1 as the bare URL (AC-10). The one place a listing page URL is built. */
export function pageHref(baseHref: string, page: number): string {
  return page <= 1 ? baseHref : `${baseHref}?page=${String(page)}`;
}

const LINK_CLASS = "border-rule rounded-sm border px-sm py-sm text-sm";

export function Pagination({
  page,
  pageCount,
  baseHref,
}: PaginationProps): ReactElement | null {
  const t = useTranslations("shop");
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav
      aria-label={t("pagination.label")}
      className="gap-sm flex flex-wrap items-center"
      data-fo-pagination={pageCount}
    >
      {page > 1 ? (
        <a className="px-sm py-sm text-sm" href={pageHref(baseHref, page - 1)}>
          {t("pagination.previous")}
        </a>
      ) : null}
      {pages.map((n) =>
        n === page ? (
          <b aria-current="page" className={`${LINK_CLASS} border-ink`} key={n}>
            {t("pagination.pageNumber", { page: n })}
          </b>
        ) : (
          // The visible text is the numeral; the accessible name says what the numeral means,
          // because "3" alone is not a link name (§5.3's accessibility paragraph).
          <a
            aria-label={t("pagination.page", { page: n })}
            className={LINK_CLASS}
            href={pageHref(baseHref, n)}
            key={n}
          >
            {t("pagination.pageNumber", { page: n })}
          </a>
        ),
      )}
      {page < pageCount ? (
        <a className="px-sm py-sm text-sm" href={pageHref(baseHref, page + 1)}>
          {t("pagination.next")}
        </a>
      ) : null}
    </nav>
  );
}
