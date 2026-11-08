/**
 * `/{locale}/basket/unsubscribe/{token}` (spec 034 §5.2 "Unsubscribe", §5.3, §14 item 3; AC-20,
 * AC-31, AC-32; TASK-451): the page behind the email's visible "Stop basket emails" link. A `GET`
 * changes nothing (corporate link scanners fetch links): one button posts the server action, which
 * lands on `…/unsubscribe/done`, the done text, identical for a valid and an unknown token. Works
 * with JavaScript off and with the flag off. `noindex`, `no-store`; drawn in
 * `basket-reminder-pages-*.dc.html`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { routableLocale } from "@/modules/i18n";
import { transactionalMetadata } from "@/modules/seo";
import { checkoutButtonClass } from "@/modules/ui/checkout";

import { unsubscribeAction } from "./actions";

export const dynamic = "force-dynamic";

/** The done state's path segment: never a token (a token is 43 characters). */
const DONE = "done";

interface Params {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = routableLocale((await params).locale);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "checkout",
  });
  return transactionalMetadata("basket", t("basketReminder.unsubscribe.title"));
}

export default async function UnsubscribePage({
  params,
}: Params): Promise<ReactElement> {
  const { locale: requested, token } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) notFound();
  setRequestLocale(locale.code);
  const t = await getTranslations({
    locale: locale.code,
    namespace: "checkout",
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
      {token === DONE ? (
        <div className={page} data-fo-reminder-page="unsubscribe-done">
          <h1 className={heading} tabIndex={-1}>
            {t("basketReminder.unsubscribe.title")}
          </h1>
          <p className="text-ink-2 m-0" role="status">
            {t("basketReminder.unsubscribe.done")}
          </p>
        </div>
      ) : (
        <form
          action={unsubscribeAction.bind(null, locale.code, token)}
          className={page}
          data-fo-reminder-page="unsubscribe"
        >
          <h1 className={heading}>{t("basketReminder.unsubscribe.title")}</h1>
          <p className="text-ink-2 m-0">
            {t("basketReminder.unsubscribe.body")}
          </p>
          <button
            className={checkoutButtonClass(
              "primary",
              "md",
              "justify-self-stretch md:justify-self-start",
            )}
            type="submit"
          >
            {t("basketReminder.unsubscribe.button")}
          </button>
        </form>
      )}
    </main>
  );
}
