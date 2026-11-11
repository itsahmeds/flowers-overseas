/**
 * Step 3 in `test` and `live` (spec 013 §5.3 "Step 3, `test`", "Step 3, `live`", "No
 * JavaScript"; §14 A-founder-2026-10-22 item 3; spec 010 AC-77; AC-1, AC-3, AC-5; TASK-262;
 * artboards `docs/design/wireframes/checkout-{desktop,mobile}.dc.html`, the `.s13-*` states).
 *
 *  - `PayArea`: under the review list, the `PaymentPanel` island (the Payment Element on a
 *    deferred intent from the registered step's `prepare`), with the server-rendered
 *    `PreContractBlock` directly above the pay button, and a `<noscript>` notice with the phone
 *    and WhatsApp instead of a dead button. When the step answers `payments_unavailable`, the
 *    panel is replaced by `payments.error.unavailable` and nothing can be paid.
 *  - `UnpaidPayPage`: the basket was placed and not paid (a decline, a refresh, a failed 3DS):
 *    the same step rebuilt from the purchase's orders, "Not paid yet. Nothing was charged.",
 *    nothing to retype and no "Change" link (the orders are placed), and the same panel, whose
 *    "Pay" resumes the same purchase and the same intent.
 *
 * Nothing renders in `demo` or `closed`: spec 010's demo place control stays as it is (AC-3).
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import {
  chosenAddonNameKeys,
  type Confirmation,
  type ConfirmedDelivery,
  paymentStepFor,
  type StepScreen,
  type UnpaidPurchase,
} from "@/modules/checkout";
import { type IntegerMoney } from "@/modules/catalog";
import { infoPageExists, infoPagePath } from "@/modules/content";
import { formatDate, formatMoney, formatNumber } from "@/modules/i18n";
import { PAGE_FRAME } from "@/modules/ui";
import { DemoBanner, checkoutButtonClass } from "@/modules/ui/checkout";
import {
  PaymentErrorNotice,
  PaymentPanel,
  PreContractBlock,
  type PreContractBlockProps,
} from "@/modules/ui/checkout/payment";

import { payDeclinedAction, payStepAction } from "../checkout/pay-actions";
import { ConfirmedDeliveryCard, H1 } from "./ConfirmationView";

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** One delivery as the pre-contract block names it. */
export interface PreContractItem {
  readonly name: string;
  readonly details: readonly string[];
  readonly date: string;
  readonly city: string;
}

/** The messages the island may show, by key: our words only (AC-5). */
const MESSAGE_KEYS = [
  "payments.error.cardDeclined",
  "payments.error.insufficientFunds",
  "payments.error.authenticationFailed",
  "payments.error.expiredCard",
  "payments.error.incorrectCvc",
  "payments.error.processingError",
  "payments.error.tryAnotherMethod",
  "payments.error.generic",
  "payments.error.unavailable",
  "checkout.error.unable",
] as const;

/** The panel's fallbacks, both in `MESSAGE_KEYS` (TASK-521: the shared panel names no key). */
const PANEL_MESSAGE_KEYS = {
  generic: "payments.error.generic",
  unavailable: "payments.error.unavailable",
} as const;

function day(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** The block's rows (AC-3, AC-77): what you buy, the total, the date, cancelling, the seller. */
export function preContractRows(
  all: Translate,
  items: readonly PreContractItem[],
  total: IntegerMoney,
  locale: LocaleCode,
): PreContractBlockProps["rows"] {
  const item = (entry: PreContractItem): string =>
    entry.details.length === 0
      ? entry.name
      : all("payments.step.item", {
          name: entry.name,
          details: entry.details.join(", "),
        });
  const when = (entry: PreContractItem): string =>
    formatDate(day(entry.date), locale, "weekdayDayMonth", "UTC");
  const [only] = items;
  const many = items.length > 1;
  return [
    {
      term: all("payments.step.whatYouBuy"),
      details: many
        ? items.map((entry, index) =>
            all("payments.step.deliveryItem", {
              n: formatNumber(index + 1, locale),
              total: formatNumber(items.length, locale),
              item: item(entry),
              date: when(entry),
              city: entry.city,
            }),
          )
        : only === undefined
          ? []
          : [item(only)],
    },
    {
      term: all("payments.step.total"),
      details: [
        all("payments.step.totalIncluded", {
          amount: formatMoney(total, locale),
        }),
      ],
    },
    ...(many || only === undefined
      ? []
      : [
          {
            term: all("payments.step.delivery"),
            details: [
              all("payments.step.deliveryWhen", {
                date: when(only),
                city: only.city,
              }),
            ],
          },
        ]),
    {
      term: all("payments.step.cancelling"),
      details: [all("checkout.legal.cancellation")],
    },
    {
      term: all("payments.step.seller"),
      details: [
        COMPANY.tradingName,
        ...(COMPANY.legalName === undefined ? [] : [COMPANY.legalName]),
      ],
    },
  ];
}

/** The terms and withdrawal links, where the page exists in the locale. */
function legalLinks(
  all: Translate,
  locale: LocaleCode,
): PreContractBlockProps["links"] {
  return (
    [
      ["terms", "footer.link.terms"],
      ["cancellation", "footer.link.withdrawal"],
    ] as const
  ).flatMap(([page, label]) =>
    infoPageExists(page, locale)
      ? [{ label: all(label), href: infoPagePath(page, locale) }]
      : [],
  );
}

/** The panel with the block, or the unavailable notice (the file header). */
async function Panel({
  locale,
  mode,
  total,
  buyerCountry,
  items,
}: {
  readonly locale: LocaleCode;
  readonly mode: "test" | "live";
  readonly total: IntegerMoney;
  readonly buyerCountry: string;
  readonly items: readonly PreContractItem[];
}): Promise<ReactElement> {
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const step = paymentStepFor(mode);
  const prepared =
    step?.prepare === undefined
      ? ({ kind: "payments_unavailable" } as const)
      : await step.prepare({
          amountMinor: total.amountMinor,
          currency: total.currency,
          buyerCountryDeclared: buyerCountry,
          locale,
        });
  if (prepared.kind !== "ready") {
    return (
      <p
        className="bg-blush rounded-field text-ink m-0 px-[14px] py-[12px] text-sm"
        data-fo-payment-unavailable=""
        role="alert"
      >
        {all("payments.error.unavailable")}
      </p>
    );
  }
  const messages = Object.fromEntries(
    MESSAGE_KEYS.map((key) => [key, all(key)]),
  );
  return (
    <>
      <PaymentPanel
        declined={payDeclinedAction}
        locale={locale}
        messageKeys={PANEL_MESSAGE_KEYS}
        messages={messages}
        pay={payStepAction}
        payLabel={all("checkout.legal.payButton", {
          amount: formatMoney(total, locale),
        })}
        pendingLabel={all("payments.step.submitting")}
        preparation={prepared.preparation}
        processedBy={all("payments.step.processedBy")}
        seenTotal={{
          amountMinor: total.amountMinor,
          currency: total.currency,
        }}
        title={all("payments.step.payTitle")}
      >
        <PreContractBlock
          links={legalLinks(all, locale)}
          rows={preContractRows(all, items, total, locale)}
          title={all("payments.step.preContractTitle")}
          {...(mode === "test"
            ? { draftLabel: all("payments.step.draftLabel") }
            : {})}
        />
      </PaymentPanel>
      <noscript>
        <div
          className="bg-card rounded-field text-ui grid gap-[10px] px-[18px] py-[16px] shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
          data-fo-payment-noscript=""
        >
          <p className="m-0">{all("payments.step.noScript")}</p>
          <p className="m-0 flex flex-wrap gap-x-[22px] gap-y-[8px]">
            <a
              className="text-link font-bold underline"
              href={`tel:${COMPANY.contact.phoneE164}`}
            >
              {COMPANY.contact.phoneDisplay}
            </a>
            <a
              className="text-link font-bold underline"
              href={whatsappHref(COMPANY.contact)}
            >
              {all("tracking.help.whatsapp", {
                phone: COMPANY.contact.phoneDisplay,
              })}
            </a>
          </p>
        </div>
      </noscript>
    </>
  );
}

/** Step 3's pay area in `test` and `live`, under the review list. */
export async function PayArea({
  screen,
}: {
  readonly screen: StepScreen;
}): Promise<ReactElement | null> {
  if (screen.mode !== "test" && screen.mode !== "live") return null;
  const total = screen.total;
  const buyerCountry = screen.buyer?.residenceCountry;
  if (total === null || buyerCountry === undefined) return null;
  const all = (await getTranslations({
    locale: screen.locale,
  })) as unknown as Translate;
  const items: PreContractItem[] = screen.lines.map((line) => ({
    name: line.productName,
    details: [
      ...(line.tier === null
        ? []
        : [
            line.tier.stems === null
              ? all(line.tier.labelKey)
              : all(line.tier.labelKey, { count: line.tier.stems }),
          ]),
      ...chosenAddonNameKeys(new Set(line.addonKeys)).map((key) => all(key)),
      ...(line.card !== null && line.card.cardMessage !== ""
        ? [all("payments.step.printedCard")]
        : []),
    ],
    date: line.deliveryDate ?? "",
    city: line.recipient?.address["city"] ?? "",
  }));
  return Panel({
    locale: screen.locale,
    mode: screen.mode,
    total,
    buyerCountry,
    items,
  });
}

/** The pay step rebuilt for a placed, unpaid purchase (the file header; AC-5). */
export async function UnpaidPayPage({
  locale,
  mode,
  confirmation,
  unpaid,
}: {
  readonly locale: LocaleCode;
  readonly mode: "test" | "live";
  readonly confirmation: Extract<Confirmation, { kind: "placed" }>;
  readonly unpaid: UnpaidPurchase;
}): Promise<ReactElement> {
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const t = await getTranslations({ locale, namespace: "checkout" });
  const details = (delivery: ConfirmedDelivery): string[] => [
    ...(delivery.tier === null
      ? []
      : [
          delivery.tier.stems === null
            ? all(delivery.tier.labelKey)
            : all(delivery.tier.labelKey, { count: delivery.tier.stems }),
        ]),
    ...delivery.addonNameKeys.map((key) => all(key)),
    ...(delivery.card !== null && delivery.card.message !== ""
      ? [all("payments.step.printedCard")]
      : []),
  ];
  const total = confirmation.total;
  const count = confirmation.deliveries.length;
  return (
    <>
      {mode === "test" ? (
        <>
          <DemoBanner
            body={t("demo.bannerBody")}
            innerClassName={PAGE_FRAME}
            title={t("demo.bannerTitle")}
          />
          <p
            className={`${PAGE_FRAME} text-ink-2 m-0 pt-[10px] text-sm`}
            role="note"
          >
            {all("payments.step.testLabel")}
          </p>
        </>
      ) : null}
      <div
        className={`${PAGE_FRAME} pt-[32px] pb-[64px] md:pt-[40px]`}
        data-fo-pay-step="unpaid"
      >
        <div className="grid max-w-[720px] gap-[18px]">
          <h1 className={H1}>
            {t.rich("step.review", { em: (chunks) => <em>{chunks}</em> })}
          </h1>
          <p
            className="bg-paper-2 rounded-field text-ink-2 m-0 flex flex-wrap items-baseline gap-x-[12px] gap-y-[6px] px-[14px] py-[10px] text-sm"
            data-fo-unpaid=""
          >
            {confirmation.deliveries.map((delivery) => (
              <b
                className="text-ink num tracking-[0.02em]"
                key={delivery.reference}
              >
                {delivery.reference}
              </b>
            ))}
            <span>{all("payments.step.notPaidYet")}</span>
          </p>
          <div className="grid gap-[12px]">
            {confirmation.deliveries.map((delivery, index) => (
              <ConfirmedDeliveryCard
                all={all}
                delivery={delivery}
                eyebrow={
                  count > 1
                    ? `${t("step.deliveryOf", {
                        n: formatNumber(index + 1, locale),
                        total: formatNumber(count, locale),
                      })} · `
                    : ""
                }
                index={index}
                key={delivery.reference}
                labels={{
                  recipient: c("recap.recipient"),
                  date: c("recap.date"),
                  card: c("recap.card"),
                }}
                locale={locale}
                of={count}
                reference={all("tracking.eyebrow", {
                  reference: delivery.reference,
                })}
              />
            ))}
          </div>
          {await Panel({
            locale,
            mode,
            total,
            buyerCountry: unpaid.buyerCountry,
            items: confirmation.deliveries.map((delivery) => ({
              name: delivery.productName,
              details: details(delivery),
              date: delivery.deliveryDate,
              city: delivery.city,
            })),
          })}
        </div>
      </div>
    </>
  );
}

/**
 * Step 4 after the 5th declined attempt (spec 021 §5.2 "Attempt cap", §5.3, §7; AC-4, AC-30;
 * TASK-493; the "tries used up" state on `docs/design/wireframes/checkout-*.dc.html`): the
 * purchase is closed unpaid, so there is no card form, no Pay and no "Change" link. Spec 013's
 * notice takes focus with `checkout.risk.attemptsExhausted`, then "Start again" (the first
 * bouquet's product page, orchestrator ruling 2026-11-08; the checkout start when none resolves)
 * and the support phone and WhatsApp link, as `payments.step.noScript` has them.
 */
export async function AttemptsEndedPage({
  locale,
  mode,
  productPath,
}: {
  readonly locale: LocaleCode;
  readonly mode: "test" | "live";
  readonly productPath: string | null;
}): Promise<ReactElement> {
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return (
    <>
      {mode === "test" ? (
        <>
          <DemoBanner
            body={t("demo.bannerBody")}
            innerClassName={PAGE_FRAME}
            title={t("demo.bannerTitle")}
          />
          <p
            className={`${PAGE_FRAME} text-ink-2 m-0 pt-[10px] text-sm`}
            role="note"
          >
            {all("payments.step.testLabel")}
          </p>
        </>
      ) : null}
      <div
        className={`${PAGE_FRAME} pt-[32px] pb-[64px] md:pt-[40px]`}
        data-fo-pay-step="ended"
      >
        <div className="grid max-w-[720px] gap-[18px]">
          <h1 className={H1}>
            {t.rich("step.review", { em: (chunks) => <em>{chunks}</em> })}
          </h1>
          <section
            aria-labelledby="co-pay-title"
            className="border-rule grid gap-[14px] border-t border-solid pt-[22px]"
          >
            <h2
              className="display m-0 text-(length:--text-lg) leading-[1.15]"
              id="co-pay-title"
            >
              {all("payments.step.payTitle")}
            </h2>
            <PaymentErrorNotice
              message={all("checkout.risk.attemptsExhausted")}
            >
              <a
                className={checkoutButtonClass(
                  "primary",
                  "sm",
                  "justify-self-start",
                )}
                data-fo-start-again=""
                href={productPath ?? `/${locale}`}
              >
                {all("checkout.risk.startAgain")}
              </a>
              <p className="m-0 flex flex-wrap gap-x-[22px] gap-y-[8px]">
                <a
                  className="text-link font-bold underline"
                  href={`tel:${COMPANY.contact.phoneE164}`}
                >
                  {COMPANY.contact.phoneDisplay}
                </a>
                <a
                  className="text-link font-bold underline"
                  href={whatsappHref(COMPANY.contact)}
                >
                  {all("tracking.help.whatsapp", {
                    phone: COMPANY.contact.phoneDisplay,
                  })}
                </a>
              </p>
            </PaymentErrorNotice>
          </section>
        </div>
      </div>
    </>
  );
}
