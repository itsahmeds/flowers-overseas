/**
 * @purpose GET /admin/basket-reminders: basket email sends, skips by reason, recovery and revenue per currency (034 AC-24)
 * @spec 034
 *
 * `finance.view` (admin only, spec 034 §13 Q12, revenue figures included); other roles get 403, no
 * session goes to sign-in (the signed-in layout). SSR `no-store` and `noindex` from the admin
 * document and headers. The range is a plain GET link (`?range=7d|30d|90d`, default 30 days).
 * Revenue is listed per currency through `formatMoney`, never summed across currencies; the rate
 * comes from basis points. No email, hash or token is read or rendered. Artboard
 * `admin-basket-reminders.dc.html`.
 */
import Link from "next/link";
import type { ReactElement } from "react";

import { adminRequestId, adminT, requireAdminPage } from "@/modules/admin";
import {
  BASKET_REMINDERS_VIEW_ACTION,
  type BasketReminderMetrics,
  basketReminderFlagState,
  basketReminderMetrics,
  MetricsRangeSchema,
  SKIP_REASONS,
} from "@/modules/admin/basket-reminders";
import { financeRunner } from "@/modules/admin/finance";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
} from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCell,
  AdminEmpty,
  AdminRow,
  AdminTable,
} from "@/modules/ui/admin/AdminData";
import { AdminCard, AdminSection } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../frame";

const PATH = "/admin/basket-reminders";

function Tile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <AdminCard>
      <p className="text-ink-2 m-0 text-[13px]">{label}</p>
      <p className="m-0 text-[24px] font-bold [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
      </p>
    </AdminCard>
  );
}

function Figures({
  metrics,
}: {
  readonly metrics: BasketReminderMetrics;
}): ReactElement {
  const n = (value: number) => formatNumber(value, "en");
  const revenue =
    metrics.recoveredRevenue.length === 0
      ? adminT("admin.basketReminders.revenueNone")
      : metrics.recoveredRevenue
          .map((entry) =>
            formatMoney(
              { amountMinor: entry.totalMinor, currency: entry.currency },
              "en",
            ),
          )
          .join(" · ");
  return (
    <>
      <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={adminT("admin.basketReminders.sent")}
          value={n(metrics.sent)}
        />
        <Tile
          label={adminT("admin.basketReminders.recovered")}
          value={n(metrics.recoveredPurchases)}
        />
        <Tile
          label={adminT("admin.basketReminders.rate")}
          value={formatPercentFromBasisPoints(metrics.recoveryRateBp, "en")}
        />
        <Tile label={adminT("admin.basketReminders.revenue")} value={revenue} />
      </div>
      <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          label={adminT("admin.basketReminders.linksOpened")}
          value={n(metrics.linksOpened)}
        />
        <Tile
          label={adminT("admin.basketReminders.failed")}
          value={n(metrics.failed)}
        />
        <Tile
          label={adminT("admin.basketReminders.stopped")}
          value={n(metrics.unsubscribes)}
        />
        <Tile
          label={adminT("admin.basketReminders.bounced")}
          value={n(metrics.bounces)}
        />
        <Tile
          label={adminT("admin.basketReminders.complained")}
          value={n(metrics.complaints)}
        />
      </div>
      <AdminSection title={adminT("admin.basketReminders.skipped")}>
        <AdminTable
          columns={[
            {
              key: "reason",
              label: adminT("admin.basketReminders.column.reason"),
            },
            {
              key: "count",
              label: adminT("admin.basketReminders.column.count"),
              align: "end",
            },
          ]}
        >
          {SKIP_REASONS.map((reason) => (
            <AdminRow key={reason}>
              <AdminCell>
                {adminT(`admin.basketReminders.reason.${reason}`)}
              </AdminCell>
              <AdminCell align="end">{n(metrics.skipped[reason])}</AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </AdminSection>
    </>
  );
}

export default async function AdminBasketRemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("finance.view");
  const parsedRange = MetricsRangeSchema.safeParse(
    (await searchParams)["range"],
  );
  const range = parsedRange.success ? parsedRange.data : "30d";
  const now = new Date();
  const { metrics, flag } = await financeRunner(
    {
      userId: session.userId,
      requestId: await adminRequestId(),
      action: BASKET_REMINDERS_VIEW_ACTION,
    },
    async (executor) => ({
      metrics: await basketReminderMetrics(executor, range, now),
      flag: await basketReminderFlagState(executor),
    }),
  );

  return (
    <AdminFrame session={session} current="basketReminders">
      <div className="grid gap-[16px] md:gap-[20px]">
        <div className="grid gap-[6px]">
          <AdminPageTitle>
            {adminT("admin.basketReminders.title")}
          </AdminPageTitle>
          <p className="text-ink-2 m-0 text-[14px]">
            {adminT("admin.basketReminders.intro")}
          </p>
        </div>
        {flag.pausedAutomaticallyAt !== null ? (
          <p
            role="status"
            className="bg-blush m-0 rounded-[10px] px-[14px] py-[10px] text-[14px]"
          >
            {adminT("admin.basketReminders.paused", {
              date: formatDate(
                flag.pausedAutomaticallyAt,
                "en",
                "dayMonthYear",
                session.timeZone,
              ),
            })}{" "}
            {adminT("admin.basketReminders.pausedHint")}
          </p>
        ) : flag.on ? null : (
          <p
            role="status"
            className="bg-butter m-0 rounded-[10px] px-[14px] py-[10px] text-[14px]"
          >
            {adminT("admin.basketReminders.off")}
          </p>
        )}
        <nav
          aria-label={adminT("admin.basketReminders.range.label")}
          className="flex flex-wrap gap-[8px]"
        >
          {MetricsRangeSchema.options.map((option) => (
            <Link
              key={option}
              href={`${PATH}?range=${option}`}
              aria-current={option === range ? "page" : undefined}
              className={`rounded-full border px-[12px] py-[6px] text-[14px] ${
                option === range
                  ? "bg-ink text-card border-ink font-bold"
                  : "border-rule"
              }`}
            >
              {adminT(`admin.basketReminders.range.${option}`)}
            </Link>
          ))}
        </nav>
        {metrics.sent === 0 ? (
          <AdminEmpty title={adminT("admin.basketReminders.empty")} />
        ) : null}
        <Figures metrics={metrics} />
      </div>
    </AdminFrame>
  );
}
