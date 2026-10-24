/**
 * `/{locale}/checkout/done`, drawn (spec 010 §2 "Confirmation", §8 honesty, AC-29, AC-33
 * confirmation half; §14 A2.4 AC-46; §14 A-founder-2026-10-22 AC-68, AC-73; TASK-206; artboards
 * `docs/design/wireframes/confirmation-{desktop,mobile}.dc.html`).
 *
 * One renderer per order mode (`registerConfirmationState`): this spec registers `demo`; spec
 * 013's TASK-263 registers `test` and `live`. A mode with no renderer, and a cookie that leads to
 * no purchase, draw "This confirmation is no longer available" with no order data (AC-29, AC-46).
 * The demo state recaps every delivery in basket order with its reference, then the total, the
 * demo statement and what happens in the real service; it renders no "Change" or "Edit" control,
 * no link to a checkout step and no form (AC-52, AC-68). No refund or failure wording anywhere.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import type { Confirmation, ConfirmedDelivery } from "@/modules/checkout";
import { formatDate, formatMoney, formatNumber } from "@/modules/i18n";
import {
  altFor,
  assetsForProduct,
  isDisplayable,
  MediaAsset,
  PAGE_FRAME,
} from "@/modules/ui";
import {
  checkoutButtonClass,
  ConfirmationRecap,
  DemoBanner,
} from "@/modules/ui/checkout";

type Placed = Extract<Confirmation, { kind: "placed" }>;

/** A confirmation state's renderer (spec 013 registers `test` and `live`). */
export type ConfirmationRenderer = (props: {
  readonly confirmation: Placed;
  readonly locale: LocaleCode;
}) => Promise<ReactElement> | ReactElement;

const renderers = new Map<Placed["mode"], ConfirmationRenderer>();

/** Spec 010 §14 A2.4's seam (AC-46). */
export function registerConfirmationState(
  mode: Placed["mode"],
  renderer: ConfirmationRenderer,
): void {
  renderers.set(mode, renderer);
}

/** The renderer for a mode, or `undefined` (the page then draws `gone`). */
export function confirmationStateFor(
  mode: Placed["mode"],
): ConfirmationRenderer | undefined {
  return renderers.get(mode);
}

/** The board's `.s10-conf h1` and `.s10-msg h1`. */
const H1 =
  "display text-ink m-0 text-[30px] leading-[1.1] md:text-(length:--text-3xl-fluid)";
/** `.s10-conf .s10-promise`. */
const PROMISE = "text-ink-2 m-0 text-sm";

function day(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function emphasis(chunks: ReactNode): ReactElement {
  return <em>{chunks}</em>;
}

function strong(chunks: ReactNode): ReactElement {
  return <b className="num tracking-[0.02em]">{chunks}</b>;
}

/** The bouquet's first displayable photo, or nothing. */
function photo(
  delivery: ConfirmedDelivery,
  locale: LocaleCode,
): ReactElement | null {
  if (delivery.sku === null) return null;
  for (const asset of assetsForProduct(delivery.sku)) {
    if (
      altFor(asset.id, locale) !== undefined &&
      isDisplayable(asset.id, locale)
    ) {
      return (
        <MediaAsset
          assetId={asset.id}
          locale={locale}
          productName={delivery.productName}
          ratio="card"
          slot="thumb"
        />
      );
    }
  }
  return null;
}

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** "18 stems", then each add-on the buyer chose, by name. */
function itemDetails(delivery: ConfirmedDelivery, all: Translate): string[] {
  return [
    ...(delivery.tier === null
      ? []
      : [
          delivery.tier.stems === null
            ? all(delivery.tier.labelKey)
            : all(delivery.tier.labelKey, { count: delivery.tier.stems }),
        ]),
    ...delivery.addonNameKeys.map((key) => all(key)),
  ];
}

/** The demo confirmation (AC-29, AC-33, AC-68). */
export async function DemoConfirmation({
  confirmation,
  locale,
}: {
  readonly confirmation: Placed;
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "checkout" });
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const [only] = confirmation.deliveries;
  const many = confirmation.deliveries.length > 1;
  return (
    <>
      <DemoBanner
        body={t("demo.bannerBody")}
        innerClassName={PAGE_FRAME}
        title={t("demo.bannerTitle")}
      />
      {many || only === undefined ? (
        <div
          className={`${PAGE_FRAME} pt-[32px] pb-[64px] md:pt-[40px] md:pb-[96px]`}
          data-fo-confirmation="demo"
        >
          <div className="grid max-w-[860px] justify-items-start gap-[14px]">
            <h1 className={H1}>{c.rich("demo.title", { em: emphasis })}</h1>
            <p className="m-0 text-[19px]" data-fo-demo-statement="">
              {c("demo.body")}
            </p>
            <div className="grid w-full gap-[12px]">
              {confirmation.deliveries.map((delivery, index) => (
                <ConfirmedDeliveryCard
                  all={all}
                  delivery={delivery}
                  index={index}
                  key={delivery.reference}
                  labels={{
                    recipient: c("recap.recipient"),
                    date: c("recap.date"),
                    card: c("recap.card"),
                  }}
                  locale={locale}
                  of={confirmation.deliveries.length}
                  eyebrow={`${t("step.deliveryOf", {
                    n: formatNumber(index + 1, locale),
                    total: formatNumber(confirmation.deliveries.length, locale),
                  })} · `}
                  reference={c("demo.reference", {
                    reference: delivery.reference,
                  })}
                />
              ))}
            </div>
            <p
              className="border-rule m-0 flex w-full items-baseline justify-between gap-[16px] border-t border-solid pt-[14px]"
              data-fo-purchase-total=""
            >
              <span className="font-bold">{t("summary.total")}</span>
              <bdi className="font-display num text-[32px] font-(--font-weight-display)">
                {formatMoney(confirmation.total, locale)}
              </bdi>
            </p>
            <p className={PROMISE}>{c("page.promise")}</p>
          </div>
        </div>
      ) : (
        <div
          className={`${PAGE_FRAME} grid items-start gap-[32px] pt-[32px] pb-[56px] md:pt-[40px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[56px]`}
          data-fo-confirmation="demo"
        >
          <div
            className="grid justify-items-start gap-[14px]"
            data-fo-confirmed-delivery={only.reference}
          >
            <h1 className={H1}>{c.rich("demo.title", { em: emphasis })}</h1>
            <p className="text-ink m-0 text-[19px]">
              <span data-fo-reference="">
                {c.rich("demo.referenceSentence", {
                  reference: only.reference,
                  b: strong,
                })}
              </span>{" "}
              <span data-fo-demo-statement="">{c("demo.body")}</span>
            </p>
            <p className="bg-paper-2 rounded-field text-ink-2 m-0 max-w-[56ch] px-[18px] py-[16px]">
              {c("demo.next", { city: only.city })}
            </p>
            <p className={PROMISE}>{c("page.promise")}</p>
          </div>
          <ConfirmationRecap
            date={formatDate(
              day(only.deliveryDate),
              locale,
              "calendarDate",
              "UTC",
            )}
            item={{
              name: only.productName,
              details: itemDetails(only, all),
              image: photo(only, locale),
            }}
            labels={{
              recipient: c("recap.recipient"),
              date: c("recap.date"),
              card: c("recap.card"),
            }}
            locale={locale}
            note={c("recap.nothingCharged")}
            recipient={{ name: only.recipientName, address: only.address }}
            title={t("summary.title")}
            total={only.amount}
            totalLabel={t("summary.total")}
            {...(only.card === null
              ? {}
              : {
                  card: {
                    message: only.card.message,
                    ...(only.card.signature === ""
                      ? {}
                      : { signature: only.card.signature }),
                  },
                })}
          />
        </div>
      )}
    </>
  );
}

/** One delivery of a basket's confirmation (the board's `.cf-dlv`, AC-68). */
function ConfirmedDeliveryCard({
  delivery,
  index,
  of,
  eyebrow,
  reference,
  labels,
  locale,
  all,
}: {
  readonly delivery: ConfirmedDelivery;
  readonly index: number;
  readonly of: number;
  readonly eyebrow: string;
  readonly reference: string;
  readonly labels: {
    readonly recipient: string;
    readonly date: string;
    readonly card: string;
  };
  readonly locale: LocaleCode;
  readonly all: Translate;
}): ReactElement {
  const headingId = `done-${String(index)}`;
  const row = "grid grid-cols-[84px_minmax(0,1fr)] gap-[10px] text-sm";
  const term =
    "text-ink-3 pt-[2px] text-xs font-bold tracking-[0.1em] uppercase";
  const details = itemDetails(delivery, all);
  return (
    <article
      aria-labelledby={headingId}
      className="bg-card rounded-field grid grid-cols-[72px_minmax(0,1fr)_auto] items-start gap-x-[18px] gap-y-[4px] px-[18px] py-[16px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
      data-fo-confirmed-delivery={delivery.reference}
      data-fo-delivery-of={`${String(index + 1)}/${String(of)}`}
    >
      <div className="bg-photo row-span-2 aspect-[4/5] w-[72px] overflow-hidden rounded-[10px]">
        {photo(delivery, locale)}
      </div>
      <p className="eyebrow m-0">
        {eyebrow}
        <span data-fo-reference="">{reference}</span>
      </p>
      <strong className="font-display num text-md font-(--font-weight-display)">
        <bdi>{formatMoney(delivery.amount, locale)}</bdi>
      </strong>
      <h2
        className="font-display text-md col-start-2 col-end-[-1] m-0 leading-[1.15] font-(--font-weight-display)"
        id={headingId}
      >
        <bdi>{delivery.productName}</bdi>
        {details.length === 0 ? null : ` · ${details.join(" · ")}`}
      </h2>
      <dl className="col-start-2 col-end-[-1] mt-[6px] mb-0 grid gap-[4px]">
        <div className={row}>
          <dt className={term}>{labels.recipient}</dt>
          <dd className="m-0">
            <bdi>{delivery.recipientName}</bdi>
            <br />
            <bdi>{delivery.address}</bdi>
          </dd>
        </div>
        <div className={row}>
          <dt className={term}>{labels.date}</dt>
          <dd className="m-0">
            {formatDate(
              day(delivery.deliveryDate),
              locale,
              "calendarDate",
              "UTC",
            )}
          </dd>
        </div>
        {delivery.card === null || delivery.card.message === "" ? null : (
          <div className={row}>
            <dt className={term}>{labels.card}</dt>
            <dd className="m-0">
              <bdi>{delivery.card.message}</bdi>
              {delivery.card.signature === "" ? null : (
                <>
                  {" "}
                  <bdi>{delivery.card.signature}</bdi>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

registerConfirmationState("demo", DemoConfirmation);

/** "This confirmation is no longer available" (AC-29), with one way back (`.s10-msg`). */
export async function ConfirmationGone({
  locale,
}: {
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "checkout" });
  const c = await getTranslations({ locale, namespace: "confirmation" });
  return (
    <div className={PAGE_FRAME} data-fo-confirmation="gone">
      <div className="grid max-w-[640px] justify-items-start gap-[18px] py-[40px] md:pt-[72px] md:pb-[32px]">
        <h1 className={H1}>{c("page.gone")}</h1>
        <a
          className={checkoutButtonClass("ghost", "sm", "max-md:w-full")}
          href={`/${locale}`}
        >
          {t("expired.link")}
        </a>
      </div>
    </div>
  );
}

/** The done page's body: the mode's renderer, or `gone` (AC-46). */
export async function ConfirmationPage({
  confirmation,
  locale,
}: {
  readonly confirmation: Confirmation;
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  if (confirmation.kind === "gone") return <ConfirmationGone locale={locale} />;
  const render = confirmationStateFor(confirmation.mode);
  if (render === undefined) return <ConfirmationGone locale={locale} />;
  return render({ confirmation, locale });
}
