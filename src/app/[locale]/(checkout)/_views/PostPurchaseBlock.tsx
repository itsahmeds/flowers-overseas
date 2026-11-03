/**
 * Spec 018's post-purchase block, its quiet cancel line and the confirm dialog (spec 018 §5.2
 * "Buyer cancellation", §5.3 `checkout/done`, §7; §14 A-founder-2026-10-14b B.1; AC-9, AC-28
 * confirmation half, AC-39, AC-43, AC-46; TASK-340; artboards
 * `docs/design/wireframes/confirmation-{desktop,mobile}.dc.html`, the `test`/`live` block and the
 * 2026-11-04 cancel-line redraw).
 *
 * Spec 013's `test` and `live` confirmation states (TASK-263) mount these parts, in this order:
 *
 *  1. `PostPurchaseBlock` inside the state's `.s13-conf` column, after its heading and arrival
 *     line: the masked email, "What happens next" with the four steps (undated, the current one
 *     `aria-current="step"`), the four tiles (track, calendar, invoice, share) and the contact
 *     line. Its root is `display: contents`, so each part is a child of the column's grid.
 *  2. `CancelLine` as the **last element of `<main>`**, under both columns (`.s18-foot`): while
 *     the order is in set P, one line, "Plans changed? You can cancel for free until we start
 *     preparing your order.", whose words "You can cancel for free" are the one text-styled
 *     `<button>` of a `<form method="post">` (`cancelOrderAsBuyerAction`, `step=review`). No
 *     panel, border, wash or icon. Outside set P it is absent, or, after a refused post, exactly
 *     `postPurchase.cancelRefused` with the WhatsApp link, focused, in ink.
 *  3. `CancelDialog` after it, only after the buyer pressed the line (`?cancel=review`): an open
 *     native `<dialog>` over the scrim, "Cancel this order?", "We refund {amount} in full." (the
 *     order's own total, in its currency), "Yes, cancel it" (posts `step=confirm`) and "Keep my
 *     order", which reloads the page without the dialog. The state wraps everything else in
 *     `inert` while `cancelDialogOpen` is true.
 *
 * **No refund or failure wording before the press** (AC-9, AC-46): the only refund sentence is
 * the dialog's, and no part names a florist, an acceptance or a hold (AC-39, AC-43). Both steps
 * are plain posts: nothing here needs JavaScript except the share tile, the page's one island.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney } from "@/modules/i18n";
import type { ConfirmationBlock, PostPurchaseStep } from "@/modules/orders";
import { checkoutButtonClass, FocusOnMount } from "@/modules/ui/checkout";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";

import { ShareTile } from "../../(track)/track/[token]/ShareTile";
import { cancelOrderAsBuyerAction } from "../checkout/done/actions";
import type { CancelUiState } from "../checkout/done/buyer-cancel";

/** The four steps' message keys (spec 018 §7 `postPurchase.steps`). */
const STEP_LABEL = {
  order: "postPurchase.steps.order",
  beingMade: "postPurchase.steps.beingMade",
  onItsWay: "postPurchase.steps.onItsWay",
  delivered: "postPurchase.steps.delivered",
} as const satisfies Readonly<Record<PostPurchaseStep["key"], string>>;

/** `.s13-next .tline li::before`, per state (34 px; the tracking page's markers, smaller). */
const MARKER: Readonly<Record<PostPurchaseStep["state"], string>> = {
  done: "bg-stem text-card",
  current: "bg-sky text-card shadow-[0_0_0_4px_var(--color-sage-wash)]",
  future:
    "bg-card text-mark shadow-[inset_0_0_0_1.5px_var(--color-mark),inset_0_0_0_5px_var(--color-card),inset_0_0_0_6px_var(--color-mark)]",
};

/** `.s13-tile`: a card from `md`, a ruled row with a chevron below it (`.M .s13-tile`). */
const TILE = [
  "text-ink grid content-start gap-[4px] text-start no-underline",
  "md:rounded-field md:bg-card md:px-[16px] md:pt-[16px] md:pb-[18px] md:shadow-[inset_0_0_0_1px_var(--color-rule)]",
  "max-md:border-rule max-md:min-h-[64px] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:border-b max-md:border-solid max-md:py-[14px]",
  "[&>b]:font-display [&>b]:text-[19px] [&>b]:leading-[1.2] [&>b]:font-(--font-weight-display)",
  "[&>span]:text-ink-2 [&>span]:text-sm [&>span]:leading-[1.4] max-md:[&>span]:col-start-1",
  "focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid",
].join(" ");
/** `.s13-tile.go`: the title is a link; a chevron on the phone. */
const TILE_GO = [
  TILE,
  "[&>b]:text-link [&>b]:underline [&>b]:decoration-[1.5px] [&>b]:underline-offset-[5px]",
  "max-md:after:text-ink-3 max-md:after:col-start-2 max-md:after:row-span-2 max-md:after:row-start-1 max-md:after:text-[26px] max-md:after:content-['\\203A']",
].join(" ");
/** `.s13-tile.st`: a state, not a link. */
const TILE_STATE = `${TILE} [&>b]:text-ink`;

/** `.cxl button`: plain text, the link colour, underlined; 44 px tall; the usual focus ring. */
const LINE_BUTTON =
  "text-link min-h-(--target-min) cursor-pointer border-0 bg-transparent p-0 [font:inherit] underline decoration-[1.5px] underline-offset-[4px] focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid";

/** The refused sentence's id: focused when it appears. */
const REFUSED_ID = "cancel-refused";

function calendarDay(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

function bold(chunks: ReactNode): ReactElement {
  return <b className="text-ink font-bold">{chunks}</b>;
}

/** The block (part 1 of the file header). */
export async function PostPurchaseBlock({
  block,
  locale,
}: {
  readonly block: ConfirmationBlock;
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const t = await getTranslations({ locale, namespace: "tracking" });
  const headingId = `post-purchase-next-${block.reference}`;
  return (
    <div className="contents" data-fo-post-purchase="">
      {block.maskedEmail === null ? null : (
        <p className="text-ui text-ink-2 m-0" data-fo-post-purchase-email="">
          {c.rich("postPurchase.emailSent", {
            email: block.maskedEmail,
            b: bold,
          })}
        </p>
      )}
      <section aria-labelledby={headingId} className="w-full">
        <h2 className="display text-h3 m-0 mb-[14px]" id={headingId}>
          {c("postPurchase.nextTitle")}
        </h2>
        <ol className="m-0 grid list-none p-0">
          {block.steps.map((step, index) => {
            const last = index === block.steps.length - 1;
            return (
              <li
                aria-current={step.state === "current" ? "step" : undefined}
                className="relative grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-[18px] gap-y-[4px] pb-[12px]"
                data-fo-post-purchase-step={step.key}
                data-fo-post-purchase-state={step.state}
                key={step.key}
              >
                <span
                  aria-hidden="true"
                  className={`font-display text-ui grid h-[34px] w-[34px] place-items-center rounded-full ${MARKER[step.state]}`}
                >
                  {step.state === "done" ? "✓" : String(index + 1)}
                </span>
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className={`absolute start-[16px] top-[38px] bottom-[4px] border-s-2 ${step.state === "done" ? "border-stem border-solid" : "border-rule border-dashed"}`}
                  />
                )}
                <h3
                  className={`m-0 pt-[5px] text-[18px] leading-[1.2] ${step.state === "future" ? "text-ink-3" : "text-ink"}`}
                >
                  {c(STEP_LABEL[step.key])}
                </h3>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="max-md:border-rule grid w-full grid-cols-1 gap-0 max-md:border-t max-md:border-solid md:grid-cols-2 md:gap-[12px]">
        <a
          className={TILE_GO}
          data-fo-post-purchase-track=""
          href={block.trackingPath}
        >
          <b>{c("postPurchase.trackTitle")}</b>
          <span>{c("postPurchase.trackBody")}</span>
        </a>
        <a
          className={TILE_GO}
          data-fo-post-purchase-calendar=""
          href={block.calendarPath}
        >
          <b>{t("calendar.title")}</b>
          <span>
            {t("calendar.when", {
              date: formatDate(
                calendarDay(block.deliveryDate),
                locale,
                "weekdayDayMonth",
                "UTC",
              ),
            })}
          </span>
        </a>
        <div
          className={TILE_STATE}
          data-fo-post-purchase-invoice={block.invoice}
        >
          <b>{c("postPurchase.invoiceTitle")}</b>
          <span>
            {block.invoice === "issued"
              ? c("postPurchase.invoiceIssued")
              : c("postPurchase.invoicePending")}
          </span>
        </div>
        <ShareTile
          body={t("share.body")}
          className={`${TILE_GO} cursor-pointer border-x-0 border-t-0 bg-transparent font-[inherit]`}
          copied={t("share.copied")}
          title={t("share.title")}
          url={block.trackingUrl}
        />
      </div>
      <p
        className="text-ink-2 m-0 flex flex-wrap items-baseline gap-x-[16px] gap-y-[4px] text-sm"
        data-fo-post-purchase-contact=""
      >
        <span>{t("help.quote", { reference: block.reference })}</span>
        <a
          className="text-link font-bold underline underline-offset-[4px]"
          href={whatsappHref(COMPANY.contact)}
        >
          {t("help.whatsapp", { phone: COMPANY.contact.phoneDisplay })}
        </a>
        <span>{t("help.hours")}</span>
      </p>
    </div>
  );
}

/** Whether the confirm dialog is open for this delivery: the state then makes the rest `inert`. */
export function cancelDialogOpen(
  block: ConfirmationBlock,
  line: number,
  state: CancelUiState,
): boolean {
  return (
    block.cancelLine !== null && state?.step === "review" && state.line === line
  );
}

/** `.s18-foot`: its own row under the grid, on the content edge, 40 px before the footer. */
const FOOT = `${PAGE_FRAME} pt-[8px] pb-[40px] max-md:pt-[4px] max-md:pb-[32px]`;
/** `.s18-foot .cxl`. */
const LINE = "text-ink-2 m-0 pt-[22px] pb-[8px] text-sm";

/** The quiet line, or the refusal in its place (part 2 of the file header). */
export async function CancelLine({
  block,
  locale,
  line,
  state,
}: {
  readonly block: ConfirmationBlock;
  readonly locale: LocaleCode;
  /** The delivery's 1-based position in the purchase. */
  readonly line: number;
  readonly state: CancelUiState;
}): Promise<ReactElement | null> {
  const c = await getTranslations({ locale, namespace: "confirmation" });
  if (block.cancelLine === null) {
    if (state?.step !== "refused" || state.line !== line) return null;
    const t = await getTranslations({ locale, namespace: "tracking" });
    return (
      <div className={FOOT} data-fo-cancel-refused="">
        <p
          autoFocus
          className={`${LINE} text-ink`}
          id={REFUSED_ID}
          role="status"
          tabIndex={-1}
        >
          {c("postPurchase.cancelRefused")}
        </p>
        <FocusOnMount targetId={REFUSED_ID} />
        <p className="m-0 text-sm">
          <a
            className="text-link font-bold underline underline-offset-[4px]"
            href={whatsappHref(COMPANY.contact)}
          >
            {t("help.whatsapp", { phone: COMPANY.contact.phoneDisplay })}
          </a>
        </p>
      </div>
    );
  }
  return (
    <div className={FOOT} data-fo-cancel-line="">
      <form
        action={cancelOrderAsBuyerAction.bind(null, locale, block.reference)}
      >
        <p className={LINE}>
          {c.rich("postPurchase.cancelLine", {
            cancel: (chunks) => (
              <button
                className={LINE_BUTTON}
                name="step"
                type="submit"
                value="review"
              >
                {chunks}
              </button>
            ),
          })}
        </p>
      </form>
    </div>
  );
}

/** The confirm step (part 3 of the file header); `null` unless the buyer pressed the line. */
export async function CancelDialog({
  block,
  locale,
  line,
  state,
}: {
  readonly block: ConfirmationBlock;
  readonly locale: LocaleCode;
  readonly line: number;
  readonly state: CancelUiState;
}): Promise<ReactElement | null> {
  const cancel = block.cancelLine;
  if (cancel === null || !cancelDialogOpen(block, line, state)) return null;
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const titleId = `cancel-title-${block.reference}`;
  const bodyId = `cancel-body-${block.reference}`;
  return (
    <dialog
      aria-describedby={bodyId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="text-ink fixed inset-0 z-[60] m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-(--color-scrim) p-0"
      data-fo-cancel-dialog=""
      open
    >
      <div className="bg-card rounded-field grid w-[480px] max-w-[calc(100%-40px)] gap-[14px] px-[28px] py-[26px] shadow-(--shadow-md) max-md:w-[350px] max-md:px-[20px] max-md:py-[22px]">
        <h2 className="display m-0 text-lg leading-[1.15]" id={titleId}>
          {c("postPurchase.cancelConfirmTitle")}
        </h2>
        <p className="m-0" id={bodyId}>
          {c("postPurchase.cancelConfirmBody", {
            amount: formatMoney(
              {
                amountMinor: cancel.amount.amountMinor,
                currency: cancel.amount.currencyCode,
              },
              locale,
            ),
          })}
        </p>
        <div className="flex flex-wrap gap-[10px]">
          <form
            action={cancelOrderAsBuyerAction.bind(
              null,
              locale,
              block.reference,
            )}
            className="contents"
          >
            <button
              className={checkoutButtonClass("primary", "sm")}
              name="step"
              type="submit"
              value="confirm"
            >
              {c("postPurchase.cancelConfirmYes")}
            </button>
          </form>
          <form
            action={`/${locale}/checkout/done`}
            className="contents"
            method="get"
          >
            <button
              autoFocus
              className={checkoutButtonClass("ghost", "sm")}
              type="submit"
            >
              {c("postPurchase.cancelConfirmNo")}
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}
