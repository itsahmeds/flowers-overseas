/**
 * @purpose GET /admin/orders: the read-only order queue (AC-18, AC-19)
 * @spec 012
 *
 * `orders.view` (admin, ops, finance). Rendered from spec 010's `listOrdersForAdmin` (ruling R3),
 * newest first, 50 a page, filtered by status, destination, delivery date and placed date (a GET
 * form, so a filtered view is a URL of ids, codes and dates). A row shows the reference, the
 * placed time in the viewer's zone, the delivery date, the city, the internal status with its
 * buyer projection, the florist's code and the total through `formatMoney`; a demo marker exactly
 * for `mode` `demo` or `test`. No recipient name, phone or street is read, so none can render.
 * No action control: the only form is the filter's GET (spec 012 §2.6 "No actions in v0").
 *
 * The head is read **before** the list: an order placed between the two reads is then in the
 * list but not in the head, and the island's next poll re-renders once more, instead of the
 * reverse, where an order missing from the list would sit in the head and never be fetched.
 * The island (`OrderQueuePoll`) polls `GET /admin/api/orders/head` every 3 s while the page is
 * visible and re-renders this page with `since` (the head the tab opened on) when it changes; rows
 * placed after `since` carry "New" and the polite live region counts them. Artboards
 * `admin-orders-desktop.dc.html` (table) and `admin-orders-mobile.dc.html` (cards, filters in a
 * disclosure).
 */
import type { ReactElement } from "react";

import {
  activeOrderFilters,
  adminRequestId,
  adminT,
  isNewSince,
  orderDetailHref,
  orderQueueFilter,
  orderQueueHref,
  type OrderQueueQuery,
  OrderQueueQuerySchema,
  orderStatusTone,
  parseOrderQueueQuery,
  QUEUE_EPOCH,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  type AdminOrderListItem,
  countOrdersForAdmin,
  listOrdersForAdmin,
  ORDER_QUEUE_PAGE_SIZE,
  orderQueueFilterOptions,
  type OrderQueueFilterOptions,
  orderQueueHead,
} from "@/modules/orders";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminChip,
  AdminCode,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterClear,
  AdminFilterDateRange,
  AdminFilterDisclosure,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import { OrderQueuePoll } from "@/modules/ui/admin/OrderQueuePoll";
import {
  AdminPager,
  AdminRef,
  AdminRefLink,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../frame";
import { CHIP_TONE, deliveryDay, formatOrderMoney, ModeChip } from "./view";

function Filters({
  query,
  options,
  idPrefix,
  stacked,
}: {
  readonly query: OrderQueueQuery;
  readonly options: OrderQueueFilterOptions;
  readonly idPrefix: string;
  readonly stacked: boolean;
}): ReactElement {
  return (
    <AdminFilterBar
      stacked={stacked}
      label={adminT("admin.orders.filter.label")}
      action="/admin/orders"
    >
      <AdminFilterSelect
        id={`${idPrefix}-status`}
        name="status"
        label={adminT("admin.orders.filter.status")}
        anyLabel={adminT("admin.orders.filter.statusAny")}
        options={options.statuses.map((status) => ({
          value: status,
          label: status,
        }))}
        value={query.status}
        stacked={stacked}
      />
      <AdminFilterSelect
        id={`${idPrefix}-country`}
        name="country"
        label={adminT("admin.orders.filter.destination")}
        anyLabel={adminT("admin.orders.filter.destinationAny")}
        options={options.countries.map((country) => ({
          value: country.iso2,
          label: country.name,
        }))}
        value={query.country}
        stacked={stacked}
      />
      <AdminFilterDateRange
        idPrefix={`${idPrefix}-delivery`}
        names={["deliveryFrom", "deliveryTo"]}
        label={adminT("admin.orders.filter.delivery")}
        fromLabel={adminT("admin.orders.filter.from")}
        toLabel={adminT("admin.orders.filter.to")}
        from={query.deliveryFrom}
        to={query.deliveryTo}
        stacked={stacked}
      />
      <AdminFilterDateRange
        idPrefix={`${idPrefix}-placed`}
        names={["placedFrom", "placedTo"]}
        label={adminT("admin.orders.filter.placed")}
        fromLabel={adminT("admin.orders.filter.from")}
        toLabel={adminT("admin.orders.filter.to")}
        from={query.placedFrom}
        to={query.placedTo}
        stacked={stacked}
      />
      <AdminFilterSubmit>
        {adminT("admin.orders.filter.apply")}
      </AdminFilterSubmit>
      <AdminFilterClear href="/admin/orders">
        {adminT("admin.orders.filter.clear")}
      </AdminFilterClear>
    </AdminFilterBar>
  );
}

function StatusChip({
  item,
}: {
  readonly item: AdminOrderListItem;
}): ReactElement {
  return (
    <AdminChip tone={CHIP_TONE[orderStatusTone(item.status)]}>
      <AdminCode>{item.status}</AdminCode>
    </AdminChip>
  );
}

function buyerSees(item: AdminOrderListItem): string {
  return adminT("admin.orders.buyerSees", {
    projection: adminT(`admin.orders.projection.${item.buyerStatus}`),
  });
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("orders.view");
  const query = parseOrderQueueQuery(
    OrderQueueQuerySchema.parse(await searchParams),
  );
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const filter = orderQueueFilter(query, session.timeZone);
  // The head first, then the list (see the header).
  const head = await orderQueueHead(actor);
  const [items, total, options] = await Promise.all([
    listOrdersForAdmin(filter, actor),
    countOrdersForAdmin(filter, actor),
    orderQueueFilterOptions(actor),
  ]);
  const zone = zoneCity(session.timeZone);
  const placed = (item: AdminOrderListItem): string =>
    formatDate(new Date(item.placedAt), "en", "dayMonthTime", session.timeZone);
  const isNew = (item: AdminOrderListItem): boolean =>
    isNewSince(item.placedAt, query.since);
  const fresh = items.filter(isNew).length;
  const filtered = activeOrderFilters(query);
  const page = query.page ?? 1;
  const first = (page - 1) * ORDER_QUEUE_PAGE_SIZE + 1;
  const range = {
    from: formatNumber(first, "en"),
    to: formatNumber(first + items.length - 1, "en"),
    total: formatNumber(total, "en"),
  };
  const pages = {
    ...(page > 1
      ? {
          previous: {
            href: orderQueueHref(query, { page: page - 1 }),
            label: adminT("admin.orders.pager.newer"),
          },
        }
      : {}),
    ...(first + items.length - 1 < total
      ? {
          next: {
            href: orderQueueHref(query, { page: page + 1 }),
            label: adminT("admin.orders.pager.older"),
          },
        }
      : {}),
  };
  const florist = (item: AdminOrderListItem): string =>
    item.assignedPartner?.code ?? adminT("admin.orders.unassigned");
  const columns = [
    { key: "order", label: adminT("admin.orders.column.order") },
    { key: "placed", label: adminT("admin.orders.column.placed", { zone }) },
    { key: "delivery", label: adminT("admin.orders.column.delivery") },
    { key: "status", label: adminT("admin.orders.column.status") },
    { key: "florist", label: adminT("admin.orders.column.florist") },
    {
      key: "total",
      label: adminT("admin.orders.column.total"),
      align: "end" as const,
    },
  ];
  return (
    <AdminFrame session={session} current="orders">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header>
          <AdminPageTitle>{adminT("admin.orders.title")}</AdminPageTitle>
          <p className="mt-[6px]">
            <OrderQueuePoll
              headUrl="/admin/api/orders/head"
              initialHead={head}
              arrivalHref={orderQueueHref(query, {
                since: query.since ?? head.latestCreatedAt ?? QUEUE_EPOCH,
              })}
              resumeHref={orderQueueHref(query)}
              checkingLabel={adminT("admin.orders.live.checking")}
              pausedLabel={adminT("admin.orders.live.paused")}
              resumeLabel={adminT("admin.orders.live.resume")}
              {...(fresh === 0
                ? {}
                : {
                    announcement: adminT("admin.orders.live.arrived", {
                      count: fresh,
                    }),
                  })}
            />
          </p>
        </header>
        <div className="hidden md:block">
          <Filters
            query={query}
            options={options}
            idPrefix="orders-filter"
            stacked={false}
          />
        </div>
        <div className="md:hidden">
          <AdminFilterDisclosure
            summary={
              filtered === 0
                ? adminT("admin.orders.filter.summary")
                : adminT("admin.orders.filter.summaryCount", {
                    count: filtered,
                  })
            }
          >
            <Filters
              query={query}
              options={options}
              idPrefix="orders-filter-m"
              stacked
            />
          </AdminFilterDisclosure>
        </div>
        {items.length === 0 ? (
          filtered === 0 && page === 1 ? (
            <AdminEmpty title={adminT("admin.orders.empty.title")}>
              <p>{adminT("admin.orders.empty.body")}</p>
            </AdminEmpty>
          ) : (
            <AdminEmpty title={adminT("admin.orders.empty.filteredTitle")}>
              <AdminTableLink href="/admin/orders">
                {adminT("admin.orders.empty.clear")}
              </AdminTableLink>
            </AdminEmpty>
          )
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable
                columns={columns}
                foot={
                  <AdminPager
                    label={adminT("admin.orders.pager.label")}
                    summary={adminT("admin.orders.pager.summary", {
                      ...range,
                      size: ORDER_QUEUE_PAGE_SIZE,
                    })}
                    {...pages}
                  />
                }
              >
                {items.map((item) => (
                  <AdminRow key={item.orderId} highlight={isNew(item)}>
                    <AdminCell>
                      <span className="inline-flex flex-wrap items-center gap-[6px]">
                        <AdminRefLink href={orderDetailHref(item.orderId)}>
                          {item.reference}
                        </AdminRefLink>
                        <ModeChip mode={item.mode} />
                        {isNew(item) ? (
                          <AdminChip tone="ink">
                            {adminT("admin.orders.new")}
                          </AdminChip>
                        ) : null}
                      </span>
                    </AdminCell>
                    <AdminCell nowrap>{placed(item)}</AdminCell>
                    <AdminCell>
                      <span className="whitespace-nowrap">
                        {deliveryDay(item.deliveryDate)}
                      </span>
                      {item.cityName === null ? null : (
                        <AdminSecondLine>{item.cityName}</AdminSecondLine>
                      )}
                    </AdminCell>
                    <AdminCell>
                      <StatusChip item={item} />
                      <AdminSecondLine>{buyerSees(item)}</AdminSecondLine>
                    </AdminCell>
                    <AdminCell>
                      {item.assignedPartner === null ? (
                        <AdminNote>
                          {adminT("admin.orders.unassigned")}
                        </AdminNote>
                      ) : (
                        <AdminCode>{item.assignedPartner.code}</AdminCode>
                      )}
                    </AdminCell>
                    <AdminCell align="end">
                      {formatOrderMoney(item.totalMinor, item.currency)}
                    </AdminCell>
                  </AdminRow>
                ))}
              </AdminTable>
            </div>
            <div className="grid gap-[16px] md:hidden">
              <AdminCardRows>
                {items.map((item) => (
                  <AdminCardRow
                    key={item.orderId}
                    href={orderDetailHref(item.orderId)}
                    highlight={isNew(item)}
                    line1={
                      <>
                        <AdminRef>{item.reference}</AdminRef>
                        <ModeChip mode={item.mode} />
                        {isNew(item) ? (
                          <AdminChip tone="ink">
                            {adminT("admin.orders.new")}
                          </AdminChip>
                        ) : null}
                        <span className="ms-auto font-bold [font-variant-numeric:lining-nums_tabular-nums]">
                          {formatOrderMoney(item.totalMinor, item.currency)}
                        </span>
                      </>
                    }
                    subline={
                      <>
                        <StatusChip item={item} />
                        <span className="text-ink-3 text-[13px]">
                          {buyerSees(item)}
                        </span>
                      </>
                    }
                    line2={adminT("admin.orders.rowLine", {
                      date: deliveryDay(item.deliveryDate),
                      city: item.cityName ?? adminT("admin.orders.noCity"),
                      florist: florist(item),
                    })}
                    line3={adminT("admin.orders.placedAt", {
                      time: placed(item),
                      zone,
                    })}
                  />
                ))}
              </AdminCardRows>
              <AdminPager
                label={adminT("admin.orders.pager.label")}
                summary={adminT("admin.orders.pager.summaryShort", range)}
                {...pages}
              />
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
