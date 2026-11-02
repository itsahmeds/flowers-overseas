/**
 * The head band of the walkthrough and the application (spec 011; `.p11-head`; TASK-210): the
 * breadcrumb, the "For florists" eyebrow, the `<h1>`, the untranslated line on a draft, the intro.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { InfoPageView } from "@/modules/content";
import { Breadcrumbs } from "@/modules/ui";

import { label } from "../inbox/format.ts";

export interface PageHeadCrumb {
  readonly key: string;
  readonly label: string;
  readonly href?: string | undefined;
  readonly current: boolean;
}

export interface PageHeadProps {
  readonly crumbs: readonly PageHeadCrumb[];
  readonly h1: string;
  readonly intro?: string | undefined;
  /** A machine draft: `infoPages.status.untranslated` under the `<h1>`. */
  readonly untranslated: boolean;
}

/** An info page's head from its view model (the walkthrough). */
export function PageHead({
  page,
}: {
  readonly page: InfoPageView;
}): ReactElement {
  const t = useTranslations();
  return (
    <PageHeadBand
      crumbs={page.breadcrumb.map((crumb) => ({
        key: crumb.labelKey,
        label:
          crumb.labelValue === undefined
            ? label(t, crumb.labelKey)
            : label(t, crumb.labelKey, { name: crumb.labelValue }),
        href: crumb.href,
        current: crumb.current,
      }))}
      h1={page.h1}
      intro={page.intro}
      untranslated={page.untranslated}
    />
  );
}

export function PageHeadBand({
  crumbs,
  h1,
  intro,
  untranslated,
}: PageHeadProps): ReactElement {
  const t = useTranslations();
  return (
    <section className="bg-paper-2 border-rule border-b" data-fo-page-head>
      <div className="mx-auto grid w-full max-w-[calc(var(--container-page)+2*var(--gutter))] grid-cols-1 px-(--gutter-s) pt-[4px] pb-[32px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:px-(--gutter) md:pt-[8px] md:pb-[48px] [&>*]:md:col-span-8">
        <Breadcrumbs label={t("a11y.breadcrumb")} crumbs={crumbs} />
        <p className="text-eyebrow m-0 mt-[18px] mb-[12px] text-xs font-bold tracking-(--tracking-label) uppercase">
          {t("nav.forFlorists")}
        </p>
        <h1 className="font-display md:text-title-fluid m-0 text-[40px] leading-(--line-height-display) font-normal tracking-[-0.02em]">
          {h1}
        </h1>
        {untranslated ? (
          <p
            className="text-ink-2 border-sun m-0 mt-[14px] max-w-[60ch] border-s-[3px] ps-[12px] text-sm"
            data-fo-untranslated
          >
            {t("infoPages.status.untranslated")}
          </p>
        ) : null}
        {intro === undefined ? null : (
          <p className="text-lede-fluid text-ink-2 m-0 mt-[16px] max-w-[56ch] leading-[1.5]">
            {intro}
          </p>
        )}
      </div>
    </section>
  );
}
