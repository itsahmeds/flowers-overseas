/**
 * The blog index `/{locale}/blog` (spec 044 §2.7, §5.3; artboards `blog-index-desktop.dc.html`
 * and `blog-index-mobile.dc.html`; TASK-322).
 *
 * A Server Component with no client JavaScript (AC-14). A ruled list in the letter-home system,
 * newest first: the date on columns 1–2, the title (the row's only link, an `<h2>`) and the
 * excerpt on 3–8, and the cover thumbnail on 10–12 when the post has one (TASK-324). On the phone
 * the date sits above the text and the thumbnail is a 96 px square beside it. A row without a
 * cover keeps its columns, so rows with and without covers line up; no placeholder is ever drawn.
 * Every visible string is a message key (Appendix A) or post data; dates arrive formatted.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Breadcrumbs, Container, Display } from "../../../ui/index.ts";
import { label } from "../../components/label.ts";
import type { BlogIndexPageView } from "../view.ts";

export interface BlogIndexPageProps {
  readonly view: BlogIndexPageView;
  /** The cover thumbnail of one row, or nothing (TASK-324's `BlogCoverThumb`). */
  readonly thumbnail?: (postId: string) => ReactNode;
}

export function BlogIndexPage({
  view,
  thumbnail,
}: BlogIndexPageProps): ReactElement {
  const t = useTranslations();
  const a11y = useTranslations("a11y");
  return (
    <Container
      as="main"
      id="main"
      className="pb-(--space-2xl)"
      data-fo-blog-index={view.locale}
    >
      <Breadcrumbs
        label={a11y("breadcrumb")}
        phone="trail"
        crumbs={view.breadcrumb.map((crumb) => ({
          key: crumb.labelKey,
          label: label(t, crumb.labelKey),
          href: crumb.href,
          current: crumb.current,
        }))}
      />
      <header className="grid gap-[12px] pt-[20px] pb-[28px] md:gap-[16px] md:pt-[28px] md:pb-[44px]">
        <Display
          as="h1"
          size="display"
          className="max-md:text-display-s m-0 leading-(--line-height-display)"
        >
          {t("blog.index.h1")}
        </Display>
        <p className="text-body text-ink-2 m-0 max-w-[46ch] leading-[1.5] md:text-[21px]">
          {t("blog.index.intro")}
        </p>
      </header>
      <ol className="border-rule m-0 list-none border-t p-0" data-fo-blog-list>
        {view.entries.map((entry) => {
          const cover = thumbnail?.(entry.postId);
          return (
            <li key={entry.postId}>
              <article
                className="border-rule grid grid-cols-[minmax(0,1fr)_96px] items-start gap-x-[16px] gap-y-[8px] border-b py-[22px] md:grid-cols-12 md:gap-x-[24px] md:gap-y-0 md:py-[32px]"
                data-fo-blog-entry={entry.slug}
              >
                <p className="text-ink-3 col-span-full row-start-1 m-0 text-sm md:col-span-2 md:col-start-1 md:pt-[8px]">
                  <time dateTime={entry.published.iso}>
                    {entry.published.text}
                  </time>
                </p>
                <div className="col-start-1 row-start-2 grid content-start gap-[8px] md:col-span-6 md:col-start-3 md:row-start-1 md:gap-[10px]">
                  <h2 className="display text-h3 m-0 leading-(--line-height-title) md:text-xl">
                    <a
                      className="text-ink no-underline decoration-[1.5px] underline-offset-[5px] hover:underline"
                      href={entry.href}
                    >
                      {entry.title}
                    </a>
                  </h2>
                  <p className="text-ink-2 md:text-body m-0 max-w-[58ch] text-sm">
                    {entry.excerpt}
                  </p>
                </div>
                {cover === undefined || cover === null ? null : (
                  <div className="col-start-2 row-start-2 md:col-span-3 md:col-start-10 md:row-start-1">
                    {cover}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </Container>
  );
}
