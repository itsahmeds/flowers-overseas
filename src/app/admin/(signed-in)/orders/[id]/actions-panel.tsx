/**
 * @purpose The order page's Actions card: reroute and cancel, their dialogs, results and every "Not available" reason (020a AC-3, AC-9 to AC-15)
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
 * and role (AC-3). Refund controls the table allows are listed there too, with the `provider`
 * line, until the refund dialog lands with the card provider's production wiring (escalated).
 * Resend results are the emails list's (`order-lists.tsx`), not this card's.
 */
import { randomUUID } from "node:crypto";

import type { ReactElement, ReactNode } from "react";

import { isCurrencyCode } from "@/config/currencies";
import {
  ADMIN_NAV,
  ADMIN_NOTE_MAX,
  adminT,
  availableActions,
  graceEndDisplay,
  isOrderActionStatus,
} from "@/modules/admin";
import { formatMoney } from "@/modules/i18n";
import type { AdminOrderDetail } from "@/modules/orders";
import type {
  NoPartnerGrace,
  RerouteCandidate,
} from "@/modules/orders/routing/jobs";
import { AdminActionDialog } from "@/modules/ui/admin/AdminActionDialog";
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
import { cancelOrderAction, rerouteOrderAction } from "./actions";
import {
  PANEL_CONTROLS,
  type PanelControl,
  unavailableReason,
} from "./panel-reasons";

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
  readonly candidates: readonly RerouteCandidate[];
  readonly grace: NoPartnerGrace | null;
  /** `?action=…&result=…` of the last submission. */
  readonly outcome: { readonly action: string; readonly result: string } | null;
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
 * table allows is listed with the `provider` line: its dialog is not built yet (TASK-361
 * escalation). On a cancelled order "Refund in full" is the retry, labelled so.
 */
export function notAvailable(
  available: ReturnType<typeof availableActions>,
  status: Parameters<typeof unavailableReason>[2],
): UnavailableLine[] {
  const lines: UnavailableLine[] = [];
  for (const control of PANEL_CONTROLS) {
    const state = available[control];
    const cause = state.available
      ? control === "refundFull" || control === "refundPartial"
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
          : undefined;

  const unavailable = notAvailable(available, order.status);

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
      : undefined;

  return card(
    <>
      {done === undefined ? null : <AdminToast>{done}</AdminToast>}
      {outcomeRefusal === undefined ? null : (
        <AdminRefusal>{outcomeRefusal}</AdminRefusal>
      )}
      {grace}
      {reroute === null && cancel === null ? null : (
        <div className="grid gap-[8px]">
          {reroute}
          {cancel}
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
}
