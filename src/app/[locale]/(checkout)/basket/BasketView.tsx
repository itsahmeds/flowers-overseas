/**
 * The basket page's body (spec 010 §14 A-founder-2026-10-22 item 6, D5, D8; AC-57, AC-73, AC-74;
 * `docs/design/wireframes/basket-desktop.dc.html` and `basket-mobile.dc.html`; TASK-349).
 *
 * A Server Component, beside the route because it composes two modules (`plan/01` §5: a module
 * reaches another only through its barrel, and `src/modules/ui/basket` is imported by path).
 * `loadBasketPage()` in `src/modules/checkout/basket-page.ts` decides everything (state, lines, total, notices);
 * this file resolves the `checkout.basket.*` keys, formats every amount through `formatMoney`
 * and every date through `formatDate`, and hands strings to the design-system components of
 * `src/modules/ui/basket`. Every control is a form or a link, so every state works with
 * JavaScript off; `BasketRefresh` only moves focus and refills the header count after a Remove.
 *
 * Layout (`.bk`): from `lg`, the lines in a white letter on eight columns and the summary card on
 * four, sticky; below, one column, and the docked bar (`StickyTotalBar`) carries Check out.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { BASKET_MAX_LINES } from "@/config/basket";
import { countryConfig } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatList, formatMoney } from "@/modules/i18n";
import { MediaAsset } from "@/modules/ui";
import {
  BasketLine,
  BasketRefresh,
  BasketSummary,
  RemoveLineButton,
} from "@/modules/ui/basket";
import {
  DemoBanner,
  NOTICE_BLOCKING,
  NOTICE_CALM,
  StickyTotalBar,
  buttonClass,
} from "@/modules/ui/checkout";

/** A key that arrives as data (a country, a size, an add-on, a calendar reason). */
type DataKeyTranslator = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

import type { BasketPage, BasketPageLine } from "@/modules/checkout";

/** The page's `<h1>`: focus lands here after a Remove (AC-79). */
export const BASKET_HEADING_ID = "basket-title";

/** A server action bound to its locale, ready for a `<form action>`. */
export type BasketFormAction = (form: FormData) => Promise<void>;

export interface BasketViewProps {
  readonly locale: LocaleCode;
  readonly page: BasketPage;
  readonly actions: {
    readonly remove: BasketFormAction;
    readonly useNextDate: BasketFormAction;
    readonly confirmPrice: BasketFormAction;
  };
  readonly hrefs: {
    readonly home: string;
    readonly checkout: string;
    /** "Continue shopping": the last line's destination shop, or the locale home. */
    readonly continueShopping: string;
    /** The guarantee page, when it exists in this locale. */
    readonly guarantee?: string;
  };
}

/** A delivery date (`YYYY-MM-DD`, the destination's calendar day) with weekday and month name. */
export function basketDate(date: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${date}T12:00:00Z`),
    locale,
    "calendarDate",
    "UTC",
  );
}

/** `.bk-h h1`. */
const HEADING =
  "display text-ink m-0 text-(length:--text-2xl-s) leading-[1.08] focus:outline-none lg:text-(length:--text-2xl-fluid)";

/** `.bk-list`: the lines in a white letter. */
const LETTER =
  "bg-card m-0 list-none rounded-(--radius-letter) px-[16px] py-[2px] shadow-(--shadow-letter) lg:px-[30px] lg:py-[4px]";

export async function BasketView({
  locale,
  page,
  actions,
  hrefs,
}: BasketViewProps): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "checkout" });
  const tAll = (await getTranslations({
    locale,
  })) as unknown as DataKeyTranslator;
  const heading = (
    <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-x-[16px] gap-y-[6px]">
      <h1 className={HEADING} id={BASKET_HEADING_ID} tabIndex={-1}>
        {t("basket.title")}
      </h1>
    </div>
  );

  if (page.kind === "empty") {
    return (
      <main
        className="mx-auto w-full max-w-(--wrap) px-(--gutter-s) pt-[22px] pb-[28px] md:px-(--gutter) lg:pt-[36px] lg:pb-[72px]"
        data-fo-basket-state="empty"
        id="main"
      >
        {heading}
        <div className="bg-card grid max-w-[620px] justify-items-start gap-[16px] rounded-(--radius-letter) px-[18px] py-[24px] shadow-(--shadow-letter) lg:px-[34px] lg:pt-[36px] lg:pb-[38px]">
          <p className="display text-md m-0 italic">{t("basket.empty")}</p>
          <a className={buttonClass("primary", "md")} href={hrefs.home}>
            {t("basket.emptyLink")}
          </a>
        </div>
        <BasketRefresh count={0} headingId={BASKET_HEADING_ID} />
      </main>
    );
  }

  const removeText = t("basket.remove");
  const line = (entry: BasketPageLine): ReactElement => {
    const name = entry.display.name ?? "";
    const country = tAll(countryConfig(entry.countryIso).nameKey);
    const remove = (variant: "link" | "ghost"): ReactElement => (
      <RemoveLineButton
        action={actions.remove}
        label={t("basket.removeLabel", { product: name })}
        position={entry.position}
        text={removeText}
        variant={variant}
      />
    );
    let flag: ReactNode;
    if (entry.state === "unavailable") {
      flag = (
        <>
          <p className="m-0">{t("basket.unavailable")}</p>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[8px]">
            {remove("ghost")}
          </div>
        </>
      );
    } else if (entry.state === "dateGone" && entry.gone !== null) {
      const next = entry.gone.next;
      flag = (
        <>
          <p className="m-0">
            {t("date.gone", {
              date:
                entry.deliveryDate === null
                  ? ""
                  : basketDate(entry.deliveryDate, locale),
              country,
              reason: tAll(entry.gone.reason.key, {
                ...entry.gone.reason.params,
                country,
              }),
              next: next === null ? "" : basketDate(next, locale),
            })}
          </p>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[8px]">
            {next === null ? null : (
              <form action={actions.useNextDate} className="contents">
                <input
                  name="line"
                  type="hidden"
                  value={String(entry.position)}
                />
                <input name="deliveryDate" type="hidden" value={next} />
                <input name="returnTo" type="hidden" value="basket" />
                <button
                  className={buttonClass("primary", "sm", "px-[20px]")}
                  type="submit"
                >
                  {t("basket.useNext", { next: basketDate(next, locale) })}
                </button>
              </form>
            )}
            {remove("link")}
          </div>
        </>
      );
    }
    const addOns = entry.display.addOnNameKeys.map((key) => tAll(key));
    return (
      <BasketLine
        {...(addOns.length === 0
          ? {}
          : {
              addOns: t("basket.addOns", { list: formatList(addOns, locale) }),
            })}
        {...(entry.amount === null
          ? {}
          : { amount: formatMoney(entry.amount, locale) })}
        date={
          entry.deliveryDate === null
            ? t("basket.dateLater")
            : basketDate(entry.deliveryDate, locale)
        }
        destination={t("basket.to", { country })}
        {...(flag === undefined ? {} : { flag })}
        {...(entry.display.photo === null
          ? {}
          : {
              image: (
                <MediaAsset
                  assetId={entry.display.photo.assetId}
                  locale={locale}
                  productName={name}
                  ratio="card"
                  slot="thumb"
                />
              ),
            })}
        key={entry.position}
        name={name}
        position={entry.position}
        remove={remove("link")}
        state={entry.state}
        tier={
          entry.display.tier === null ? "" : tAll(entry.display.tier.labelKey)
        }
      />
    );
  };

  const notice = page.notice;
  const total = page.total;
  return (
    <>
      {page.mode === "demo" ? (
        <DemoBanner
          body={t("demo.bannerBody")}
          className="px-(--gutter-s) md:px-(--gutter)"
          title={t("demo.bannerTitle")}
        />
      ) : null}
      <main
        className="mx-auto grid w-full max-w-(--wrap) items-start gap-[22px] px-(--gutter-s) pt-[22px] pb-[28px] md:px-(--gutter) lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-[56px] lg:pt-[36px] lg:pb-[72px]"
        data-fo-basket-state="lines"
        id="main"
      >
        <div className="min-w-0">
          {heading}
          <div className="mb-[18px] grid gap-[12px] empty:hidden">
            {notice === "added" ? (
              <div
                className={NOTICE_CALM}
                data-fo-basket-notice="added"
                role="status"
              >
                <p className="m-0">{t("basket.added")}</p>
              </div>
            ) : null}
            {notice === "full" ||
            notice === "other_mode" ||
            notice === "other_currency" ? (
              <div
                className={NOTICE_BLOCKING}
                data-fo-basket-notice={notice}
                role="alert"
              >
                <p className="m-0">
                  {notice === "full"
                    ? t("basket.full", { max: BASKET_MAX_LINES })
                    : notice === "other_mode"
                      ? t("basket.otherMode")
                      : t("basket.otherCurrency", {
                          currency: total?.currency ?? "",
                        })}
                </p>
              </div>
            ) : null}
            {page.blocked > 0 ? (
              <div
                className={NOTICE_BLOCKING}
                data-fo-basket-notice="unavailable"
                role="alert"
              >
                <p className="m-0">
                  {t("basket.unavailableSummary", { count: page.blocked })}
                </p>
              </div>
            ) : null}
            {page.priceNotice === null ? null : (
              <form
                action={actions.confirmPrice}
                className={NOTICE_BLOCKING}
                data-fo-price-changed=""
                role="alert"
              >
                <p className="m-0">
                  {t.rich("price.changed", {
                    old: formatMoney(page.priceNotice.previous, locale),
                    new: formatMoney(page.priceNotice.current, locale),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </p>
                <input name="intent" type="hidden" value="confirmPrice" />
                <input
                  name="seenTotalMinor"
                  type="hidden"
                  value={String(page.priceNotice.current.amountMinor)}
                />
                <input
                  name="seenCurrency"
                  type="hidden"
                  value={page.priceNotice.current.currency}
                />
                <input name="returnStep" type="hidden" value="recipient" />
                <button
                  className={buttonClass(
                    "primary",
                    "sm",
                    "max-md:w-full md:justify-self-start",
                  )}
                  type="submit"
                >
                  {t("price.confirm", {
                    new: formatMoney(page.priceNotice.current, locale),
                  })}
                </button>
              </form>
            )}
          </div>
          <ul className={LETTER} data-fo-basket-lines="">
            {page.lines.map(line)}
          </ul>
        </div>
        {total === null ? null : (
          <div className="lg:sticky lg:top-[24px]">
            <BasketSummary
              checkout={{ href: hrefs.checkout, label: t("basket.checkout") }}
              continueShopping={{
                href: hrefs.continueShopping,
                label: t("basket.continue"),
              }}
              included={t("basket.included")}
              locale={locale}
              promise={
                <>
                  {tAll("nav.utility.guarantee")}
                  {hrefs.guarantee === undefined ? null : (
                    <>
                      {" · "}
                      <a
                        className="text-link hover:text-link-strong font-bold underline decoration-[1.5px] underline-offset-4"
                        href={hrefs.guarantee}
                      >
                        {tAll("footer.link.guarantee")}
                      </a>
                    </>
                  )}
                </>
              }
              title={t("summary.title")}
              total={total}
              totalLabel={t("basket.total")}
            />
          </div>
        )}
        {total === null ? null : (
          <StickyTotalBar
            action={
              <a
                className={buttonClass("primary", "bar")}
                href={hrefs.checkout}
              >
                {t("basket.checkout")}
              </a>
            }
            locale={locale}
            total={total}
            totalLabel={t("basket.total")}
          />
        )}
        <BasketRefresh
          count={page.lines.length}
          headingId={BASKET_HEADING_ID}
        />
      </main>
    </>
  );
}
