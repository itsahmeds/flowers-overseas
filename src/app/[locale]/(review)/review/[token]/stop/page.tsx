/**
 * @purpose Review emails opt-out page
 * @spec 022a
 *
 * `/{locale}/review/{token}/stop` (spec 022a §2, §5.3; AC-15; artboard `review-form-*`, "Opt-out";
 * TASK-371): the page behind B9's "Stop these emails." link. A `GET` changes nothing (link scanners
 * fetch links): one button posts `optOutAction`, which lands on `…/review/done/stop`, the done text,
 * the same for a known and an unknown token. `noindex`, `no-store`, `no-referrer`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { routableLocale } from "@/modules/i18n";
import { transactionalMetadata } from "@/modules/seo";
import { checkoutButtonClass } from "@/modules/ui/checkout";

import { optOutAction } from "../actions";
import { STOPPED } from "../review-routes";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = routableLocale((await params).locale);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "reviews",
  });
  return transactionalMetadata("trackOrder", t("stop.title"));
}

export default async function ReviewStopPage({
  params,
}: Params): Promise<ReactElement> {
  const { locale: requested, token } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) notFound();
  setRequestLocale(locale.code);
  const t = await getTranslations({
    locale: locale.code,
    namespace: "reviews",
  });
  const page =
    "grid max-w-[620px] gap-[14px] pt-[36px] pb-[64px] md:pt-[64px] md:pb-[96px]";
  const heading =
    "display m-0 text-(length:--text-xl) leading-[1.15] text-ink focus:outline-none";
  return (
    <main
      className="mx-auto w-full max-w-(--wrap) px-(--gutter-s) md:px-(--gutter)"
      id="main"
    >
      {token === STOPPED ? (
        <div className={page} data-fo-review-page="stop-done">
          <h1 className={heading} tabIndex={-1}>
            {t("stop.doneTitle")}
          </h1>
          <p className="text-ink-2 m-0" role="status">
            {t("stop.doneBody")}
          </p>
        </div>
      ) : (
        <form
          action={optOutAction.bind(null, locale.code, token)}
          className={page}
          data-fo-review-page="stop"
        >
          <h1 className={heading}>{t("stop.title")}</h1>
          <p className="text-ink-2 m-0">{t("stop.body")}</p>
          <button
            className={checkoutButtonClass(
              "primary",
              "md",
              "justify-self-stretch md:justify-self-start",
            )}
            type="submit"
          >
            {t("stop.button")}
          </button>
        </form>
      )}
    </main>
  );
}
