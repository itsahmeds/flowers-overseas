/**
 * @purpose The order page's Actions card: reroute, cancel and refund, their dialogs, results, every "Not available" reason, the phone sheet (020a AC-3, AC-9 to AC-23)
 * @spec 020a
 *
 * Server-rendered (spec 020a §5.3; artboards `admin-order-actions-*`, `admin-order-reroute-*`,
 * `admin-order-cancel-*`). The card shows the controls `availableActions` allows for the order's
 * status, mode and the viewer's roles; a control the viewer's role cannot press is absent with its
 * reason as text; a demo order reads "Demo order: no actions". For `no_partner_available` the
 * card carries the grace end in the viewer's zone and the destination's zone (AC-12) and the
 * reroute dialog lists `rerouteCandidates` (AC-9). The cancel dialog offers the reasons the
 * table gives the status (AC-13, AC-14) and says what will follow in admin words.
 *
 * Every form carries a fresh `actionId` per render and the order's highest event `seq` it saw
 * (`expectedSeq`), so a double submit has one effect and a stale page changes nothing. After a
 * submission the action redirects back with `?action=…&result=…`; a refusal re-opens its dialog
 * with the message.
 *
 * TASK-361: under the buttons, "Not available" lists every control that cannot act, one reason
 * line each (`panel-reasons.ts`), so the card answers all four controls for every status, mode
 * and role (AC-3). Resend results are the emails list's (`order-lists.tsx`), not this card's.
 *
 * TASK-361 (finish): the refund dialogs (`admin-order-refund-*`): "Refund in full" (the remaining
 * balance, never typed; on a cancelled order with a failed automatic refund "Retry in full", with
 * the cancellation's reason fixed by the server; on the abandoned anomaly reason Other, fixed),
 * and "Refund in part" (`MoneyInput`, `suggestedRefunds`, `ReasonPicker`), both posting to
 * `refundOrderAction`. They render only while the card provider has keys (`refundReady`); until
 * then each refund control the table allows reads the `provider` line under "Not available", and
 * a forged post refuses with `PROVIDER_NOT_CONFIGURED`. On a phone the card folds into the
 * Actions bar and its sheet (`AdminActionsSheet`) whenever it has a control.
 */
import { randomUUID } from "node:crypto";

import type { ReactElement, ReactNode } from "react";

import { isCurrencyCode } from "@/config/currencies";
import {
  ADMIN_AMOUNT_TEXT_MAX,
  ADMIN_NAV,
  ADMIN_NOTE_MAX,
  adminRefundReasons,
  adminT,
  availableActions,
  graceEndDisplay,
  isOrderActionStatus,
  minorUnitsText,
  suggestedRefunds,
} from "@/modules/admin";
import { formatMoney } from "@/modules/i18n";
import type { AdminOrderDetail } from "@/modules/orders";
import type {
  NoPartnerGrace,
  RerouteCandidate,
} from "@/modules/orders/routing/jobs";
import { AdminActionDialog } from "@/modules/ui/admin/AdminActionDialog";
import { AdminActionsSheet } from "@/modules/ui/admin/AdminActionsSheet";
import { AdminCancelForm } from "@/modules/ui/admin/AdminCancelForm";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminNote,
  AdminRow,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import { AdminPendingSubmit } from "@/modules/ui/admin/AdminPendingSubmit";

import { deliveryDay } from "../view";
import {
  cancelOrderAction,
  refundOrderAction,
  rerouteOrderAction,
} from "./actions";
import {
  PANEL_CONTROLS,
  type PanelControl,
  unavailableReason,
} from "./panel-reasons";
import { refundReasonText } from "./order-lists";
import { AdminRefundForm, type RefundFormCopy } from "./refund-form";

/** What the page read for the panel. */
export interface OrderActionsData {
  readonly order: AdminOrderDetail;
  readonly roles: readonly string[];
  readonly viewerZone: string;
  /** Captured, remaining and in-flight, from `orderRefunds`. */
  readonly capturedMinor: bigint;
  readonly remainingMinor: bigint;
  readonly refundInFlight: boolean;
  /** The automatic refund a cancel caused, once its row exists (the done line's amount). */
  readonly cancelRefundMinor: bigint | null;
  /** A cancelled order's automatic refund, when it failed: the retry's banner. */
  readonly failedAutomatic: {
    readonly amountMinor: bigint;
    readonly reason: string;
  } | null;
  /** The refund a submission just requested (`?ref=`), for the done line. */
  readonly requestedRefundMinor: bigint | null;
  /** The card provider has keys, so the refund dialogs can act (payments' `adminRefundDeps`). */
  readonly refundReady: boolean;
  readonly candidates: readonly RerouteCandidate[];
  readonly grace: NoPartnerGrace | null;
  /** `?action=…&result=…` of the last submission. */
  readonly outcome: { readonly action: string; readonly result: string } | null;
}

type RefundKind = "refund_full" | "refund_partial";

function isRefund(action: string): action is RefundKind {
  return action === "refund_full" || action === "refund_partial";
}

/** The refusal message of a code, per action (§5.2 "Result": one admin key per code). */
function refusal(action: "reroute" | "cancel", code: string): string {
  switch (code) {
    case "ORDER_CHANGED":
    case "DEMO_ORDER":
    case "FORBIDDEN":
    case "INPUT_INVALID":
    case "PARTNER_NOT_ELIGIBLE":
    case "ROUTING_DEADLINE_PASSED":
    case "CANCEL_REASON_NOT_ALLOWED":
      return adminT(`admin.orderActions.refused.${code}`);
    case "ORDER_TRANSITION_ILLEGAL":
      return adminT(
        action === "reroute"
          ? "admin.orderActions.refused.REROUTE_ILLEGAL"
          : "admin.orderActions.refused.CANCEL_ILLEGAL",
      );
    default:
      return adminT("admin.orderActions.refused.other");
  }
}

function money(amountMinor: bigint, currency: string): string {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `an order currency the application does not configure: ${currency}`,
    );
  }
  return formatMoney({ amountMinor, currency }, "en");
}

/** The florist holding the order: an offer still open, or accepted. */
function holder(order: AdminOrderDetail): string | undefined {
  return order.assignments
    .filter((a) => a.response === null || a.response === "accept")
    .at(-1)?.partnerCode;
}

/** The order's highest `order_event.seq`: every form's `expectedSeq`. */
export function highestSeq(order: AdminOrderDetail): number {
  return order.events.reduce((max, event) => Math.max(max, event.seq), 0);
}

function Hidden({
  fields,
}: {
  readonly fields: Readonly<Record<string, string>>;
}): ReactElement {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function GraceLine({
  grace,
  viewerZone,
}: {
  readonly grace: NoPartnerGrace;
  readonly viewerZone: string;
}): ReactElement {
  const shown = graceEndDisplay(
    grace.graceEnd,
    grace.destinationZone,
    viewerZone,
  );
  return (
    <p
      role="note"
      className="bg-butter text-ink grid gap-[2px] rounded-[10px] px-[12px] py-[10px] text-[14px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-warning)]"
    >
      <b>
        {adminT("admin.orderActions.grace", {
          time: shown.viewer.time,
          city: shown.viewer.city,
        })}
      </b>
      <span className="text-ink-2 text-[13px]">
        {adminT("admin.orderActions.graceDestination", {
          time: shown.destination.time,
          city: shown.destination.city,
          zone: shown.destination.zone,
        })}
      </span>
    </p>
  );
}

function florists(): string | undefined {
  const entry = ADMIN_NAV.find((nav) => nav.key === "partners");
  return entry?.built === true ? entry.href : undefined;
}

function RerouteList({
  data,
  seq,
}: {
  readonly data: OrderActionsData;
  readonly seq: number;
}): ReactNode {
  if (data.candidates.length === 0) {
    const href = florists();
    return (
      <p className="text-ink-2 text-[14px]">
        {adminT.rich("admin.orderActions.reroute.empty", {
          link: (chunks) =>
            href === undefined ? (
              chunks
            ) : (
              <AdminTableLink href={href}>{chunks}</AdminTableLink>
            ),
        })}
      </p>
    );
  }
  return (
    <AdminTable
      columns={[
        { key: "rank", label: adminT("admin.orderActions.reroute.rank") },
        { key: "florist", label: adminT("admin.orderActions.reroute.florist") },
        { key: "town", label: adminT("admin.orderActions.reroute.town") },
        {
          key: "payout",
          label: adminT("admin.orderActions.reroute.payout"),
          align: "end",
        },
        { key: "earlier", label: adminT("admin.orderActions.reroute.earlier") },
        { key: "offer", label: "", align: "end" },
      ]}
    >
      {data.candidates.map((candidate) => (
        <AdminRow key={candidate.partnerId}>
          <AdminCell>
            <span className="bg-paper-2 inline-grid size-[24px] place-items-center rounded-full text-[12px] font-bold tabular-nums shadow-[inset_0_0_0_1px_var(--color-rule)]">
              {candidate.rankPosition}
            </span>
          </AdminCell>
          <AdminCell nowrap>
            <b>{candidate.displayName}</b>
          </AdminCell>
          <AdminCell>{candidate.city}</AdminCell>
          <AdminCell align="end">
            {money(BigInt(candidate.payoutMinor), candidate.payoutCurrency)}
          </AdminCell>
          <AdminCell>
            {candidate.previously === null ? (
              <AdminNote>{adminT("admin.orderActions.reroute.none")}</AdminNote>
            ) : (
              <AdminChip tone="warn">
                {adminT(`admin.orderActions.reroute.${candidate.previously}`)}
              </AdminChip>
            )}
          </AdminCell>
          <AdminCell align="end">
            <form action={rerouteOrderAction}>
              <Hidden
                fields={{
                  orderId: data.order.orderId,
                  actionId: randomUUID(),
                  expectedSeq: String(seq),
                  partnerId: candidate.partnerId,
                }}
              />
              <AdminPendingSubmit
                label={adminT("admin.orderActions.reroute.offer")}
                pendingLabel={adminT("admin.orderActions.reroute.offering")}
                accessibleName={adminT("admin.orderActions.reroute.offerTo", {
                  florist: candidate.displayName,
                })}
              />
            </form>
          </AdminCell>
        </AdminRow>
      ))}
    </AdminTable>
  );
}

/** One "Not available" line: the control's label and its one reason. */
export interface UnavailableLine {
  readonly control: PanelControl;
  readonly label: string;
  readonly reason: string;
}

const CONTROL_LABEL: Readonly<
  Record<
    PanelControl,
    | "admin.orderActions.control.reroute"
    | "admin.orderActions.control.cancel"
    | "admin.orderActions.control.refundFull"
    | "admin.orderActions.control.refundPartial"
  >
> = {
  reroute: "admin.orderActions.control.reroute",
  cancel: "admin.orderActions.control.cancel",
  refundFull: "admin.orderActions.control.refundFull",
  refundPartial: "admin.orderActions.control.refundPartial",
};

/**
 * Every control that cannot act now, in the card's order, with its reason (AC-3). A refund the
 * table allows is listed with the `provider` line while the card provider has no keys
 * (`refundReady` false). On a cancelled order "Refund in full" is the retry, labelled so.
 */
export function notAvailable(
  available: ReturnType<typeof availableActions>,
  status: Parameters<typeof unavailableReason>[2],
  refundReady: boolean,
): UnavailableLine[] {
  const lines: UnavailableLine[] = [];
  for (const control of PANEL_CONTROLS) {
    const state = available[control];
    const cause = state.available
      ? (control === "refundFull" || control === "refundPartial") &&
        !refundReady
        ? "provider"
        : null
      : state.cause;
    if (cause === null) continue;
    const retry =
      control === "refundFull" &&
      (status === "cancelled" || status === "cancelled_refunded");
    lines.push({
      control,
      label: adminT(
        retry ? "admin.orderActions.control.retryFull" : CONTROL_LABEL[control],
      ),
      reason: adminT(unavailableReason(control, cause, status)),
    });
  }
  return lines;
}

/** A refund's refusal: under the amount field when it is about the amount, else at the top. */
function refundRefusal(
  kind: RefundKind,
  code: string,
  data: OrderActionsData,
): { readonly field: "amount" | null; readonly message: string } {
  const left = money(data.remainingMinor, data.order.currency);
  if (kind === "refund_partial") {
    if (code === "AMOUNT_INVALID") {
      return {
        field: "amount",
        message: adminT("admin.orderActions.refund.invalid"),
      };
    }
    if (code === "REFUND_EXCEEDS_CAPTURED") {
      return {
        field: "amount",
        message: adminT("admin.orderActions.refund.exceeds", { amount: left }),
      };
    }
    if (code === "USE_FULL_REFUND") {
      return {
        field: "amount",
        message: adminT("admin.orderActions.refund.whole"),
      };
    }
  }
  switch (code) {
    case "ORDER_CHANGED": {
      // Another refund got there first (two tabs): say how much is left now (artboard state
      // "Another refund got there first"); any other change reads the stale-page line.
      const last = data.order.events.reduce<
        (typeof data.order.events)[number] | undefined
      >(
        (latest, event) =>
          latest === undefined || event.seq > latest.seq ? event : latest,
        undefined,
      );
      return {
        field: null,
        message:
          last?.type.startsWith("order.refund") === true
            ? adminT("admin.orderActions.refused.REFUND_ORDER_CHANGED", {
                amount: left,
              })
            : adminT("admin.orderActions.refused.ORDER_CHANGED"),
      };
    }
    case "NOT_REFUNDABLE":
    case "CURRENCY_MISMATCH":
    case "PROVIDER_NOT_CONFIGURED":
    case "DEMO_ORDER":
    case "FORBIDDEN":
    case "INPUT_INVALID":
      return {
        field: null,
        message: adminT(`admin.orderActions.refused.${code}`),
      };
    default:
      return {
        field: null,
        message: adminT("admin.orderActions.refused.other"),
      };
  }
}

/** The reason of the order's latest cancellation event, if it carries one. */
function cancellationReason(order: AdminOrderDetail): string | undefined {
  const event = order.events
    .filter(
      (e) =>
        e.type === "order.cancelled" || e.type === "order.cancelled_refunded",
    )
    .at(-1);
  const reason = event?.payload["reason"];
  return typeof reason === "string" ? reason : undefined;
}

function refundCopy(remaining: string, currency: string): RefundFormCopy {
  return {
    amount: adminT("admin.orderActions.refund.amount"),
    amountName: adminT("admin.orderActions.refund.amountName", { currency }),
    amountPlaceholder: adminT("admin.orderActions.refund.amountPlaceholder"),
    amountHint: adminT("admin.orderActions.refund.amountHint", {
      amount: remaining,
    }),
    invalid: adminT("admin.orderActions.refund.invalid"),
    exceeds: adminT("admin.orderActions.refund.exceeds", { amount: remaining }),
    whole: adminT("admin.orderActions.refund.whole"),
    suggested: adminT("admin.orderActions.refund.suggested"),
    suggestedHint: adminT("admin.orderActions.refund.suggestedHint"),
    reason: adminT("admin.orderActions.refund.reason"),
    reasonRequired: adminT("admin.orderActions.refund.reasonRequired"),
    note: adminT("admin.orderActions.cancel.note"),
    noteOptional: adminT("admin.orderActions.cancel.noteOptional"),
    noteHint: adminT("admin.orderActions.cancel.noteHint"),
    noteCount: adminT.raw("admin.orderActions.cancel.noteCount"),
    noteRequired: adminT("admin.orderActions.cancel.noteRequired"),
    goesBack: adminT("admin.orderActions.refund.goesBack"),
    buyerGets: adminT("admin.orderActions.refund.buyerGets"),
    keep: adminT("admin.orderActions.refund.keep"),
    submit: adminT.raw("admin.orderActions.refund.submit"),
    submitBare: adminT("admin.orderActions.refund.submitBare"),
    refunding: adminT("admin.orderActions.refund.refunding"),
  };
}

/** The dialog title: the words, then the order's reference in the smaller grey (`.num`). */
function refundTitle(words: string, reference: string): ReactElement {
  return (
    <>
      {words}{" "}
      <span className="text-ink-3 text-[16px] font-normal tabular-nums">
        {reference}
      </span>
    </>
  );
}

export function OrderActionsPanel({
  data,
}: {
  readonly data: OrderActionsData;
}): ReactElement | null {
  const { order } = data;
  if (!isOrderActionStatus(order.status)) return null;
  const outcome = data.outcome;
  const card = (children: ReactNode) => (
    <section
      aria-label={adminT("admin.orderActions.title")}
      className="bg-card grid min-w-0 gap-[14px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px] md:py-[18px]"
    >
      <h2 className="text-[20px] leading-[1.2]">
        {adminT("admin.orderActions.title")}
      </h2>
      {children}
    </section>
  );

  if (order.mode === "demo") {
    return card(
      <p className="text-ink-2 text-[14px]">
        {adminT("admin.orderActions.demo")}
      </p>,
    );
  }

  const available = availableActions(
    {
      status: order.status,
      mode: order.mode,
      capturedMinor: data.capturedMinor,
      remainingMinor: data.remainingMinor,
      refundInFlight: data.refundInFlight,
    },
    { roles: data.roles },
  );
  const seq = highestSeq(order);
  const base = { orderId: order.orderId, expectedSeq: String(seq) };
  const refused = (action: "reroute" | "cancel"): string | undefined =>
    outcome?.action === action && outcome.result !== "done"
      ? refusal(action, outcome.result)
      : undefined;
  const reroutedTo = holder(order);
  const done =
    outcome?.result !== "done"
      ? undefined
      : outcome.action === "reroute" && reroutedTo !== undefined
        ? adminT("admin.orderActions.reroute.done", { florist: reroutedTo })
        : outcome.action === "cancel"
          ? adminT("admin.orderActions.cancel.done", {
              amount: money(
                data.cancelRefundMinor ?? data.remainingMinor,
                order.currency,
              ),
            })
          : isRefund(outcome.action) && data.requestedRefundMinor !== null
            ? adminT("admin.orderActions.refund.done", {
                amount: money(data.requestedRefundMinor, order.currency),
              })
            : undefined;

  const unavailable = notAvailable(available, order.status, data.refundReady);

  const grace =
    order.status === "no_partner_available" && data.grace !== null ? (
      <GraceLine grace={data.grace} viewerZone={data.viewerZone} />
    ) : null;

  const rerouteRefusal = refused("reroute");
  const reroute = available.reroute.available ? (
    <AdminActionDialog
      id="order-action-reroute"
      openLabel={adminT("admin.orderActions.reroute.open")}
      openTone="primary"
      wide
      initiallyOpen={rerouteRefusal !== undefined}
      closeLabel={adminT("admin.orderActions.close")}
      sheetCloseLabel={adminT("admin.orderActions.close")}
      title={adminT("admin.orderActions.reroute.title", {
        reference: order.reference,
      })}
    >
      {rerouteRefusal === undefined ? null : (
        <AdminRefusal>{rerouteRefusal}</AdminRefusal>
      )}
      <p className="text-ink-2 text-[14px]">
        {adminT("admin.orderActions.reroute.intro")}
      </p>
      {grace}
      <RerouteList data={data} seq={seq} />
      <p className="text-ink-3 text-[13px] leading-[1.4]">
        {adminT("admin.orderActions.reroute.footnote", {
          date: deliveryDay(order.deliveryDate),
        })}
      </p>
    </AdminActionDialog>
  ) : null;

  const cancelRefusal = refused("cancel");
  let cancel: ReactNode = null;
  if (available.cancel.available) {
    const amount = money(data.remainingMinor, order.currency);
    const afterAcceptance =
      order.status === "accepted" || order.status === "paid";
    const florist = holder(order);
    const consequences = [
      adminT("admin.orderActions.cancel.refund", { amount }),
      ...(florist === undefined
        ? []
        : [adminT("admin.orderActions.cancel.florist", { florist })]),
      ...(afterAcceptance && florist !== undefined
        ? [adminT("admin.orderActions.cancel.payout", { florist })]
        : []),
    ];
    cancel = (
      <AdminActionDialog
        id="order-action-cancel"
        openLabel={adminT("admin.orderActions.cancel.open")}
        openTone="danger"
        initiallyOpen={cancelRefusal !== undefined}
        sheetCloseLabel={adminT("admin.orderActions.close")}
        title={adminT("admin.orderActions.cancel.title", {
          reference: order.reference,
        })}
      >
        {cancelRefusal === undefined ? null : (
          <AdminRefusal>{cancelRefusal}</AdminRefusal>
        )}
        {afterAcceptance && florist !== undefined ? (
          <p className="text-ink-2 text-[14px]">
            {adminT("admin.orderActions.cancel.accepted", { florist })}
          </p>
        ) : null}
        <AdminCancelForm
          action={cancelOrderAction}
          hidden={{ ...base, actionId: randomUUID() }}
          legend={adminT("admin.orderActions.cancel.why")}
          reasons={available.cancel.reasons.map((reason) => ({
            value: reason,
            label: adminT(`admin.orderActions.cancel.reason.${reason}`),
            buyerSentence: adminT(
              reason === "buyer_cancel"
                ? "admin.orderActions.cancel.youCancelled"
                : "admin.orderActions.cancel.couldNotDeliver",
              { amount },
            ),
          }))}
          noteLabel={adminT("admin.orderActions.cancel.note")}
          noteOptionalLabel={adminT("admin.orderActions.cancel.noteOptional")}
          noteHint={adminT("admin.orderActions.cancel.noteHint")}
          noteCountTemplate={adminT.raw("admin.orderActions.cancel.noteCount")}
          noteMax={ADMIN_NOTE_MAX}
          noteRequired={adminT("admin.orderActions.cancel.noteRequired")}
          whatHappens={adminT("admin.orderActions.cancel.whatHappens")}
          consequences={consequences}
          buyerEmail={adminT("admin.orderActions.cancel.buyerEmail")}
          keepLabel={adminT("admin.orderActions.cancel.keep")}
          confirmLabel={adminT("admin.orderActions.cancel.confirm")}
          pendingLabel={adminT("admin.orderActions.cancel.cancelling")}
        />
      </AdminActionDialog>
    );
  }

  const remaining = money(data.remainingMinor, order.currency);
  const refundRefused = (kind: RefundKind) =>
    outcome?.action === kind && outcome.result !== "done"
      ? refundRefusal(kind, outcome.result, data)
      : null;
  const currency = isCurrencyCode(order.currency) ? order.currency : null;
  const reasonOptions = adminRefundReasons.map((reason) => ({
    value: reason,
    label: refundReasonText(reason),
  }));
  const refundHidden = () => ({ ...base, actionId: randomUUID() });

  let refundFull: ReactNode = null;
  let retryBanner: ReactNode = null;
  if (data.refundReady && currency !== null && available.refundFull.available) {
    const source = available.refundFull.reasonSource;
    const retry = source === "cancellation";
    const fixed =
      source === "chosen"
        ? null
        : refundReasonText(
            source === "other"
              ? "other"
              : (cancellationReason(order) ??
                  data.failedAutomatic?.reason ??
                  "other"),
          );
    if (retry && data.failedAutomatic !== null) {
      // `.ad-banner.bad`: the failed refund on the blush.
      retryBanner = (
        <p
          role="note"
          className="bg-blush text-ink rounded-[10px] px-[14px] py-[10px] text-[14px]"
        >
          {adminT("admin.orderActions.refund.failedAutomatic", {
            amount: money(data.failedAutomatic.amountMinor, order.currency),
            reason: fixed ?? "",
          })}
        </p>
      );
    }
    const refused = refundRefused("refund_full");
    refundFull = (
      <AdminActionDialog
        id="order-action-refund-full"
        openLabel={adminT(
          retry
            ? "admin.orderActions.refund.openRetry"
            : "admin.orderActions.refund.openFull",
          { amount: remaining },
        )}
        openTone={retry ? "primary" : "ghost"}
        size="medium"
        initiallyOpen={refused !== null}
        sheetCloseLabel={adminT("admin.orderActions.close")}
        title={refundTitle(
          adminT(
            retry
              ? "admin.orderActions.refund.titleRetry"
              : "admin.orderActions.refund.titleFull",
          ),
          order.reference,
        )}
      >
        <AdminRefundForm
          action={refundOrderAction}
          kind="full"
          hidden={refundHidden()}
          currency={currency}
          remainingMinor={data.remainingMinor.toString()}
          summary={[
            {
              key: "charged",
              label: adminT("admin.orderActions.refunds.charged"),
              value: money(data.capturedMinor, order.currency),
            },
            {
              key: "onItsWay",
              label: adminT("admin.orderActions.refunds.onItsWay"),
              value: money(
                data.capturedMinor - data.remainingMinor,
                order.currency,
              ),
            },
            {
              key: "now",
              label: adminT("admin.orderActions.refund.now"),
              value: remaining,
            },
          ]}
          reasons={reasonOptions}
          fixedReason={
            fixed === null
              ? null
              : {
                  line: adminT("admin.orderActions.refund.fixedReason", {
                    reason: fixed,
                  }),
                  // The schema needs one of the seven; for a fixed source the server ignores it
                  // and records its own reason (`adminOrderRefund`). Goodwill needs no note.
                  value: "goodwill",
                }
          }
          suggestions={[]}
          copy={refundCopy(remaining, order.currency)}
          noteMax={ADMIN_NOTE_MAX}
          fieldMaxLength={ADMIN_AMOUNT_TEXT_MAX}
          refusal={refused}
        />
      </AdminActionDialog>
    );
  }

  let refundPartial: ReactNode = null;
  if (
    data.refundReady &&
    currency !== null &&
    available.refundPartial.available
  ) {
    const lines = new Map(order.lines.map((line) => [line.lineId, line]));
    const suggestions = suggestedRefunds({
      lines: order.lines.map((line) => ({
        id: line.lineId,
        kind: line.kind,
        qty: line.qty,
        unitRetailMinor: BigInt(line.unitRetailMinor),
      })),
      buyerTotalMinor: BigInt(order.totalMinor),
      remainingMinor: data.remainingMinor,
    }).map((suggestion) => {
      const line =
        suggestion.lineId === undefined
          ? undefined
          : lines.get(suggestion.lineId);
      const reasonText = refundReasonText(suggestion.reason);
      return {
        key: suggestion.lineId ?? suggestion.reason,
        reason: suggestion.reason,
        label:
          line === undefined
            ? reasonText
            : adminT("admin.orderActions.refund.suggestedAddon", {
                item:
                  line.qty === 1
                    ? (line.name ?? adminT("admin.orders.detail.addon"))
                    : adminT("admin.orders.detail.quantity", {
                        name: line.name ?? adminT("admin.orders.detail.addon"),
                        qty: line.qty,
                      }),
              }),
        text: minorUnitsText(suggestion.amountMinor, currency),
        amount: money(suggestion.amountMinor, order.currency),
      };
    });
    const refused = refundRefused("refund_partial");
    refundPartial = (
      <AdminActionDialog
        id="order-action-refund-partial"
        openLabel={adminT("admin.orderActions.refund.openPartial")}
        openTone="ghost"
        size="medium"
        initiallyOpen={refused !== null}
        sheetCloseLabel={adminT("admin.orderActions.close")}
        title={refundTitle(
          adminT("admin.orderActions.refund.titlePartial"),
          order.reference,
        )}
      >
        <AdminRefundForm
          action={refundOrderAction}
          kind="partial"
          hidden={refundHidden()}
          currency={currency}
          remainingMinor={data.remainingMinor.toString()}
          summary={[]}
          reasons={reasonOptions}
          fixedReason={null}
          suggestions={suggestions}
          copy={refundCopy(remaining, order.currency)}
          noteMax={ADMIN_NOTE_MAX}
          fieldMaxLength={ADMIN_AMOUNT_TEXT_MAX}
          refusal={refused}
        />
      </AdminActionDialog>
    );
  }

  const outcomeRefusal =
    outcome !== null &&
    outcome.result !== "done" &&
    outcome.action !== "resend" &&
    ((outcome.action === "reroute" && reroute === null) ||
      (outcome.action === "cancel" && cancel === null))
      ? refusal(
          outcome.action === "reroute" ? "reroute" : "cancel",
          outcome.result,
        )
      : outcome !== null &&
          outcome.result !== "done" &&
          isRefund(outcome.action) &&
          (outcome.action === "refund_full" ? refundFull : refundPartial) ===
            null
        ? refundRefusal(outcome.action, outcome.result, data).message
        : undefined;

  const controls = [reroute, cancel, refundFull, refundPartial].filter(
    (control) => control !== null,
  ).length;
  const panel = card(
    <>
      {done === undefined ? null : <AdminToast>{done}</AdminToast>}
      {outcomeRefusal === undefined ? null : (
        <AdminRefusal>{outcomeRefusal}</AdminRefusal>
      )}
      {grace}
      {retryBanner}
      {controls === 0 ? null : (
        <div className="grid gap-[8px]">
          {reroute}
          {cancel}
          {refundFull}
          {refundPartial}
        </div>
      )}
      {unavailable.length === 0 ? null : (
        <div className="grid gap-[6px]">
          <h3 className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase">
            {adminT("admin.orderActions.notAvailable")}
          </h3>
          <ul className="text-ink-2 grid gap-[6px] text-[13px] leading-[1.4]">
            {unavailable.map((line) => (
              <li key={line.control}>
                <b className="text-ink">{line.label}</b> · {line.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>,
  );
  // A card with no control stays in place on a phone too (artboard: "Finished and demo orders
  // have no bar; their reasons sit in a card").
  if (controls === 0) return panel;

  const graceBar =
    order.status === "no_partner_available" && data.grace !== null
      ? graceEndDisplay(
          data.grace.graceEnd,
          data.grace.destinationZone,
          data.viewerZone,
        )
      : null;
  return (
    <AdminActionsSheet
      title={adminT("admin.orderActions.title")}
      openLabel={adminT("admin.orderActions.title")}
      closeLabel={adminT("admin.orderActions.close")}
      barLine={
        graceBar === null
          ? adminT("admin.orderActions.bar.count", { count: controls })
          : adminT("admin.orderActions.grace", {
              time: graceBar.viewer.time,
              city: graceBar.viewer.city,
            })
      }
      barLineStrong={graceBar !== null}
      initiallyOpen={outcome !== null && outcome.action !== "resend"}
    >
      {panel}
    </AdminActionsSheet>
  );
}
