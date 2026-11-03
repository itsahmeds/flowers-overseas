/**
 * @purpose The order page's refunds list, emails list with Resend, and action history (020a AC-23, AC-24)
 * @spec 020a
 *
 * Server-rendered sections of spec 012's order page (artboards `admin-order-actions-*` and
 * `admin-order-resend-*`; TASK-361):
 *
 *  - **Refunds** (`RefundsBlock`, inside "Payments"): every `refund` row of the order, newest
 *    first, with status, amount through `formatMoney`, reason label, who asked and when it was
 *    requested and settled; then the balance: charged, refunded or on its way, left to refund
 *    (captured minus succeeded, pending and requested; AC-23).
 *  - **Emails** (`EmailsSection`): every `notification_delivery` row of the order (and its
 *    purchase's B1) from `orderEmails`, with template, code, who it went to (the florist's name, or
 *    "Buyer", or "Founder"), status and time; never an address (AC-24). Each row offers a one-step
 *    "Resend" form (`resendEmailAction`, no dialog: it moves no money, §13 Q6) exactly where the
 *    resend table allows it now, or its reason as text. The result of the last resend is the
 *    section's live line.
 *  - **Action history** (`HistorySection`): `orderActionHistory`, who, what, when, reason, amount.
 *    Never the admin's note (it is in the audit log only, §8).
 *
 * Every form carries a fresh `actionId` and the order's `expectedSeq`.
 */
import { randomUUID } from "node:crypto";

import type { ReactElement, ReactNode } from "react";

import { isCurrencyCode } from "@/config/currencies";
import {
  type ActionHistoryEntry,
  adminT,
  type OrderRefunds,
  type RefundListEntry,
} from "@/modules/admin";
import type { OrderEmail } from "@/modules/admin/order-actions/resend";
import { formatDate, formatMoney } from "@/modules/i18n";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  type AdminChipTone,
  AdminCode,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
} from "@/modules/ui/admin/AdminData";
import { AdminPendingSubmit } from "@/modules/ui/admin/AdminPendingSubmit";
import {
  AdminBanner,
  AdminKeyValues,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { resendEmailAction } from "./actions";

function money(amountMinor: bigint, currency: string): string {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `an order currency the application does not configure: ${currency}`,
    );
  }
  return formatMoney({ amountMinor, currency }, "en");
}

function when(at: Date, zone: string): string {
  return formatDate(at, "en", "dayMonthTime", zone);
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                    */
/* -------------------------------------------------------------------------- */

/** Spec 013's refund reasons, transcribed: each has one admin label. */
const REFUND_REASONS = [
  "buyer_cancel",
  "no_partner",
  "authorisation_lapsing",
  "redelivery_failed",
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
] as const;
type RefundReason = (typeof REFUND_REASONS)[number];

function isRefundReason(reason: string): reason is RefundReason {
  return (REFUND_REASONS as readonly string[]).includes(reason);
}

/** A reason code as its admin label, or the code itself when no label exists. */
export function ReasonLabel({
  reason,
}: {
  readonly reason: string;
}): ReactElement {
  return isRefundReason(reason) ? (
    <>{adminT(`admin.orderActions.refunds.reason.${reason}`)}</>
  ) : (
    <AdminCode>{reason}</AdminCode>
  );
}

const REFUND_TONE: Readonly<Record<RefundListEntry["status"], AdminChipTone>> =
  {
    requested: "plain",
    pending: "sky",
    succeeded: "ok",
    failed: "bad",
    cancelled: "plain",
  };

function settled(refund: RefundListEntry, zone: string): ReactNode {
  if (refund.status === "succeeded" && refund.succeededAt !== null) {
    return when(refund.succeededAt, zone);
  }
  if (refund.status === "succeeded") return null;
  return (
    <AdminNote>
      {adminT(`admin.orderActions.refunds.settledLine.${refund.status}`)}
    </AdminNote>
  );
}

/** The refunds list and the balance, for the Payments section (AC-23). */
export function RefundsBlock({
  refunds,
  zone,
}: {
  readonly refunds: OrderRefunds;
  readonly zone: string;
}): ReactElement {
  const currency = refunds.currencyCode;
  const onItsWay = refunds.capturedMinor - refunds.remainingMinor;
  const rows = [...refunds.refunds].reverse();
  return (
    <div className="grid gap-[10px]">
      {rows.length === 0 ? (
        <AdminBanner small>
          {adminT("admin.orderActions.refunds.none")}
        </AdminBanner>
      ) : (
        <AdminTable
          columns={[
            {
              key: "status",
              label: adminT("admin.orderActions.refunds.status"),
            },
            {
              key: "amount",
              label: adminT("admin.orderActions.refunds.amount"),
              align: "end",
            },
            {
              key: "reason",
              label: adminT("admin.orderActions.refunds.reasonColumn"),
            },
            { key: "by", label: adminT("admin.orderActions.refunds.askedBy") },
            {
              key: "requested",
              label: adminT("admin.orderActions.refunds.requested"),
            },
            {
              key: "settled",
              label: adminT("admin.orderActions.refunds.settled"),
            },
          ]}
        >
          {rows.map((refund) => (
            <AdminRow key={refund.id}>
              <AdminCell>
                <AdminChip tone={REFUND_TONE[refund.status]}>
                  {adminT(`admin.orderActions.refunds.state.${refund.status}`)}
                </AdminChip>
              </AdminCell>
              <AdminCell align="end">
                {money(refund.amountMinor, refund.currencyCode)}
              </AdminCell>
              <AdminCell>
                <ReasonLabel reason={refund.reason} />
              </AdminCell>
              <AdminCell>
                {refund.requestedBy.kind === "system"
                  ? adminT("admin.orderActions.refunds.automatic")
                  : (refund.requestedBy.displayName ??
                    adminT("admin.orderActions.refunds.unknownAdmin"))}
              </AdminCell>
              <AdminCell nowrap>{when(refund.requestedAt, zone)}</AdminCell>
              <AdminCell nowrap>{settled(refund, zone)}</AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
      <AdminKeyValues
        variant="totals"
        items={[
          {
            key: "charged",
            label: adminT("admin.orderActions.refunds.charged"),
            value: money(refunds.capturedMinor, currency),
            numeric: true,
          },
          {
            key: "onItsWay",
            label: adminT("admin.orderActions.refunds.onItsWay"),
            value: money(onItsWay, currency),
            numeric: true,
          },
          {
            key: "left",
            label: adminT("admin.orderActions.refunds.left"),
            value: money(refunds.remainingMinor, currency),
            numeric: true,
            emphasis: true,
          },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Emails                                                                     */
/* -------------------------------------------------------------------------- */

/** The template's admin label ("Order received"), or the key for one with no label. */
export function emailLabel(templateKey: string): string {
  switch (templateKey) {
    case "order-received":
    case "being-made":
    case "out-for-delivery":
    case "delivered-photo":
    case "cancelled":
    case "refund":
    case "credit-note":
    case "offer":
    case "offer-reminder":
    case "order-confirmed":
    case "offer-withdrawn":
    case "photo-reminder":
    case "alert-no-partner":
    case "whatsapp-copy":
    case "payout-prepaid-ready":
    case "payouts-ready":
    case "payout-line-missing":
    case "florist-payout-statement":
      return adminT(`admin.orderActions.emails.template.${templateKey}`);
    default:
      return templateKey;
  }
}

/** Who an email went to: the florist's name, "Buyer" or "Founder". Never an address. */
export function emailTo(email: {
  readonly audience: "buyer" | "florist" | "ops";
  readonly partnerName: string | null;
}): string {
  return email.audience === "florist" && email.partnerName !== null
    ? email.partnerName
    : adminT(`admin.orderActions.emails.audience.${email.audience}`);
}

const DELIVERY_TONE: Readonly<Record<string, AdminChipTone>> = {
  delivered: "ok",
  sent: "sky",
  queued: "plain",
  delivery_delayed: "warn",
  bounced: "bad",
  complained: "bad",
  failed: "bad",
};

function DeliveryStatus({
  email,
}: {
  readonly email: OrderEmail;
}): ReactElement {
  const status = email.held ? "held" : email.status;
  switch (status) {
    case "held":
    case "queued":
    case "sent":
    case "delivered":
    case "delivery_delayed":
    case "bounced":
    case "complained":
    case "failed":
      return (
        <AdminChip
          tone={email.held ? "warn" : (DELIVERY_TONE[status] ?? "plain")}
        >
          {adminT(`admin.orderActions.emails.deliveryStatus.${status}`)}
        </AdminChip>
      );
    default:
      return <AdminCode>{status}</AdminCode>;
  }
}

function ResendCell({
  email,
  orderId,
  seq,
}: {
  readonly email: OrderEmail;
  readonly orderId: string;
  readonly seq: number;
}): ReactElement {
  if (!email.resend.allowed) {
    return (
      <AdminNote>
        {adminT(`admin.orderActions.emails.cause.${email.resend.cause}`)}
      </AdminNote>
    );
  }
  return (
    <form action={resendEmailAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="actionId" value={randomUUID()} />
      <input type="hidden" name="expectedSeq" value={String(seq)} />
      <input type="hidden" name="deliveryId" value={email.deliveryId} />
      <AdminPendingSubmit
        label={adminT("admin.orderActions.emails.resend")}
        pendingLabel={adminT("admin.orderActions.emails.resending")}
        accessibleName={adminT("admin.orderActions.emails.resendThis", {
          email: emailLabel(email.templateKey),
          to: emailTo(email),
        })}
      />
    </form>
  );
}

/** The last resend's result line: done names the new row; a refusal says why. */
export interface ResendOutcome {
  readonly result: string;
  readonly ref: string | null;
}

function resendRefusal(code: string): string {
  switch (code) {
    case "RESEND_NOT_ALLOWED":
    case "RESEND_RATE_LIMITED":
    case "ORDER_CHANGED":
    case "DEMO_ORDER":
    case "FORBIDDEN":
    case "INPUT_INVALID":
      return adminT(`admin.orderActions.refused.${code}`);
    default:
      return adminT("admin.orderActions.refused.other");
  }
}

export function EmailsSection({
  emails,
  orderId,
  seq,
  zone,
  outcome,
}: {
  readonly emails: readonly OrderEmail[];
  readonly orderId: string;
  readonly seq: number;
  readonly zone: string;
  readonly outcome: ResendOutcome | null;
}): ReactElement {
  const resent =
    outcome?.result === "done"
      ? emails.find((email) => email.deliveryId === outcome.ref)
      : undefined;
  const line =
    outcome === null ? null : outcome.result === "done" ? (
      <AdminToast>
        {resent === undefined
          ? adminT("admin.orderActions.emails.doneShort")
          : adminT("admin.orderActions.emails.done", {
              email: emailLabel(resent.templateKey),
              to: emailTo(resent),
            })}
      </AdminToast>
    ) : (
      <AdminRefusal>{resendRefusal(outcome.result)}</AdminRefusal>
    );
  return (
    <AdminSection
      title={adminT("admin.orderActions.emails.title")}
      note={adminT("admin.orderActions.emails.note")}
    >
      {line}
      {emails.length === 0 ? (
        <AdminBanner>{adminT("admin.orderActions.emails.empty")}</AdminBanner>
      ) : (
        <AdminTable
          columns={[
            { key: "email", label: adminT("admin.orderActions.emails.email") },
            { key: "to", label: adminT("admin.orderActions.emails.to") },
            {
              key: "status",
              label: adminT("admin.orderActions.emails.status"),
            },
            { key: "when", label: adminT("admin.orderActions.emails.when") },
            {
              key: "resend",
              label: adminT("admin.orderActions.emails.resend"),
              hidden: true,
              align: "end",
            },
          ]}
        >
          {emails.map((email) => (
            <AdminRow
              key={email.deliveryId}
              highlight={email.deliveryId === outcome?.ref}
            >
              <AdminCell>
                <b>
                  {email.resendOf === null
                    ? emailLabel(email.templateKey)
                    : adminT("admin.orderActions.emails.resent", {
                        email: emailLabel(email.templateKey),
                      })}
                </b>
                <AdminSecondLine>
                  <code>
                    {email.code === null
                      ? email.templateKey
                      : `${email.code} ${email.templateKey}`}
                  </code>
                </AdminSecondLine>
              </AdminCell>
              <AdminCell>{emailTo(email)}</AdminCell>
              <AdminCell>
                <DeliveryStatus email={email} />
              </AdminCell>
              <AdminCell nowrap>{when(email.statusAt, zone)}</AdminCell>
              <AdminCell align="end">
                <ResendCell email={email} orderId={orderId} seq={seq} />
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );
}

/* -------------------------------------------------------------------------- */
/* Action history                                                             */
/* -------------------------------------------------------------------------- */

function historyWhat(entry: ActionHistoryEntry): ReactNode {
  const kind = adminT(`admin.orderActions.history.kind.${entry.kind}`);
  if (entry.partner !== null) {
    return (
      <>
        {kind} · {entry.partner.displayName}
      </>
    );
  }
  if (entry.resent !== null) {
    const audience = entry.resent.audience;
    return (
      <>
        {kind} ·{" "}
        {adminT("admin.orderActions.history.resendWhat", {
          email: emailLabel(entry.resent.templateKey),
          to:
            audience === "buyer" || audience === "florist" || audience === "ops"
              ? adminT(`admin.orderActions.emails.audience.${audience}`)
              : audience,
        })}
      </>
    );
  }
  return kind;
}

export function HistorySection({
  history,
  zone,
}: {
  readonly history: readonly ActionHistoryEntry[];
  readonly zone: string;
}): ReactElement {
  return (
    <AdminSection title={adminT("admin.orderActions.history.title")}>
      {history.length === 0 ? (
        <AdminBanner>{adminT("admin.orderActions.history.empty")}</AdminBanner>
      ) : (
        <AdminTable
          columns={[
            { key: "who", label: adminT("admin.orderActions.history.who") },
            { key: "what", label: adminT("admin.orderActions.history.what") },
            { key: "when", label: adminT("admin.orderActions.history.when") },
            {
              key: "reason",
              label: adminT("admin.orderActions.history.reason"),
            },
            {
              key: "amount",
              label: adminT("admin.orderActions.history.amount"),
              align: "end",
            },
          ]}
        >
          {history.map((entry) => (
            <AdminRow key={entry.id}>
              <AdminCell>
                {entry.actor.displayName ??
                  adminT("admin.orderActions.refunds.unknownAdmin")}
              </AdminCell>
              <AdminCell>{historyWhat(entry)}</AdminCell>
              <AdminCell nowrap>{when(entry.at, zone)}</AdminCell>
              <AdminCell>
                {entry.reason === null ? (
                  <AdminNote>
                    {adminT("admin.orderActions.history.none")}
                  </AdminNote>
                ) : (
                  <ReasonLabel reason={entry.reason} />
                )}
              </AdminCell>
              <AdminCell align="end">
                {entry.amount === null
                  ? null
                  : money(entry.amount.amountMinor, entry.amount.currencyCode)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );
}
