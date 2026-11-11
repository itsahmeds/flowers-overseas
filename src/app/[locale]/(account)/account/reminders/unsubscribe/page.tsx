/**
 * @purpose The occasion reminder's stop page: confirm, then done
 * @spec 018
 *
 * `/{locale}/account/reminders/unsubscribe?t=` (`account-reminders-*` "Unsubscribe"; spec 018 §14
 * A-founder-2026-10-22 C.7.4, C.13; AC-58; TASK-353): the page behind T18's visible "Stop
 * reminders" link. No session needed. A `GET` changes nothing (link scanners fetch links): "Stop
 * reminders?" and one button that posts the server action, which lands on `?state=done`, the done
 * text, identical for a valid and a forged, unknown or rotated token ("link not valid": the same
 * page, nothing changed). It answers with every flag off, so a stop link always works.
 * `noindex`, `no-store` (the account's header rules).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { transactionalMetadata } from "@/modules/seo";
import { buttonClass } from "@/modules/ui/checkout/styles";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

import { accountLocale } from "../../_parts/account-request";
import { stopRemindersAction } from "./actions";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const QuerySchema = z.object({
  t: z.string().max(512).catch("").default(""),
  state: z.enum(["done"]).nullable().catch(null).default(null),
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return transactionalMetadata("trackOrder", t("reminders.unsubscribeTitle"));
}

export default async function ReminderUnsubscribePage({
  params,
  searchParams,
}: Params): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "account" });
  const query = QuerySchema.parse(await searchParams);
  const page =
    "grid max-w-[620px] gap-[14px] pt-[36px] pb-[64px] md:pt-[64px] md:pb-[96px]";
  const heading =
    "display m-0 text-(length:--text-xl) leading-[1.15] text-ink focus:outline-none";
  return (
    <main className={PAGE_FRAME} id="main">
      {query.state === "done" ? (
        <div className={page} data-fo-reminders-unsubscribe="done">
          <h1 className={heading} tabIndex={-1}>
            {t("reminders.unsubscribeDoneTitle")}
          </h1>
          <p className="text-ink-2 m-0" role="status">
            {t("reminders.unsubscribeDone")}
          </p>
        </div>
      ) : (
        <form
          action={stopRemindersAction.bind(null, locale, query.t)}
          className={page}
          data-fo-reminders-unsubscribe="confirm"
        >
          <h1 className={heading}>{t("reminders.unsubscribeTitle")}</h1>
          <button
            className={buttonClass(
              "primary",
              "md",
              "justify-self-stretch md:justify-self-start",
            )}
            type="submit"
          >
            {t("reminders.unsubscribeButton")}
          </button>
        </form>
      )}
    </main>
  );
}
