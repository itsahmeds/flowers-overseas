/**
 * `alerts.monitor`, every minute, read-only except `ops_alert` (spec 025 §5.2 "Monitor rules",
 * §12 "Migration order"; AC-16 to AC-26; TASK-489).
 *
 * Each check has its cadence (1, 5 or 15 minutes, by the injected clock's minute) and an injected
 * clock in the suites. The decisions are pure and exported (`errorRateFires`,
 * `notAcceptedSeverity`, `dispatchRiskSeverity`, `notDeliveredDue`, `photoMissingSeverity`,
 * `bounceRateFires`, `complaintSeverity`, `neonSeverity`, `fxState`, `weekdayHoursBetween`); the
 * job reads, decides, and calls `raiseAlert` or `clearCondition`, which write `ops_alert` and
 * nothing else. A check whose source table does not exist yet logs `skipped: source_missing` and
 * the run goes on.
 *
 *  - **`webhook.error_rate`** per provider, rows received in the last 10 minutes: at least 2
 *    `failed` or `dead`, and that count above 2 % of the rows received;
 *  - **`order.not_accepted`**: a `routed` order with no accepted offer, measured from its first
 *    `offered_at` (a night-deferred order's real offer): P2 at +120 minutes (+60 same-day), P1
 *    from the routing deadline minus 3 hours; resolved when the order leaves the at-risk set;
 *  - **`order.dispatch_at_risk`**: due today destination-local and `accepted` or `in_production`:
 *    P2 from 13:00, P1 from 16:00; act-by 18:00 local;
 *  - **`order.not_delivered`**: at 20:00 destination-local on the delivery date, not delivered,
 *    closed, cancelled or refunded: P1;
 *  - **`order.photo_missing`**: `delivered` for more than 2 hours with no delivery proof: P3; more
 *    than 24 hours: P2;
 *  - **`jobs.backlog`** and **`jobs.failed_spike`** over pg-boss's own table (the tick's queue
 *    connection; the web role holds nothing in schema `pgboss`);
 *  - **site probes** through the public origin, `User-Agent: fo-probe/1`, 10 s timeout, no query
 *    string: `site.down` when health fails, or 2 or more probe URLs fail, on 2 consecutive runs;
 *    `site.page_failing` when one URL fails on 2 consecutive runs. The run memory is in process
 *    (single replica, spec 040): a restart forgets at most one failed run;
 *  - **FX** from the health probe's `fxAsOf` with spec 005's `fxRateStaleAfter`: `fx.stale` past
 *    it, `fx.aging` within 24 counted weekday hours of it;
 *  - **email** over spec 016's `notification_delivery` in 24 hours: hard bounces above 4 % with at
 *    least 25 sends; each new complaint raises `email.complaint` (P2 from the second in 24 hours);
 *  - **Neon** from the latest `db_usage_sample`: 70 % P3, 90 % P2. **Backups**: no verification
 *    record exists yet (spec 002's `db.backup_verify` has no handler), so the check reports
 *    `skipped: source_missing` until it does.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { MONITOR } from "@/config/alerts";
import { fxRateStaleAfter } from "@/config/catalogue/fx.data";
import { zonedClock } from "@/modules/i18n";

import { type OpsDeps, type OpsExecutor, iso, resolveDeps } from "./context.ts";
import type { QueueReader } from "./heartbeat.ts";
import { opsLog } from "./log.ts";
import { localDate, localInstant } from "./quiet-hours.ts";
import { clearCondition, raiseAlert } from "./raise.ts";
import type { AlertName, Severity } from "./registry.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// ---------------------------------------------------------------------------------------------
// The pure decisions
// ---------------------------------------------------------------------------------------------

/** AC-17: at least 2 failed, and failed above 2 % of received. */
export function errorRateFires(failed: number, received: number): boolean {
  return (
    failed >= MONITOR.webhookMinFailed &&
    failed * 10_000 > received * MONITOR.webhookFailedShareBp
  );
}

/** AC-18: P1 from the deadline minus 3 hours, else P2 from first offer plus 120 (60 same-day). */
export function notAcceptedSeverity(
  firstOfferAt: Date,
  sameDay: boolean,
  deadline: Date | null,
  now: Date,
): Severity | null {
  if (
    deadline !== null &&
    now.getTime() >=
      deadline.getTime() - MONITOR.notAcceptedP1BeforeDeadlineMinutes * MINUTE
  ) {
    return "P1";
  }
  const after = sameDay
    ? MONITOR.notAcceptedSameDayAfterMinutes
    : MONITOR.notAcceptedAfterMinutes;
  return now.getTime() >= firstOfferAt.getTime() + after * MINUTE ? "P2" : null;
}

/** AC-19: by the destination's local hour on the delivery date. */
export function dispatchRiskSeverity(localHour: number): Severity | null {
  if (localHour >= MONITOR.dispatchP1LocalHour) return "P1";
  if (localHour >= MONITOR.dispatchP2LocalHour) return "P2";
  return null;
}

/** AC-20: from 20:00 local on the delivery date. */
export function notDeliveredDue(localHour: number): boolean {
  return localHour >= MONITOR.notDeliveredLocalHour;
}

/** AC-21: more than 2 hours delivered without proof P3, more than 24 hours P2. */
export function photoMissingSeverity(
  deliveredAt: Date,
  now: Date,
): Severity | null {
  const age = now.getTime() - deliveredAt.getTime();
  if (age > MONITOR.photoMissingP2AfterMinutes * MINUTE) return "P2";
  if (age > MONITOR.photoMissingP3AfterMinutes * MINUTE) return "P3";
  return null;
}

/** AC-25: more than 4 % hard bounces over at least 25 sends. */
export function bounceRateFires(bounced: number, sends: number): boolean {
  return (
    sends >= MONITOR.bounceMinSends &&
    bounced * 10_000 > sends * MONITOR.bounceShareBp
  );
}

/** AC-25: one complaint P3, a second in 24 hours P2. */
export function complaintSeverity(count: number): Severity | null {
  if (count >= MONITOR.complaintP2Count) return "P2";
  return count >= 1 ? "P3" : null;
}

/** AC-26: 70 % P3, 90 % P2. */
export function neonSeverity(percent: number): Severity | null {
  if (percent >= MONITOR.neonP2Percent) return "P2";
  if (percent >= MONITOR.neonP3Percent) return "P3";
  return null;
}

function isWeekdayUtc(at: number): boolean {
  const day = new Date(at).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Whole Monday-to-Friday hours from `from` to `to` (UTC days; 0 when `to` is not later). */
export function weekdayHoursBetween(from: Date, to: Date): number {
  let hours = 0;
  for (let at = from.getTime(); at + HOUR <= to.getTime(); at += HOUR) {
    if (isWeekdayUtc(at)) hours += 1;
  }
  return hours;
}

/** AC-24: stale past the instant, aging within 24 counted weekday hours of it. */
export function fxState(
  fxAsOf: string,
  now: Date,
  staleAfter: (asOf: string) => number = fxRateStaleAfter,
): "stale" | "aging" | "fresh" {
  const staleAt = new Date(staleAfter(fxAsOf));
  if (now.getTime() > staleAt.getTime()) return "stale";
  return weekdayHoursBetween(now, staleAt) <= MONITOR.fxAgingWeekdayHours
    ? "aging"
    : "fresh";
}

/** AC-23: the site decision over the consecutive-failure counts of one run. */
export function siteDecision(
  consecutiveFailures: Readonly<Record<string, number>>,
): { readonly down: boolean; readonly failing: readonly string[] } {
  const twice = Object.entries(consecutiveFailures)
    .filter(([, count]) => count >= 2)
    .map(([probe]) => probe);
  const down = twice.includes("health") || twice.length >= 2;
  return { down, failing: down ? [] : twice };
}

// ---------------------------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------------------------

export interface ProbeResult {
  readonly ok: boolean;
  readonly status?: number;
  /** `/api/health`'s `fxAsOf`, when the health probe answered. */
  readonly fxAsOf?: string;
}

/** One probe GET: `{base}{path}`, no query string, the probe UA, 10 s timeout. */
export async function probeUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "User-Agent": MONITOR.probeUserAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(MONITOR.probeTimeoutMs),
    });
    if (!response.ok) return { ok: false, status: response.status };
    if (url.endsWith("/api/health")) {
      const body = z
        .object({
          fxAsOf: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/u)
            .optional(),
        })
        .safeParse(await response.json().catch(() => ({})));
      return {
        ok: true,
        status: response.status,
        ...(body.success && body.data.fxAsOf !== undefined
          ? { fxAsOf: body.data.fxAsOf }
          : {}),
      };
    }
    return { ok: true, status: response.status };
  } catch {
    return { ok: false };
  }
}

/** The run memory of the site probes: consecutive failures per probe key. */
export type ProbeMemory = Map<string, number>;
const processProbeMemory: ProbeMemory = new Map();

/** The routing deadline rule (spec 016's `routingDeadline`, handed in by the worker). */
export type DeadlineRule = (
  deliveryDate: string,
  destination: {
    readonly ianaZone: string;
    readonly sameDayCutoffLocal: string;
  },
) => Date;

export interface MonitorDeps extends OpsDeps {
  readonly queue?: QueueReader;
  readonly routingDeadline?: DeadlineRule;
  readonly probe?: (url: string) => Promise<ProbeResult>;
  readonly baseUrl?: () => string;
  readonly probeMemory?: ProbeMemory;
  readonly fxStaleAfter?: (asOf: string) => number;
  /** Run every check regardless of its cadence (the suites). */
  readonly allCadences?: boolean;
}

export type CheckOutcome = "ran" | "skipped" | "source_missing" | "failed";

export interface MonitorCounts {
  readonly raised: number;
  readonly cleared: number;
  readonly checks: Readonly<Record<string, CheckOutcome>>;
}

/** The order states each order alert stays open in (§5.2 "Clears"). */
const AT_RISK: Readonly<Partial<Record<AlertName, readonly string[]>>> = {
  "order.not_accepted": ["routed", "no_partner_available", "manual_reroute"],
  "order.dispatch_at_risk": [
    "accepted",
    "paid",
    "in_production",
    "awaiting_buyer",
  ],
  "order.not_delivered": [
    "accepted",
    "paid",
    "in_production",
    "awaiting_buyer",
    "out_for_delivery",
    "delivery_failed",
    "redelivery_scheduled",
  ],
  "order.photo_missing": ["delivered"],
  "payment.paid_not_routed": ["authorised", "paid_unrouted"],
  "routing.no_partner": ["no_partner_available"],
  "routing.sla_overdue": ["routed"],
};

async function tableExists(
  executor: OpsExecutor,
  table: string,
): Promise<boolean> {
  const [row] = await executor.execute(
    sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS present`,
  );
  return row?.["present"] === true;
}

function due(now: Date, cadence: number, all: boolean): boolean {
  return all || now.getUTCMinutes() % cadence === 0;
}

const OrderRow = z.object({
  id: z.uuid(),
  delivery_date: z.string(),
  iana_zone: z.string().nullable(),
  same_day_cutoff_local: z.string().nullable(),
  mode: z.string(),
});

/** One `alerts.monitor` run. */
export async function runMonitor(
  deps: MonitorDeps = {},
): Promise<MonitorCounts> {
  const d = resolveDeps(deps, "alerts.monitor");
  const log = opsLog(d.log);
  const started = Date.now();
  const now = d.now();
  const all = deps.allCadences === true;
  const memory = deps.probeMemory ?? processProbeMemory;
  const checks: Record<string, CheckOutcome> = {};
  let raised = 0;
  let cleared = 0;
  const raise = async (
    name: AlertName,
    input: Parameters<typeof raiseAlert>[1],
  ) => {
    const result = await raiseAlert(name, input, deps);
    if (result.alertId !== null) raised += 1;
  };
  const clear = async (
    name: AlertName,
    subject: Parameters<typeof clearCondition>[1],
    immediate = false,
  ) => {
    const result = await clearCondition(name, subject, { immediate }, deps);
    if (result.resolved) cleared += 1;
  };
  const check = async (
    key: string,
    cadence: number,
    tables: readonly string[],
    fn: () => Promise<void>,
  ) => {
    if (!due(now, cadence, all)) {
      checks[key] = "skipped";
      return;
    }
    try {
      for (const table of tables) {
        if (
          !(await d.transaction((executor) => tableExists(executor, table)))
        ) {
          checks[key] = "source_missing";
          log.info(
            { job: "alerts.monitor", outcome: "source_missing", kind: key },
            "alerts.monitor.skipped",
          );
          return;
        }
      }
      await fn();
      checks[key] = "ran";
    } catch {
      checks[key] = "failed";
      log.error(
        { job: "alerts.monitor", outcome: "failed", kind: key },
        "alerts.monitor.check_failed",
      );
    }
  };

  await check("webhook.error_rate", 1, ["webhook_inbox"], async () => {
    const since = iso(
      new Date(now.getTime() - MONITOR.webhookWindowMinutes * MINUTE),
    );
    const rows = await d.transaction((executor) =>
      executor.execute(sql`
        SELECT provider, count(*)::int AS received,
               count(*) FILTER (WHERE status IN ('failed', 'dead'))::int AS failed
          FROM webhook_inbox
         WHERE received_at > ${since}::timestamptz AND received_at <= ${iso(now)}::timestamptz
         GROUP BY provider`),
    );
    const firing = new Set<string>();
    for (const row of rows) {
      const provider = z
        .enum(["stripe", "mollie", "resend"])
        .safeParse(row["provider"]);
      if (!provider.success) continue;
      const failed = Number(row["failed"]);
      const received = Number(row["received"]);
      if (errorRateFires(failed, received)) {
        firing.add(provider.data);
        await raise("webhook.error_rate", {
          component: provider.data,
          context: { provider: provider.data, failed, received },
        });
      }
    }
    for (const provider of ["stripe", "mollie", "resend"] as const) {
      if (!firing.has(provider))
        await clear("webhook.error_rate", { component: provider });
    }
  });

  await check(
    "order.not_accepted",
    1,
    ["order", "order_assignment"],
    async () => {
      const rows = await d.transaction((executor) =>
        executor.execute(sql`
        SELECT o.id, o.delivery_date::text AS delivery_date, o.mode,
               coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
               to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local,
               f.first_offer_at
          FROM "order" o
          JOIN country c ON c.id = o.destination_country_id
          LEFT JOIN city ci ON ci.id = o.destination_city_id
          CROSS JOIN LATERAL (SELECT min(a.offered_at) AS first_offer_at FROM order_assignment a
                               WHERE a.order_id = o.id) f
         WHERE o.status = 'routed' AND o.mode IN ('test', 'live') AND f.first_offer_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM order_assignment x
                            WHERE x.order_id = o.id AND x.response = 'accept')
         LIMIT 500`),
      );
      for (const raw of rows) {
        const row = OrderRow.extend({ first_offer_at: z.coerce.date() }).parse(
          raw,
        );
        const zone = row.iana_zone;
        const deadline =
          zone !== null &&
          row.same_day_cutoff_local !== null &&
          deps.routingDeadline !== undefined
            ? deps.routingDeadline(row.delivery_date, {
                ianaZone: zone,
                sameDayCutoffLocal: row.same_day_cutoff_local,
              })
            : null;
        const sameDay =
          zone !== null &&
          localDate(row.first_offer_at, zone) === row.delivery_date;
        const severity = notAcceptedSeverity(
          row.first_offer_at,
          sameDay,
          deadline,
          now,
        );
        if (severity === null) continue;
        await raise("order.not_accepted", {
          orderId: row.id,
          severity,
          ...(deadline === null ? {} : { actBy: deadline }),
          context: { delivery_date: row.delivery_date },
        });
      }
    },
  );

  await check("order.dispatch_at_risk", 5, ["order"], async () => {
    const rows = await d.transaction((executor) =>
      executor.execute(sql`
        SELECT o.id, o.delivery_date::text AS delivery_date, o.mode, o.status,
               coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
               to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local
          FROM "order" o
          JOIN country c ON c.id = o.destination_country_id
          LEFT JOIN city ci ON ci.id = o.destination_city_id
         WHERE o.mode IN ('test', 'live')
           AND o.status = ANY (${`{${(AT_RISK["order.not_delivered"] ?? []).join(",")}}`}::text[])
           AND o.delivery_date BETWEEN (${iso(now)}::timestamptz - interval '2 days')::date
                                   AND (${iso(now)}::timestamptz + interval '2 days')::date
         LIMIT 1000`),
    );
    for (const raw of rows) {
      const row = OrderRow.extend({ status: z.string() }).parse(raw);
      if (row.iana_zone === null) continue;
      if (localDate(now, row.iana_zone) !== row.delivery_date) continue;
      const hour = zonedClock(now, row.iana_zone).hour;
      if (notDeliveredDue(hour)) {
        await raise("order.not_delivered", {
          orderId: row.id,
          actBy: localInstant(row.delivery_date, "23:59", row.iana_zone),
          context: { delivery_date: row.delivery_date },
        });
      }
      if ((AT_RISK["order.dispatch_at_risk"] ?? []).includes(row.status)) {
        const severity = dispatchRiskSeverity(hour);
        if (severity !== null) {
          await raise("order.dispatch_at_risk", {
            orderId: row.id,
            severity,
            actBy: localInstant(
              row.delivery_date,
              `${String(MONITOR.dispatchActByLocalHour).padStart(2, "0")}:00`,
              row.iana_zone,
            ),
            context: { delivery_date: row.delivery_date },
          });
        }
      }
    }
  });

  await check(
    "order.photo_missing",
    15,
    ["order", "order_event", "delivery_proof"],
    async () => {
      const rows = await d.transaction((executor) =>
        executor.execute(sql`
        SELECT o.id, d.delivered_at
          FROM "order" o
          CROSS JOIN LATERAL (SELECT max(e.occurred_at) AS delivered_at FROM order_event e
                               WHERE e.order_id = o.id AND e.to_status = 'delivered') d
         WHERE o.status = 'delivered' AND o.mode IN ('test', 'live') AND d.delivered_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM delivery_proof p WHERE p.order_id = o.id)
         LIMIT 500`),
      );
      for (const raw of rows) {
        const row = z
          .object({ id: z.uuid(), delivered_at: z.coerce.date() })
          .parse(raw);
        const severity = photoMissingSeverity(row.delivered_at, now);
        if (severity !== null)
          await raise("order.photo_missing", { orderId: row.id, severity });
      }
    },
  );

  // Order alerts resolve when their order leaves the at-risk set (§5.5 "Resolve").
  await check("order.resolve", 1, ["order"], async () => {
    const rows = await d.transaction((executor) =>
      executor.execute(sql`
        SELECT a.name, a.order_id, o.status,
               EXISTS (SELECT 1 FROM delivery_proof p WHERE p.order_id = a.order_id) AS has_proof
          FROM ops_alert a JOIN "order" o ON o.id = a.order_id
         WHERE a.environment = ${d.environment} AND a.status <> 'resolved'`),
    );
    for (const raw of rows) {
      const row = z
        .object({
          name: z.string(),
          order_id: z.uuid(),
          status: z.string(),
          has_proof: z.boolean(),
        })
        .parse(raw);
      const states = AT_RISK[row.name as AlertName];
      if (states === undefined) continue;
      const leftRisk =
        !states.includes(row.status) ||
        (row.name === "order.photo_missing" && row.has_proof);
      if (leftRisk)
        await clear(row.name as AlertName, { orderId: row.order_id }, true);
    }
  });

  await check("jobs", 1, [], async () => {
    if (deps.queue === undefined) {
      checks["jobs"] = "source_missing";
      return;
    }
    const backlog = await deps.queue.executeSql(
      `SELECT count(*)::int AS n FROM pgboss.job
        WHERE (state IN ('created', 'retry') AND start_after < $1::timestamptz - interval '${String(MONITOR.backlogMinutes)} minutes')
           OR (state = 'active' AND started_on + make_interval(secs => expire_seconds) < $1::timestamptz - interval '${String(MONITOR.backlogMinutes)} minutes')`,
      [iso(now)],
    );
    const stuck = Number(backlog.rows[0]?.["n"] ?? 0);
    if (stuck > 0)
      await raise("jobs.backlog", {
        component: "queue",
        context: { count: stuck },
      });
    else await clear("jobs.backlog", { component: "queue" });
    if (due(now, 5, all)) {
      const failed = await deps.queue.executeSql(
        `SELECT count(*)::int AS n FROM pgboss.job
          WHERE state = 'failed' AND completed_on > $1::timestamptz - interval '${String(MONITOR.failedSpikeWindowMinutes)} minutes'`,
        [iso(now)],
      );
      const count = Number(failed.rows[0]?.["n"] ?? 0);
      if (count >= MONITOR.failedSpikeCount) {
        await raise("jobs.failed_spike", {
          component: "queue",
          context: { failed: count },
        });
      } else {
        await clear("jobs.failed_spike", { component: "queue" });
      }
    }
  });

  let fxAsOf: string | undefined;
  await check("site", 1, [], async () => {
    const base = (
      deps.baseUrl ?? (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "")
    )().replace(/\/+$/u, "");
    if (base === "") {
      checks["site"] = "source_missing";
      return;
    }
    const probes: Record<string, string> =
      d.environment === "production"
        ? { health: "/api/health", home: "/en", sitemap: "/sitemap.xml" }
        : { health: "/api/health" };
    const probe = deps.probe ?? ((url: string) => probeUrl(url));
    for (const [key, path] of Object.entries(probes)) {
      const result = await probe(`${base}${path}`);
      if (key === "health" && result.fxAsOf !== undefined)
        fxAsOf = result.fxAsOf;
      memory.set(key, result.ok ? 0 : (memory.get(key) ?? 0) + 1);
    }
    const decision = siteDecision(Object.fromEntries(memory));
    if (decision.down) await raise("site.down", { component: "site" });
    else await clear("site.down", { component: "site" });
    for (const key of Object.keys(probes)) {
      if (key === "health") continue;
      const probeKey = z
        .enum(["health", "home", "sitemap", "corridor", "product"])
        .parse(key);
      if (decision.failing.includes(key)) {
        await raise("site.page_failing", {
          component: "site",
          subKey: key,
          context: { probe: probeKey },
        });
      } else {
        await clear("site.page_failing", { component: "site", subKey: key });
      }
    }
  });

  await check("fx", 15, [], async () => {
    if (fxAsOf === undefined) {
      checks["fx"] = "source_missing";
      return;
    }
    const state = fxState(fxAsOf, now, deps.fxStaleAfter);
    const staleAt = new Date((deps.fxStaleAfter ?? fxRateStaleAfter)(fxAsOf));
    if (state === "stale") {
      await raise("fx.stale", {
        component: "fx",
        context: { fx_as_of: fxAsOf, stale_at: iso(staleAt) },
      });
    } else {
      await clear("fx.stale", { component: "fx" });
    }
    if (state === "aging") {
      await raise("fx.aging", {
        component: "fx",
        actBy: staleAt,
        context: { fx_as_of: fxAsOf, stale_at: iso(staleAt) },
      });
    } else {
      await clear("fx.aging", { component: "fx" });
    }
  });

  await check("email", 15, ["notification_delivery"], async () => {
    const since = iso(
      new Date(now.getTime() - MONITOR.bounceWindowHours * HOUR),
    );
    const [row] = await d.transaction((executor) =>
      executor.execute(sql`
        SELECT count(*) FILTER (WHERE status IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained'))::int AS sends,
               count(*) FILTER (WHERE status = 'bounced')::int AS bounced,
               count(*) FILTER (WHERE status = 'complained')::int AS complaints
          FROM notification_delivery
         WHERE status_at > ${since}::timestamptz AND status_at <= ${iso(now)}::timestamptz`),
    );
    const sends = Number(row?.["sends"] ?? 0);
    const bounced = Number(row?.["bounced"] ?? 0);
    const complaints = Number(row?.["complaints"] ?? 0);
    if (bounceRateFires(bounced, sends)) {
      await raise("email.bounce_rate", {
        component: "email",
        context: { sends, bounces: bounced },
      });
    } else {
      await clear("email.bounce_rate", { component: "email" });
    }
    const severity = complaintSeverity(complaints);
    if (severity !== null) {
      const day = now.toISOString().slice(0, 10);
      const [known] = await d.transaction((executor) =>
        executor.execute(sql`
          SELECT (context->>'complaints')::int AS complaints FROM ops_alert
           WHERE environment = ${d.environment} AND fingerprint = ${`email.complaint:email:${day}`}
           ORDER BY created_at DESC LIMIT 1`),
      );
      if (complaints > Number(known?.["complaints"] ?? 0)) {
        await raise("email.complaint", {
          component: "email",
          subKey: day,
          severity,
          context: { complaints },
        });
      }
    }
  });

  await check("neon", 15, ["db_usage_sample"], async () => {
    const [row] = await d.transaction((executor) =>
      executor.execute(sql`
        SELECT compute_seconds_used, compute_seconds_cap FROM db_usage_sample
         ORDER BY captured_at DESC LIMIT 1`),
    );
    if (row === undefined) {
      checks["neon"] = "source_missing";
      return;
    }
    const percent = Math.min(
      100,
      (Number(row["compute_seconds_used"]) /
        Math.max(1, Number(row["compute_seconds_cap"]))) *
        100,
    );
    const severity = neonSeverity(percent);
    if (severity !== null) {
      await raise("db.usage_high", {
        component: "neon",
        severity,
        context: { percent: Math.round(percent * 10) / 10 },
      });
    } else {
      await clear("db.usage_high", { component: "neon" });
    }
  });

  checks["backup"] = "source_missing";

  log.info(
    {
      job: "alerts.monitor",
      outcome: "done",
      count: raised,
      duration_ms: Date.now() - started,
    },
    "alerts.monitor.run",
  );
  return { raised, cleared, checks };
}
