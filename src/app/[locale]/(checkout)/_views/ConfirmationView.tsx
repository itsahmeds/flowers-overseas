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
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import type { Confirmation } from "@/modules/checkout";
import { formatDate, formatMoney, formatNumber } from "@/modules/i18n";
import { ConfirmationRecap, DemoBanner } from "@/modules/ui/checkout";

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

const H1 = "display text-ink m-0 text-[30px] leading-[1.1] md:text-[38px]";
const LINK =
  "text-link hover:text-link-strong inline-flex min-h-[44px] items-center font-bold underline underline-offset-4";

function day(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
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
  const all = (await getTranslations({ locale })) as unknown as (
    key: string,
    values?: Record<string, unknown>,
  ) => string;
  const many = confirmation.deliveries.length > 1;
  return (
    <>
      <DemoBanner body={t("demo.bannerBody")} title={t("demo.bannerTitle")} />
      <div
        className="grid max-w-[720px] gap-[24px] py-[32px]"
        data-fo-confirmation="demo"
      >
        <h1 className={H1}>{c("demo.title")}</h1>
        <p className="text-ui m-0" data-fo-demo-statement="">
          {c("demo.body")}
        </p>
        {confirmation.deliveries.map((delivery, index) => (
          <section
            aria-labelledby={`done-${String(index)}`}
            className="grid gap-[10px]"
            data-fo-confirmed-delivery={delivery.reference}
            key={delivery.reference}
          >
            <h2 className="text-ui m-0 font-bold" id={`done-${String(index)}`}>
              {many
                ? `${t("step.deliveryOf", {
                    n: formatNumber(index + 1, locale),
                    total: formatNumber(confirmation.deliveries.length, locale),
                  })} · `
                : ""}
              <span data-fo-reference="">
                {c("demo.reference", { reference: delivery.reference })}
              </span>
            </h2>
            <ConfirmationRecap
              date={formatDate(
                day(delivery.deliveryDate),
                locale,
                "calendarDate",
                "UTC",
              )}
              item={{
                name: delivery.productName,
                details:
                  delivery.tier === null
                    ? []
                    : [
                        delivery.tier.stems === null
                          ? all(delivery.tier.labelKey)
                          : all(delivery.tier.labelKey, {
                              count: delivery.tier.stems,
                            }),
                      ],
              }}
              labels={{
                recipient: c("recap.recipient"),
                date: c("recap.date"),
                card: c("recap.card"),
              }}
              locale={locale}
              note={c("recap.nothingCharged")}
              recipient={{
                name: delivery.recipientName,
                address: delivery.address,
              }}
              title={t("summary.title")}
              total={delivery.amount}
              totalLabel={t("summary.total")}
              {...(delivery.card === null
                ? {}
                : {
                    card: {
                      message: delivery.card.message,
                      ...(delivery.card.signature === ""
                        ? {}
                        : { signature: delivery.card.signature }),
                    },
                  })}
            />
            <p className="text-ink-muted m-0 text-sm">
              {c("demo.next", { city: delivery.city })}
            </p>
          </section>
        ))}
        {many ? (
          <p
            className="m-0 flex justify-between gap-[16px] font-bold"
            data-fo-purchase-total=""
          >
            <span>{c("page.total")}</span>
            <bdi className="num">{formatMoney(confirmation.total, locale)}</bdi>
          </p>
        ) : null}
        <p className="text-ink-muted m-0 text-sm">{c("page.promise")}</p>
      </div>
    </>
  );
}

registerConfirmationState("demo", DemoConfirmation);

/** "This confirmation is no longer available" (AC-29), with one way back. */
export async function ConfirmationGone({
  locale,
}: {
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "checkout" });
  const c = await getTranslations({ locale, namespace: "confirmation" });
  return (
    <div
      className="grid max-w-[640px] gap-[16px] py-[48px]"
      data-fo-confirmation="gone"
    >
      <h1 className={H1}>{c("page.gone")}</h1>
      <p className="m-0">
        <a className={LINK} href={`/${locale}`}>
          {t("expired.link")}
        </a>
      </p>
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
