/**
 * A blog post `/{locale}/blog/{slug}` (spec 044 §2.7, §5.3, AC-11, AC-12, AC-22; artboards
 * `blog-post-desktop.dc.html` and `blog-post-mobile.dc.html`; TASK-322).
 *
 * A Server Component with no client JavaScript (AC-14). One `<article>` on columns 3–10 of the
 * 12-column grid (one column on the phone): the breadcrumb (home, blog, the post), the `<h1>`,
 * the byline and the dates ("Published" always, "Updated" only when it differs, each in a
 * `<time datetime>`), spec 041's not-open line while no destination takes a date, the cover when
 * the revision has one (TASK-324), the excerpt, the body blocks, and one end-of-post link to the
 * first country tag's corridor guide where that guide exists. No price, no product card, no buy
 * control (§2.7). Every visible string is a message key (Appendix A, spec 041's reused key) or
 * post data; the dates arrive formatted.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Breadcrumbs, Container, Display } from "../../../ui/index.ts";
import { label } from "../../components/label.ts";
import type { BlogPostPageView } from "../view.ts";

import { BlogBody } from "./BlogBody.tsx";

export interface BlogPostPageProps {
  readonly view: BlogPostPageView;
  /** The cover figure, or nothing (TASK-324's `BlogCoverFigure`). */
  readonly cover?: ReactNode;
  /** Render inside the admin preview (§2.3): no `<main>` landmark of its own. */
  readonly preview?: boolean;
}

/** Columns 3–10 of 12 on desktop, the full measure on the phone (`.bp > *`). */
const COLUMN = "min-w-0 md:col-span-8 md:col-start-3";

/** Stands in for the date while the message is formatted, so the date can be a `<time>`. */
const DATE_SLOT = "⁣date⁣";

/**
 * "Published {date}" with the date as `<time datetime>` (AC-11): the message is formatted once
 * with a placeholder and split around it, so the words and their order stay the catalogue's in
 * every locale and only the date becomes an element.
 */
function withTime(
  text: string,
  date: { readonly iso: string; readonly text: string },
): ReactNode {
  const [before = "", after = ""] = text.split(DATE_SLOT);
  return (
    <>
      {before}
      <time dateTime={date.iso}>{date.text}</time>
      {after}
    </>
  );
}

export function BlogPostPage({
  view,
  cover,
  preview = false,
}: BlogPostPageProps): ReactElement {
  const t = useTranslations();
  const a11y = useTranslations("a11y");
  const article = (
    <article
      className="block pb-(--space-section-s) md:grid md:grid-cols-12 md:gap-x-[24px] md:pb-(--space-2xl)"
      data-fo-blog-post={view.slug}
    >
      <Breadcrumbs
        className={COLUMN}
        label={a11y("breadcrumb")}
        phone="trail"
        crumbs={view.breadcrumb.map((crumb) => ({
          key: crumb.labelKey,
          label:
            crumb.labelValue === undefined
              ? label(t, crumb.labelKey)
              : label(t, crumb.labelKey, { name: crumb.labelValue }),
          href: crumb.href,
          current: crumb.current,
        }))}
      />
      <header
        className={`${COLUMN} grid gap-[14px] pt-[18px] pb-[28px] md:gap-[18px] md:pt-[28px] md:pb-[36px]`}
      >
        <Display
          as="h1"
          size="title"
          className="max-md:text-3xl-s m-0 leading-(--line-height-heading)"
        >
          {view.title}
        </Display>
        <p
          className="text-ink-2 m-0 flex flex-wrap gap-x-[24px] gap-y-[4px] text-sm"
          data-fo-blog-meta
        >
          <span data-fo-blog-byline>
            {t("blog.post.byline", { name: view.authorName })}
          </span>
          <span data-fo-blog-published>
            {withTime(
              t("blog.post.published", { date: DATE_SLOT }),
              view.published,
            )}
          </span>
          {view.updated === undefined ? null : (
            <span data-fo-blog-updated>
              {withTime(
                t("blog.post.updated", { date: DATE_SLOT }),
                view.updated,
              )}
            </span>
          )}
        </p>
        {view.notYetOpen ? (
          <p
            className="bg-paper-2 border-sun text-ui text-ink m-0 max-w-(--measure) rounded-e-md border-s-[3px] px-[18px] py-[12px] leading-(--line-height-tight)"
            data-fo-not-yet-open
            role="note"
          >
            {t("infoPages.status.notYetOpen")}
          </p>
        ) : null}
      </header>
      {cover === undefined || cover === null ? null : (
        <div className={`${COLUMN} mb-[36px]`}>{cover}</div>
      )}
      <p
        className={`${COLUMN} text-lede-fluid text-ink-2 m-0 mb-[28px] max-w-(--measure) leading-[1.5]`}
        data-fo-blog-excerpt
      >
        {view.excerpt}
      </p>
      <div className={COLUMN}>
        <BlogBody blocks={view.blocks} />
      </div>
      {view.nextCorridor === undefined ? null : (
        <p
          className={`${COLUMN} border-rule m-0 mt-[40px] max-w-(--measure) border-t pt-[24px] md:mt-[48px]`}
          data-fo-blog-next={view.nextCorridor.iso2}
        >
          <a
            className="text-link hover:text-link-strong font-bold underline decoration-[1.5px] underline-offset-[5px]"
            href={view.nextCorridor.href}
          >
            {t("blog.post.nextCorridor", {
              country: label(t, view.nextCorridor.countryNameKey),
            })}
          </a>
        </p>
      )}
    </article>
  );
  return preview ? (
    <div data-fo-blog-preview>{article}</div>
  ) : (
    <Container as="main" id="main">
      {article}
    </Container>
  );
}
