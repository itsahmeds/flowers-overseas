/**
 * @purpose Review form: the buyer's one review of a delivered order
 * @spec 022a
 *
 * `/{locale}/review/{token}` (spec 022a §2 "The review form", §5.3, §5.4, §6, §8; AC-12 to AC-14,
 * AC-31; artboard `review-form-{desktop,mobile}.dc.html`; TASK-371). A `GET` reads the invite and
 * writes nothing (mail scanners open links); `?r=1` to `5` preselects the star chosen in the
 * email. The `POST` is `submitReviewAction`. Expired and unknown links render one page, so the page
 * is no token oracle. SSR per request; `next.config.ts` adds `X-Robots-Tag: noindex, nofollow`,
 * `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` (`reviewHeaderRules()`);
 * the metadata is `transactionalMetadata()`. Server HTML only: no client island (§5.4), so the
 * grapheme limit is a hint and the server prints the count when it refuses (the artboard's E1).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import { countryConfig } from "@/config/countries";
import { isLocaleCode, type LocaleCode } from "@/config/locales";
import {
  REVIEW_INVITE_LIFE_DAYS,
  REVIEW_TEXT_MAX_CHARACTERS,
  REVIEW_TEXT_MAX_GRAPHEMES,
} from "@/config/reviews";
import { lineDisplay } from "@/modules/catalog";
import { formatDate, localePath, routableLocale } from "@/modules/i18n";
import { withExecutor } from "@/modules/orders";
import {
  type ReviewFormOrder,
  reviewFormState,
  reviewPolicyPath,
} from "@/modules/reviews";
import { transactionalMetadata } from "@/modules/seo";
import { MediaAsset, StarRadioGroup } from "@/modules/ui";
import { checkoutButtonClass } from "@/modules/ui/checkout";

import { submitReviewAction } from "./actions";
import { THANKS, formErrorOf } from "./review-routes";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MAIN = "mx-auto w-full max-w-(--wrap) px-(--gutter-s) md:px-(--gutter)";
const PAGE =
  "grid max-w-[620px] gap-[18px] pt-[36px] pb-[64px] md:pt-[64px] md:pb-[96px]";
const HEADING =
  "display m-0 text-(length:--text-xl) leading-[1.15] text-ink focus:outline-none";
const LINK = "text-link font-bold underline underline-offset-4";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = routableLocale((await params).locale);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "reviews",
  });
  return transactionalMetadata("trackOrder", t("form.heading"));
}

async function OrderLine({
  order,
  locale,
}: {
  readonly order: ReviewFormOrder;
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "reviews" });
  const tCatalog = (await getTranslations({ locale })) as unknown as (
    key: string,
    values?: Record<string, number>,
  ) => string;
  const display =
    order.productSku === null || order.tierKey === null
      ? null
      : await lineDisplay({
          sku: order.productSku,
          tierKey: order.tierKey,
          addonKeys: [],
          countryIso: countryConfig(order.countryIso2 as never).iso2,
          locale,
        }).catch(() => null);
  // A calendar date: noon UTC, so no zone moves it to another day.
  const date = formatDate(
    new Date(`${order.deliveryDate}T12:00:00Z`),
    locale,
    "weekdayDayMonth",
    "UTC",
  );
  const delivered =
    order.city === null
      ? t("form.deliveredNoCity", { date })
      : t("form.delivered", { date, city: order.city });
  const tier =
    display?.tier === null || display?.tier === undefined
      ? null
      : tCatalog(
          display.tier.labelKey,
          display.tier.stems === null ? {} : { count: display.tier.stems },
        );
  return (
    <div className="flex items-center gap-[14px]" data-fo-review-order="">
      {display?.photo === null || display?.photo === undefined ? null : (
        <div className="w-[72px] shrink-0">
          <MediaAsset
            assetId={display.photo.assetId}
            locale={locale}
            productName={display.name ?? ""}
            ratio="card"
            slot="thumb"
          />
        </div>
      )}
      <p className="text-ink-2 m-0 text-[15px]">
        {display?.name === null || display?.name === undefined ? null : (
          <>
            <span className="display text-ink text-[19px]">
              {display.name}
            </span>{" "}
          </>
        )}
        {tier === null ? null : <>{tier} · </>}
        <bdi>{delivered}</bdi>
      </p>
    </div>
  );
}

export default async function ReviewFormPage({
  params,
  searchParams,
}: Params): Promise<ReactElement> {
  const { locale: requested, token } = await params;
  const query = await searchParams;
  const routable = routableLocale(requested);
  if (routable === undefined || !isLocaleCode(routable.code)) notFound();
  const locale = routable.code;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "reviews" });
  const home = localePath(locale, "home");

  if (token === THANKS) {
    return (
      <main className={MAIN} id="main">
        <div className={PAGE} data-fo-review-page="thanks">
          <h1 className={HEADING} tabIndex={-1}>
            {t("form.thanksTitle")}
          </h1>
          <p className="text-ink-2 m-0" role="status">
            {t("form.thanksBody")}
          </p>
          <p className="m-0">
            <a className={LINK} href={home}>
              {t("form.home")}
            </a>
          </p>
        </div>
      </main>
    );
  }

  const state = await withExecutor(undefined, "review.form", (executor) =>
    reviewFormState(executor, token, new Date()),
  );

  if (state.kind === "used") {
    return (
      <main className={MAIN} id="main">
        <div className={PAGE} data-fo-review-page="used">
          <h1 className={HEADING}>{t("form.usedTitle")}</h1>
          <p className="text-ink-2 m-0">{t("form.usedBody")}</p>
        </div>
      </main>
    );
  }

  if (state.kind === "gone") {
    return (
      <main className={MAIN} id="main">
        <div className={PAGE} data-fo-review-page="gone">
          <h1 className={HEADING}>{t("form.goneTitle")}</h1>
          <p className="text-ink-2 m-0">
            {t("form.goneBody", { days: REVIEW_INVITE_LIFE_DAYS })}
          </p>
          <p className="m-0">
            <a
              className={checkoutButtonClass("ghost", "md")}
              href={whatsappHref(COMPANY.contact)}
              rel="noopener"
            >
              {t("form.whatsapp")}
            </a>
          </p>
        </div>
      </main>
    );
  }

  const error = formErrorOf(first(query["error"]));
  const count = Number.parseInt(first(query["count"]) ?? "", 10);
  const preselect = Number.parseInt(first(query["r"]) ?? "", 10);
  const ratingError = error === "rating" ? t("form.errorRating") : undefined;
  const longError =
    error === "long" && Number.isFinite(count)
      ? t("form.errorLong", { count, max: REVIEW_TEXT_MAX_GRAPHEMES })
      : undefined;

  return (
    <main className={MAIN} id="main">
      <form
        action={submitReviewAction.bind(null, locale, token)}
        className={PAGE}
        data-fo-review-page="form"
        method="post"
      >
        <OrderLine locale={locale} order={state.order} />
        <h1 className={HEADING}>{t("form.heading")}</h1>
        {error === undefined ? null : (
          <div
            className="border-danger rounded-[10px] border-2 p-[14px]"
            data-fo-review-error={error}
            role="alert"
          >
            <p className="text-ink m-0 font-bold">
              {error === "rating" ? (
                <a className={LINK} href="#rating-error">
                  {t("form.errorSummary")}
                </a>
              ) : (
                <a className={LINK} href="#review-text">
                  {longError}
                </a>
              )}
            </p>
          </div>
        )}
        <StarRadioGroup
          defaultValue={
            preselect >= 1 && preselect <= 5 ? preselect : undefined
          }
          error={ratingError}
          errorId="rating-error"
          legend={t("form.legend")}
          name="rating"
          optionLabels={[1, 2, 3, 4, 5].map((n) => t("form.starLabel", { n }))}
        />
        <div className="grid gap-[6px]">
          <label
            className="text-ink text-[15px] font-bold"
            htmlFor="review-text"
          >
            {t("form.textLabel")}
          </label>
          <p className="text-ink-3 m-0 text-[14px]" id="review-text-hint">
            {t("form.textHint", { max: REVIEW_TEXT_MAX_GRAPHEMES })}
          </p>
          {longError === undefined ? null : (
            <p
              className="text-danger m-0 text-[14px] font-bold"
              id="review-text-error"
            >
              {longError}
            </p>
          )}
          <textarea
            aria-describedby={
              longError === undefined
                ? "review-text-hint"
                : "review-text-hint review-text-error"
            }
            aria-invalid={longError === undefined ? undefined : true}
            className="border-rule text-ink focus-visible:outline-sky bg-card min-h-[140px] rounded-[10px] border p-[12px] text-[16px] focus-visible:outline-2"
            dir="auto"
            id="review-text"
            maxLength={REVIEW_TEXT_MAX_CHARACTERS}
            name="text"
            rows={6}
          />
        </div>
        <div className="grid gap-[4px]">
          <label className="text-ink flex items-start gap-[10px] text-[15px]">
            <input
              aria-describedby="show-name-hint"
              className="mt-[3px] h-[20px] w-[20px] shrink-0"
              name="showFirstName"
              type="checkbox"
            />
            <span>{t("form.showName")}</span>
          </label>
          <p
            className="text-ink-3 m-0 ps-[30px] text-[14px]"
            id="show-name-hint"
          >
            {t("form.showNameHint")}
          </p>
        </div>
        <p className="text-ink-2 m-0 text-[14px]">
          {t("form.notice")}{" "}
          <a className={LINK} href={reviewPolicyPath(locale)}>
            {t("form.policyLink")}
          </a>
        </p>
        <button
          className={checkoutButtonClass(
            "primary",
            "md",
            "justify-self-stretch md:justify-self-start",
          )}
          type="submit"
        >
          {t("form.send")}
        </button>
      </form>
    </main>
  );
}
