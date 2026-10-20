/**
 * @purpose GET /admin/orders/[id]: one order, read only, every view logged (AC-13, AC-19)
 * @spec 012
 *
 * `orders.view` (admin, ops, finance). Reads `orderDetail(id)` beside spec 010's projections:
 * lines with their VAT rates, the total and its VAT split, the `order_event` timeline with each
 * raw payload in a disclosure, the assignments and the payments. The recipient snapshot is read
 * **only** for `orders.view_pii` (admin, ops); finance gets a sentence and no data, because the
 * query never selects the column for them. Opening the page writes one `order.viewed` audit row
 * (`logAdminRead`) after the order is found and before anything renders, for every role. The
 * order's `public_token` is never read, so it cannot reach the HTML, a URL or a log; the URL
 * carries the uuid only. No action control renders: spec 020 adds the panel (spec 012 §2.6).
 * Artboards `admin-order-detail-desktop.dc.html` (two columns, the summary sticky) and
 * `admin-order-detail-mobile.dc.html` (one column, the summary first).
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";

import {
  ADMIN_NAV,
  adminRequestId,
  adminT,
  can,
  logAdminRead,
  orderStatusTone,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  formatAddressBlock,
  formatDate,
  formatPercentFromBasisPoints,
} from "@/modules/i18n";
import {
  type AdminOrderAssignment,
  type AdminOrderDetail,
  type AdminOrderEvent,
  type AdminOrderLine,
  orderDetail,
} from "@/modules/orders";
import {
  AdminCell,
  AdminChip,
  type AdminChipTone,
  AdminCode,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminBanner,
  AdminCard,
  type AdminKeyValue,
  AdminKeyValues,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
  AdminSection,
  AdminTimeline,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import { CHIP_TONE, deliveryDay, formatOrderMoney, ModeChip } from "../view";

/** A florist's page, only once it exists (no dead links). */
function partnerHref(code: string): string | undefined {
  const partners = ADMIN_NAV.find((entry) => entry.key === "partners");
  return partners?.built === true
    ? `${partners.href}/${encodeURIComponent(code)}`
    : undefined;
}

function Partner({ code }: { readonly code: string }): ReactNode {
  const href = partnerHref(code);
  return href === undefined ? (
    <AdminCode>{code}</AdminCode>
  ) : (
    <AdminTableLink href={href}>{code}</AdminTableLink>
  );
}

/** The florist holding the order: the latest offer not declined or timed out. */
function currentPartner(order: AdminOrderDetail): string | undefined {
  const holding = order.assignments
    .filter((a) => a.response === null || a.response === "accept")
    .at(-1);
  return holding?.partnerCode;
}

function lineName(line: AdminOrderLine): string {
  const name =
    line.kind === "surcharge"
      ? adminT("admin.orders.detail.surcharge")
      : (line.name ??
        adminT(
          line.kind === "product"
            ? "admin.orders.detail.product"
            : "admin.orders.detail.addon",
        ));
  const withTier =
    line.tierKey === null
      ? name
      : adminT("admin.orders.detail.lineWithTier", {
          name,
          tier: line.tierKey,
        });
  return line.qty === 1
    ? withTier
    : adminT("admin.orders.detail.quantity", {
        name: withTier,
        qty: line.qty,
      });
}

function change(event: AdminOrderEvent): string {
  if (event.fromStatus === null || event.toStatus === null) {
    return event.toStatus === null
      ? ""
      : adminT("admin.orders.detail.entered", { to: event.toStatus });
  }
  return event.fromStatus === event.toStatus
    ? adminT("admin.orders.detail.unchanged", { status: event.fromStatus })
    : adminT("admin.orders.detail.moved", {
        from: event.fromStatus,
        to: event.toStatus,
      });
}

const ANSWER_TONE: Readonly<
  Record<NonNullable<AdminOrderAssignment["response"]>, AdminChipTone>
> = { accept: "ok", decline: "bad", timeout: "plain" };

function Recipient({
  order,
}: {
  readonly order: AdminOrderDetail;
}): ReactElement {
  const recipient = order.recipient;
  if (recipient === null) {
    return (
      <AdminBanner>{adminT("admin.orders.detail.recipientHidden")}</AdminBanner>
    );
  }
  const address = [
    ...formatAddressBlock(
      {
        street: recipient.addressLines.join(", "),
        addressLine1: recipient.addressLines[0] ?? "",
        addressLine2: recipient.addressLines.slice(1).join(", "),
        postcode: recipient.postcode ?? "",
        city: recipient.city,
      },
      order.destination.iso2,
    ),
    order.destination.name,
  ];
  const items: AdminKeyValue[] = [
    {
      key: "name",
      label: adminT("admin.orders.detail.name"),
      value: recipient.fullName,
    },
    {
      key: "phone",
      label: adminT("admin.orders.detail.phone"),
      value: recipient.phoneE164,
      numeric: true,
    },
    {
      key: "address",
      label: adminT("admin.orders.detail.address"),
      value: address.map((line, index) => (
        <span key={`${String(index)}-${line}`} className="block">
          {line}
        </span>
      )),
    },
    {
      key: "place",
      label: adminT("admin.orders.detail.place"),
      value: adminT(`admin.orders.detail.placeKind.${recipient.placeKind}`),
    },
    ...(recipient.deliveryNote === undefined
      ? []
      : [
          {
            key: "note",
            label: adminT("admin.orders.detail.deliveryNote"),
            value: recipient.deliveryNote,
          },
        ]),
    ...(recipient.cardMessage === undefined
      ? []
      : [
          {
            key: "card",
            label: adminT("admin.orders.detail.cardMessage"),
            value: (
              <span className="font-display italic">
                {recipient.cardMessage}
              </span>
            ),
          },
        ]),
    ...(recipient.signAs === undefined
      ? []
      : [
          {
            key: "sign",
            label: adminT("admin.orders.detail.signAs"),
            value: recipient.signAs,
          },
        ]),
  ];
  return (
    <AdminCard>
      <AdminKeyValues items={items} />
      <AdminQuiet>{adminT("admin.orders.detail.recipientLogged")}</AdminQuiet>
    </AdminCard>
  );
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("orders.view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const order = await orderDetail(id, {
    ...actor,
    includeRecipient: can(session.roles, "orders.view_pii"),
  });
  if (order === null) notFound();
  await logAdminRead(actor, "order", order.orderId);

  const zone = zoneCity(session.timeZone);
  const viewer = (iso: string, style: "time" | "dayMonthTimeSeconds") =>
    formatDate(new Date(iso), "en", style, session.timeZone);
  const money = (amountMinor: number): string =>
    formatOrderMoney(amountMinor, order.currency);
  const projection = adminT("admin.orders.buyerSees", {
    projection: adminT(`admin.orders.projection.${order.buyerStatus}`),
  });
  const statusChip = (
    <AdminChip tone={CHIP_TONE[orderStatusTone(order.status)]}>
      <AdminCode>{order.status}</AdminCode>
    </AdminChip>
  );
  const holder = currentPartner(order);
  const delivery = deliveryDay(order.deliveryDate);

  const summary = (
    <AdminCard title={adminT("admin.orders.detail.summary")}>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "mode",
            label: adminT("admin.orders.detail.mode"),
            value:
              order.mode === "live" ? (
                adminT("admin.orders.mode.live")
              ) : (
                <ModeChip mode={order.mode} />
              ),
          },
          {
            key: "status",
            label: adminT("admin.orders.detail.status"),
            value: (
              <>
                <AdminCode>{order.status}</AdminCode>
                <AdminSecondLine>{projection}</AdminSecondLine>
              </>
            ),
          },
          {
            key: "destination",
            label: adminT("admin.orders.detail.destination"),
            value: adminT("admin.orders.detail.destinationValue", {
              country: order.destination.name,
              zone: order.destination.timeZone,
            }),
          },
          {
            key: "delivery",
            label: adminT("admin.orders.detail.deliveryDate"),
            value:
              order.deliveryWindow === null
                ? adminT("admin.orders.detail.deliveryValue", {
                    date: delivery,
                  })
                : adminT("admin.orders.detail.deliveryWindowValue", {
                    date: delivery,
                    window: order.deliveryWindow,
                  }),
          },
          ...(order.cityName === null
            ? []
            : [
                {
                  key: "city",
                  label: adminT("admin.orders.detail.city"),
                  value: order.cityName,
                },
              ]),
          {
            key: "florist",
            label: adminT("admin.orders.detail.florist"),
            value:
              holder === undefined ? (
                <AdminNote>{adminT("admin.orders.unassigned")}</AdminNote>
              ) : (
                <Partner code={holder} />
              ),
          },
          {
            key: "total",
            label: adminT("admin.orders.detail.totalShort"),
            value: money(order.totalMinor),
            numeric: true,
          },
        ]}
      />
      <AdminBanner small>{adminT("admin.orders.detail.noActions")}</AdminBanner>
    </AdminCard>
  );

  const lines = (
    <AdminSection title={adminT("admin.orders.detail.lines")}>
      <AdminTable
        columns={[
          { key: "item", label: adminT("admin.orders.detail.item") },
          {
            key: "vat",
            label: adminT("admin.orders.detail.vat"),
            align: "end",
          },
          {
            key: "amount",
            label: adminT("admin.orders.detail.amount"),
            align: "end",
          },
        ]}
        foot={
          <AdminKeyValues
            variant="totals"
            items={[
              {
                key: "total",
                label: adminT("admin.orders.detail.total"),
                value: money(order.totalMinor),
                numeric: true,
                emphasis: true,
              },
              ...order.vatBreakdown.map((split) => ({
                key: `vat-${String(split.rateBp)}`,
                label: adminT("admin.orders.detail.vatOf", {
                  rate: formatPercentFromBasisPoints(split.rateBp, "en"),
                }),
                value: money(split.vatMinor),
                numeric: true,
              })),
            ]}
          />
        }
      >
        {order.lines.map((line) => (
          <AdminRow key={line.lineId}>
            <AdminCell>{lineName(line)}</AdminCell>
            <AdminCell align="end">
              {formatPercentFromBasisPoints(line.vatRateBp, "en")}
            </AdminCell>
            <AdminCell align="end">{money(line.amountMinor)}</AdminCell>
          </AdminRow>
        ))}
        <AdminRow>
          <AdminCell>{adminT("admin.orders.detail.delivery")}</AdminCell>
          <AdminCell align="end">{null}</AdminCell>
          <AdminCell align="end">
            <span className="text-included font-bold">
              {adminT("admin.orders.detail.included")}
            </span>
          </AdminCell>
        </AdminRow>
      </AdminTable>
    </AdminSection>
  );

  const timeline = (
    <AdminSection
      title={adminT("admin.orders.detail.timeline")}
      note={adminT.rich("admin.orders.detail.timelineNote", {
        zone,
        code: (chunks) => <code>{chunks}</code>,
      })}
    >
      <AdminCard flush>
        <AdminTimeline
          showLabel={adminT("admin.orders.detail.showPayload")}
          hideLabel={adminT("admin.orders.detail.hidePayload")}
          entries={order.events.map((event) => ({
            key: String(event.seq),
            seq: String(event.seq),
            event: <code>{event.type}</code>,
            when: viewer(event.occurredAt, "dayMonthTimeSeconds"),
            meta: (
              <>
                {change(event)} · <code>{event.actor}</code>
              </>
            ),
            payload: JSON.stringify(event.payload, null, 2),
          }))}
        />
      </AdminCard>
    </AdminSection>
  );

  const answer = (assignment: AdminOrderAssignment): ReactElement =>
    assignment.response === null || assignment.respondedAt === null ? (
      <AdminChip>{adminT("admin.orders.detail.waiting")}</AdminChip>
    ) : (
      <AdminChip tone={ANSWER_TONE[assignment.response]}>
        {adminT(`admin.orders.detail.answered.${assignment.response}`, {
          time: viewer(assignment.respondedAt, "time"),
        })}
      </AdminChip>
    );
  const reason = (assignment: AdminOrderAssignment): ReactNode =>
    assignment.reason ?? (
      <AdminNote>{adminT("admin.orders.detail.none")}</AdminNote>
    );

  const assignments = (
    <AdminSection title={adminT("admin.orders.detail.assignments")}>
      {order.assignments.length === 0 ? (
        <AdminBanner>{adminT("admin.orders.detail.noAssignments")}</AdminBanner>
      ) : (
        <>
          <div className="hidden md:block">
            <AdminTable
              columns={[
                {
                  key: "florist",
                  label: adminT("admin.orders.detail.florist"),
                },
                {
                  key: "offered",
                  label: adminT("admin.orders.detail.offered"),
                },
                { key: "by", label: adminT("admin.orders.detail.answerBy") },
                { key: "answer", label: adminT("admin.orders.detail.answer") },
                { key: "reason", label: adminT("admin.orders.detail.reason") },
              ]}
            >
              {order.assignments.map((assignment) => (
                <AdminRow key={assignment.assignmentId}>
                  <AdminCell>
                    <Partner code={assignment.partnerCode} />
                  </AdminCell>
                  <AdminCell nowrap>
                    {viewer(assignment.offeredAt, "time")}
                  </AdminCell>
                  <AdminCell nowrap>
                    {viewer(assignment.answerBy, "time")}
                  </AdminCell>
                  <AdminCell>{answer(assignment)}</AdminCell>
                  <AdminCell>{reason(assignment)}</AdminCell>
                </AdminRow>
              ))}
            </AdminTable>
          </div>
          <div className="grid gap-[12px] md:hidden">
            {order.assignments.map((assignment) => (
              <AdminCard key={assignment.assignmentId}>
                <AdminKeyValues
                  items={[
                    {
                      key: "florist",
                      label: adminT("admin.orders.detail.florist"),
                      value: <Partner code={assignment.partnerCode} />,
                    },
                    {
                      key: "offered",
                      label: adminT("admin.orders.detail.offered"),
                      value: viewer(assignment.offeredAt, "time"),
                      numeric: true,
                    },
                    {
                      key: "by",
                      label: adminT("admin.orders.detail.answerBy"),
                      value: viewer(assignment.answerBy, "time"),
                      numeric: true,
                    },
                    {
                      key: "answer",
                      label: adminT("admin.orders.detail.answer"),
                      value: answer(assignment),
                    },
                    {
                      key: "reason",
                      label: adminT("admin.orders.detail.reason"),
                      value: reason(assignment),
                    },
                  ]}
                />
              </AdminCard>
            ))}
          </div>
        </>
      )}
    </AdminSection>
  );

  const payments = (
    <AdminSection title={adminT("admin.orders.detail.payments")}>
      {order.payments.length === 0 ? (
        <AdminBanner>
          {order.mode === "live"
            ? adminT("admin.orders.detail.noPayment")
            : adminT("admin.orders.detail.noPaymentDemo")}
        </AdminBanner>
      ) : (
        <AdminTable
          columns={[
            { key: "provider", label: adminT("admin.orders.detail.provider") },
            { key: "method", label: adminT("admin.orders.detail.method") },
            {
              key: "status",
              label: adminT("admin.orders.detail.paymentStatus"),
            },
            {
              key: "amount",
              label: adminT("admin.orders.detail.amount"),
              align: "end",
            },
            { key: "captured", label: adminT("admin.orders.detail.captured") },
          ]}
        >
          {order.payments.map((payment) => (
            <AdminRow key={payment.paymentId}>
              <AdminCell>
                <AdminCode>{payment.provider}</AdminCode>
              </AdminCell>
              <AdminCell>
                <AdminCode>{payment.method}</AdminCode>
              </AdminCell>
              <AdminCell>
                <AdminCode>{payment.status}</AdminCode>
              </AdminCell>
              <AdminCell align="end">
                {formatOrderMoney(payment.amountMinor, payment.currency)}
              </AdminCell>
              <AdminCell nowrap>
                {payment.capturedAt === null ? (
                  <AdminNote>
                    {adminT("admin.orders.detail.notCaptured")}
                  </AdminNote>
                ) : (
                  viewer(payment.capturedAt, "dayMonthTimeSeconds")
                )}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
    </AdminSection>
  );

  return (
    <AdminFrame session={session} current="orders">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/orders">
          {adminT("admin.orders.detail.back")}
        </AdminBackLink>
        <AdminRecordHead
          display
          title={order.reference}
          sub={
            <>
              <ModeChip mode={order.mode} />
              {statusChip}
              <span>{projection}</span>
              <span>
                {adminT("admin.orders.detail.placedAt", {
                  time: formatDate(
                    new Date(order.placedAt),
                    "en",
                    "dayMonthYearTime",
                    session.timeZone,
                  ),
                  zone,
                })}
              </span>
            </>
          }
        />
        <AdminRecordColumns
          aside={summary}
          main={
            <>
              {lines}
              <AdminSection title={adminT("admin.orders.detail.recipient")}>
                <Recipient order={order} />
              </AdminSection>
              {timeline}
              {assignments}
              {payments}
            </>
          }
        />
      </div>
    </AdminFrame>
  );
}
