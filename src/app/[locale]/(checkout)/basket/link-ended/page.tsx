/**
 * `/{locale}/basket/link-ended` (spec 034 §5.3, §14 item 3; AC-17, AC-31, AC-32; TASK-451): where
 * every ended reminder link lands, identical whatever the reason. A heading, one sentence and
 * "Choose flowers" to the locale home; no order or basket data. `noindex`, `no-store`; drawn in
 * `basket-reminder-pages-*.dc.html`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { localePath, routableLocale } from "@/modules/i18n";
import { transactionalMetadata } from "@/modules/seo";
import { checkoutButtonClass } from "@/modules/ui/checkout";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = routableLocale((await params).locale);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "checkout",
  });
  return transactionalMetadata("basket", t("basketReminder.linkEnded.title"));
}

export default async function LinkEndedPage({
  params,
}: Params): Promise<ReactElement> {
  const locale = routableLocale((await params).locale);
  if (locale === undefined) notFound();
  setRequestLocale(locale.code);
  const t = await getTranslations({
    locale: locale.code,
    namespace: "checkout",
  });
  return (
    <main
      className="mx-auto w-full max-w-(--wrap) px-(--gutter-s) md:px-(--gutter)"
      id="main"
    >
      <div
        className="grid max-w-[620px] gap-[14px] pt-[36px] pb-[64px] md:pt-[64px] md:pb-[96px]"
        data-fo-reminder-page="link-ended"
      >
        <h1
          className="display text-ink m-0 text-(length:--text-xl) leading-[1.15] focus:outline-none"
          tabIndex={-1}
        >
          {t("basketReminder.linkEnded.title")}
        </h1>
        <p className="text-ink-2 m-0">{t("basketReminder.linkEnded.body")}</p>
        <a
          className={checkoutButtonClass(
            "primary",
            "md",
            "justify-self-stretch md:justify-self-start",
          )}
          href={localePath(locale.code, "home")}
        >
          {t("basketReminder.linkEnded.cta")}
        </a>
      </div>
    </main>
  );
}
