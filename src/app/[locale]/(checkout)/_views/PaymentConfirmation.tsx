/**
 * `/{locale}/checkout/done` in `test` and `live` (spec 013 §5.3 "What the confirmation says", the
 * projection table, "No edits after placement"; §14 A-founder-2026-10-14b; §14
 * A-founder-2026-10-22 item 8; AC-6, AC-46, AC-47, AC-52; TASK-263; artboards
 * `docs/design/wireframes/confirmation-{desktop,mobile}.dc.html`, the `test`/`live` states and the
 * 2026-11-04 cancel-line redraw).
 *
 * Registered with spec 010's `registerConfirmationState` for `test` and `live`. Each delivery's
 * state comes from `getPaymentConfirmations` (`modules/payments/confirmation.ts`, the projection
 * table); spec 018's block comes from `getConfirmationBlock` and is mounted only inside the paid
 * and later states, exactly as TASK-340's reference renderer does:
 *
 *  - **One delivery** (the boards' first screen): the `.s13-conf` column (the reference, the
 *    heading, the arrival line, then `PostPurchaseBlock`), spec 010's recap beside it, then
 *    `CancelLine` as the **last element of `<main>`** and `CancelDialog` after it (rendered only
 *    after the buyer pressed the line). While the dialog is open the rest of `<main>` is `inert`.
 *    The unpaid and cancelled states are the boards' `.s18-msg`: the reference, the state's one
 *    sentence, the contact line on a refund, and the way home.
 *  - **Two or more deliveries** (item 8): one `<h1>`, "Thank you. We have your order." while any
 *    delivery is not cancelled, else "Your order"; the masked email once; then one block per
 *    delivery in basket order ("Delivery n of m", its own projection line, its recap, spec 018's
 *    block for that order with its cancel line last); then one total.
 *
 * **No edits** (AC-47): no "Change" or "Edit", no link to a checkout step, no `<form>` but spec
 * 018's cancel action, and no call to a checkout draft action anywhere in this file. **No refund
 * or failure wording on a paid state** (AC-46): the paid heading and arrival line are the only
 * sentences this file adds there; a refund notice renders only in a cancelled delivery's own
 * place. No reason string is ever read for display.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import type { Confirmation, ConfirmedDelivery } from "@/modules/checkout";
import { formatDate, formatMoney, formatNumber } from "@/modules/i18n";
import { type ConfirmationBlock, getConfirmationBlock } from "@/modules/orders";
import {
  type ConfirmationState,
  confirmationKey,
  getPaymentConfirmations,
} from "@/modules/payments/confirmation";
import { PAGE_FRAME } from "@/modules/ui";
import {
  checkoutButtonClass,
  ConfirmationRecap,
  DemoBanner,
} from "@/modules/ui/checkout";

import type { CancelUiState } from "../checkout/done/buyer-cancel";
import {
  ConfirmationGone,
  ConfirmedDeliveryCard,
  day,
  H1,
  itemDetails,
  photo,
  registerConfirmationState,
  type Translate,
} from "./ConfirmationView";
import {
  CancelDialog,
  CancelLine,
  cancelDialogOpen,
  PostPurchaseBlock,
} from "./PostPurchaseBlock";

type Placed = Extract<Confirmation, { kind: "placed" }>;

/** What the states read; production reads the database, tests hand in fixtures. */
export interface PaymentConfirmationSources {
  readonly states: (
    orderIds: readonly string[],
  ) => Promise<Map<string, ConfirmationState>>;
  readonly block: (
    orderId: string,
    locale: LocaleCode,
  ) => Promise<ConfirmationBlock>;
}

const DATABASE: PaymentConfirmationSources = {
  states: (orderIds) => getPaymentConfirmations(orderIds),
  block: (orderId, locale) => getConfirmationBlock(orderId, { locale }),
};

/** `.s18-msg`: the unpaid and cancelled states. */
const MSG =
  "grid max-w-[640px] justify-items-start gap-[16px] pt-[32px] pb-[16px] md:pt-[56px] md:pb-[24px]";
/** `.s18-msg h1`. */
const MSG_H1 =
  "display text-ink m-0 text-[30px] leading-[1.12] md:text-(length:--text-3xl-fluid)";

/** Whether a state reads as paid and shows spec 018's block (the paid and later states). */
function showsBlock(state: ConfirmationState): boolean {
  return state.kind === "paid" || state.kind === "progress";
}

/** "Your flowers arrive in {city} on {date}." (Appendix A, the founder's "1 ok"). */
function arrival(
  p: Translate,
  delivery: ConfirmedDelivery,
  locale: LocaleCode,
): string {
  return p("confirmation.arrival", {
    city: delivery.city,
    date: formatDate(
      day(delivery.deliveryDate),
      locale,
      "weekdayDayMonth",
      "UTC",
    ),
  });
}

/** The state's own sentence: the paid heading, the buyer status, or a notice with its amount. */
function sentence(
  all: Translate,
  state: ConfirmationState,
  locale: LocaleCode,
): string {
  const key = confirmationKey(state);
  return state.kind === "refund"
    ? all(key, { amount: formatMoney(state.amount, locale) })
    : all(key);
}

/** "Refunded {amount} on {date}" under a later status, one per succeeded refund (A6.4 F4). */
function refundLines(
  all: Translate,
  state: ConfirmationState,
  locale: LocaleCode,
): ReactElement | null {
  if (state.kind !== "progress" || state.refunds.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-[4px] p-0 text-sm" data-fo-refunds="">
      {state.refunds.map((refund) => (
        <li key={refund.succeededAt.toISOString()}>
          {all("tracking.refundLine", {
            amount: formatMoney(refund.amount, locale),
            date: formatDate(refund.succeededAt, locale, "dayMonth", "UTC"),
          })}
        </li>
      ))}
    </ul>
  );
}

/** `.s13-contact` without the hours: what a refund notice offers. */
function contact(all: Translate, reference: string): ReactElement {
  return (
    <p
      className="text-ink-2 m-0 flex flex-wrap items-baseline gap-x-[16px] gap-y-[4px] text-sm"
      data-fo-confirmation-contact=""
    >
      <span>{all("tracking.help.quote", { reference })}</span>
      <a
        className="text-link font-bold underline underline-offset-[4px]"
        href={whatsappHref(COMPANY.contact)}
      >
        {all("tracking.help.whatsapp", {
          phone: COMPANY.contact.phoneDisplay,
        })}
      </a>
    </p>
  );
}

/** The test label under spec 010's banner (the `test` board), or nothing in `live`. */
async function TestStrip({
  mode,
  locale,
}: {
  readonly mode: Placed["mode"];
  readonly locale: LocaleCode;
}): Promise<ReactElement | null> {
  if (mode !== "test") return null;
  const t = await getTranslations({ locale, namespace: "checkout" });
  const p = await getTranslations({ locale, namespace: "payments" });
  return (
    <>
      <DemoBanner
        body={t("demo.bannerBody")}
        innerClassName={PAGE_FRAME}
        title={t("demo.bannerTitle")}
      />
      <p
        className={`${PAGE_FRAME} text-ink-2 m-0 pt-[10px] text-sm`}
        data-fo-test-label=""
        role="note"
      >
        {p("step.testLabel")}
      </p>
    </>
  );
}

/** One delivery's purchase: the boards' first screen and its message states. */
async function SingleDelivery({
  confirmation,
  delivery,
  state,
  block,
  locale,
  cancel,
}: {
  readonly confirmation: Placed;
  readonly delivery: ConfirmedDelivery;
  readonly state: ConfirmationState;
  readonly block: ConfirmationBlock | null;
  readonly locale: LocaleCode;
  readonly cancel: CancelUiState;
}): Promise<ReactElement> {
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const p = (await getTranslations({
    locale,
    namespace: "payments",
  })) as unknown as Translate;
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const t = await getTranslations({ locale, namespace: "checkout" });
  const eyebrow = (
    <p className="eyebrow m-0" data-fo-reference="">
      {all("tracking.eyebrow", { reference: delivery.reference })}
    </p>
  );
  if (block === null || !showsBlock(state)) {
    return (
      <div
        className={PAGE_FRAME}
        data-fo-confirmation={confirmation.mode}
        data-fo-confirmation-state={state.kind}
      >
        <div className={MSG}>
          {eyebrow}
          <h1 className={MSG_H1}>{sentence(all, state, locale)}</h1>
          {state.kind === "refund" ? contact(all, delivery.reference) : null}
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
  const open = cancelDialogOpen(block, 1, cancel);
  const [body, line, dialog] = await Promise.all([
    PostPurchaseBlock({ block, locale }),
    CancelLine({ block, locale, line: 1, state: cancel }),
    CancelDialog({ block, locale, line: 1, state: cancel }),
  ]);
  return (
    <>
      <div
        className={`${PAGE_FRAME} grid items-start gap-[32px] pt-[32px] pb-[16px] md:pt-[36px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[56px]`}
        data-fo-confirmation={confirmation.mode}
        data-fo-confirmation-state={state.kind}
        inert={open}
      >
        <div
          className="grid justify-items-start gap-[16px]"
          data-fo-confirmed-delivery={delivery.reference}
        >
          {eyebrow}
          <h1 className={H1} data-fo-confirmation-heading="">
            {sentence(all, state, locale)}
          </h1>
          <p className="text-ink m-0" data-fo-arrival="">
            {arrival(p, delivery, locale)}
          </p>
          {refundLines(all, state, locale)}
          {body}
        </div>
        <ConfirmationRecap
          date={formatDate(
            day(delivery.deliveryDate),
            locale,
            "calendarDate",
            "UTC",
          )}
          item={{
            name: delivery.productName,
            details: itemDetails(delivery, all),
            image: photo(delivery, locale),
          }}
          labels={{
            recipient: c("recap.recipient"),
            date: c("recap.date"),
            card: c("recap.card"),
          }}
          locale={locale}
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
      </div>
      {line}
      {dialog}
    </>
  );
}

/** Two to five deliveries (§14 A-founder-2026-10-22 item 8, AC-52). */
async function ManyDeliveries({
  confirmation,
  states,
  blocks,
  locale,
  cancel,
}: {
  readonly confirmation: Placed;
  readonly states: readonly ConfirmationState[];
  readonly blocks: readonly (ConfirmationBlock | null)[];
  readonly locale: LocaleCode;
  readonly cancel: CancelUiState;
}): Promise<ReactElement> {
  const all = (await getTranslations({ locale })) as unknown as Translate;
  const p = (await getTranslations({
    locale,
    namespace: "payments",
  })) as unknown as Translate;
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const t = await getTranslations({ locale, namespace: "checkout" });
  const anyOpen = blocks.some(
    (block, index) =>
      block !== null && cancelDialogOpen(block, index + 1, cancel),
  );
  const unpaid = states.every(
    (state) =>
      state.kind === "notCompleted" || state.kind === "cancelledUnpaid",
  );
  const allCancelled = states.every((state) => state.kind === "refund");
  const [first] = states;
  const heading =
    unpaid && first !== undefined
      ? sentence(all, first, locale)
      : allCancelled
        ? p("confirmation.yourOrder")
        : p("confirmation.paid");
  const email = blocks.find((block) => block?.maskedEmail != null)?.maskedEmail;
  const total = confirmation.deliveries.length;
  const parts = await Promise.all(
    confirmation.deliveries.map(async (delivery, index) => {
      const state = states[index];
      const block = blocks[index] ?? null;
      if (state === undefined) return null;
      const quiet =
        block === null ? null : { ...block, maskedEmail: null as null };
      const [body, line, dialog] =
        quiet === null || !showsBlock(state)
          ? [null, null, null]
          : await Promise.all([
              PostPurchaseBlock({ block: quiet, locale }),
              CancelLine({
                block: quiet,
                locale,
                line: index + 1,
                state: cancel,
              }),
              CancelDialog({
                block: quiet,
                locale,
                line: index + 1,
                state: cancel,
              }),
            ]);
      return { delivery, state, body, line, dialog, index };
    }),
  );
  return (
    <>
      <div
        className={`${PAGE_FRAME} pt-[32px] pb-[64px] md:pt-[40px] md:pb-[96px]`}
        data-fo-confirmation={confirmation.mode}
        data-fo-confirmation-state="basket"
      >
        <div className="grid max-w-[860px] justify-items-start gap-[18px]">
          <h1 className={H1} data-fo-confirmation-heading="" inert={anyOpen}>
            {heading}
          </h1>
          {email === undefined || email === null || unpaid ? null : (
            <p
              className="text-ui text-ink-2 m-0"
              data-fo-post-purchase-email=""
              inert={anyOpen}
            >
              {c.rich("postPurchase.emailSent", {
                email,
                b: (chunks) => <b className="text-ink font-bold">{chunks}</b>,
              })}
            </p>
          )}
          {parts.map((part) => {
            if (part === null) return null;
            const { delivery, state, body, line, dialog, index } = part;
            const open =
              blocks[index] != null &&
              cancelDialogOpen(blocks[index], index + 1, cancel);
            return (
              <section
                aria-labelledby={`done-${String(index)}`}
                className="grid w-full justify-items-start gap-[12px]"
                data-fo-delivery-block={index + 1}
                data-fo-confirmation-state={state.kind}
                key={delivery.reference}
              >
                <div className="contents" inert={anyOpen && !open}>
                  {state.kind === "progress" || state.kind === "refund" ? (
                    <p
                      className="text-ink m-0 font-bold"
                      data-fo-projection-line=""
                    >
                      {sentence(all, state, locale)}
                    </p>
                  ) : null}
                  {showsBlock(state) ? (
                    <p className="text-ink m-0" data-fo-arrival="">
                      {arrival(p, delivery, locale)}
                    </p>
                  ) : null}
                  {refundLines(all, state, locale)}
                  <div className="w-full">
                    <ConfirmedDeliveryCard
                      all={all}
                      delivery={delivery}
                      eyebrow={`${t("step.deliveryOf", {
                        n: formatNumber(index + 1, locale),
                        total: formatNumber(total, locale),
                      })} · `}
                      index={index}
                      labels={{
                        recipient: c("recap.recipient"),
                        date: c("recap.date"),
                        card: c("recap.card"),
                      }}
                      locale={locale}
                      of={total}
                      reference={all("tracking.eyebrow", {
                        reference: delivery.reference,
                      })}
                    />
                  </div>
                  {body}
                </div>
                {line}
                {dialog}
              </section>
            );
          })}
          <p
            className="border-rule m-0 flex w-full items-baseline justify-between gap-[16px] border-t border-solid pt-[14px]"
            data-fo-purchase-total=""
            inert={anyOpen}
          >
            <span className="font-bold">{t("summary.total")}</span>
            <bdi className="font-display num text-[32px] font-(--font-weight-display)">
              {formatMoney(confirmation.total, locale)}
            </bdi>
          </p>
          {unpaid ? (
            <a
              className={checkoutButtonClass("ghost", "sm", "max-md:w-full")}
              href={`/${locale}`}
            >
              {t("expired.link")}
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Builds the `test`/`live` renderer over `sources` (the database in production). */
export function paymentConfirmationRenderer(
  sources: PaymentConfirmationSources = DATABASE,
) {
  return async function PaymentConfirmation({
    confirmation,
    locale,
    cancel,
  }: {
    readonly confirmation: Placed;
    readonly locale: LocaleCode;
    readonly cancel: CancelUiState;
  }): Promise<ReactElement> {
    const ids = confirmation.deliveries.map((delivery) => delivery.orderId);
    const map = await sources.states(ids);
    const states = ids.map((id) => map.get(id));
    if (states.some((state) => state === undefined)) {
      return <ConfirmationGone locale={locale} />;
    }
    const known = states as ConfirmationState[];
    const blocks = await Promise.all(
      known.map((state, index) => {
        const id = ids[index];
        return id !== undefined && showsBlock(state)
          ? sources.block(id, locale)
          : Promise.resolve(null);
      }),
    );
    const [delivery] = confirmation.deliveries;
    const [state] = known;
    const [block] = blocks;
    return (
      <>
        <TestStrip locale={locale} mode={confirmation.mode} />
        {confirmation.deliveries.length === 1 &&
        delivery !== undefined &&
        state !== undefined ? (
          <SingleDelivery
            block={block ?? null}
            cancel={cancel}
            confirmation={confirmation}
            delivery={delivery}
            locale={locale}
            state={state}
          />
        ) : (
          <ManyDeliveries
            blocks={blocks}
            cancel={cancel}
            confirmation={confirmation}
            locale={locale}
            states={known}
          />
        )}
      </>
    );
  };
}

/** Spec 010 §14 A2.4's seam: this spec owns the `test` and `live` states. */
export function registerPaymentConfirmationStates(
  sources: PaymentConfirmationSources = DATABASE,
): void {
  const render = paymentConfirmationRenderer(sources);
  registerConfirmationState("test", render);
  registerConfirmationState("live", render);
}

registerPaymentConfirmationStates();
