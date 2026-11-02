/**
 * `order.route` — offer a paid order to its next florist, or give it up (spec 016 §5.2 "Jobs",
 * "Transitions and events this spec writes"; AC-5, AC-6, AC-9, AC-10; TASK-328).
 *
 * One run, in **one transaction** (a `system` one of its own unless the caller passes one):
 *
 *  1. lock the order `FOR UPDATE` and read what routing needs (mode, status, delivery date, the
 *     destination's zone and same-day cutoff, its postcode zone, its lines, the florists already
 *     offered). A `demo` order, an order not at `paid_unrouted` or `routed`, an order with an
 *     open or accepted offer: nothing to do (a run is never harmful twice);
 *  2. 5 offers made → exhausted; `offerWindow` says the routing deadline has passed → exhausted;
 *     it says the offer waits for the morning → enqueue this job again with `startAfter` and
 *     write nothing;
 *  3. read every florist of the right status in the destination country, as `RoutingPartner`
 *     snapshots, filter with `eligibleCandidates` and order with `rankCandidates`;
 *  4. for each candidate in that order: lock its `fulfillment_partner` row `FOR UPDATE`, **then**
 *     recount its accepted plus open offers on the delivery date, and re-run the same pure rule
 *     on the fresh count. Full now (another route took the last place while this one read) →
 *     the next candidate. Two routes can therefore never take a florist past its capacity: the
 *     second waits on the lock and counts the first's offer;
 *  5. the first that still fits gets the offer: `order.routed` through `transition` (first offer
 *     only), one `order_assignment` (`attempt` + 1, `offered_at`, `sla_expires_at`), then
 *     `assignment.offered` through `appendEvent`, and the reminder and the timeout enqueued for
 *     the assignment. Nobody fits → exhausted.
 *
 * **Exhausted** is `order.no_partner_available` (row 10 from `routed`, spec 002 §14 A8's row from
 * `paid_unrouted`), then, once committed, the Sentry alert `routing.no_partner`. The founder's
 * email (A1) is the `notifications` outbox row the event writes (TASK-331 sends it), and the
 * same transaction schedules `order.no_partner_expire` at `graceEnd` (TASK-329, `./no-partner`).
 *
 * Status changes only through `transition`, events only through the engine. Logs: ids, counts,
 * rule names and the outcome; never a postcode, an address or a name.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { signInPolicy } from "@/config/florists";
import { ROUTING_WINDOWS } from "@/config/routing";
import { appEnvironment } from "@/lib/env.schema";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";

import { appendEvent } from "../service/append-event";
import { OrderModeSchema } from "../service/events";
import {
  textArray,
  withExecutor,
  type OrderExecutor,
} from "../service/executor";
import { transition } from "../service/transition";

import {
  eligibleCandidates,
  type EligibilityContext,
  type ExclusionRule,
  type PartnerStatus,
  PARTNER_STATUS_FOR_MODE,
  rankCandidates,
  type RoutedMode,
  type RoutingLine,
  type RoutingOrder,
  type RoutingPartner,
  RoutingPartnerSchema,
} from "./candidates";
import { ORDER_ROUTE_ACTOR } from "./events";
import { scheduleNoPartnerExpiry } from "./no-partner";
import { pgBossRoutingScheduler, type RoutingScheduler } from "./schedule";
import { offerWindow, type RoutingDestination } from "./windows";

/* -------------------------------------------------------------------------- */
/* Seams                                                                      */
/* -------------------------------------------------------------------------- */

/** Runs `fn` in one transaction and commits it (or rolls it back on a throw). */
export type RoutingTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** An alert raised once the step has committed (spec 016 §11). */
export type RoutingAlert = (
  alert: string,
  fields: Readonly<Record<string, unknown>> & { readonly order_id?: string },
) => void;

/** What every routing job may be given; each has the production default. */
export interface RoutingDeps {
  /** Default: a fresh `system` transaction (`withSystemContext`). */
  readonly transaction?: RoutingTransaction;
  readonly now?: () => Date;
  /** Default: pg-boss (`pgBossRoutingScheduler`). */
  readonly schedule?: RoutingScheduler;
  /** The deployment environment `signInPolicy` reads (default: `APP_ENV`). */
  readonly environment?: string;
  /** Overrides `signInPolicy(environment)` (the suites route `live` orders outside production). */
  readonly signInStatuses?: readonly PartnerStatus[];
  readonly alert?: RoutingAlert;
  readonly log?: Logger;
}

export interface ResolvedRoutingDeps {
  readonly transaction: RoutingTransaction;
  readonly now: () => Date;
  readonly schedule: RoutingScheduler;
  readonly signIn: EligibilityContext;
  readonly alert: RoutingAlert;
  readonly log: Logger;
}

/** The deps with their defaults filled in. */
export function resolveRoutingDeps(
  deps: RoutingDeps = {},
  job = "order.route",
): ResolvedRoutingDeps {
  const statuses =
    deps.signInStatuses ??
    signInPolicy(deps.environment ?? appEnvironment(process.env));
  return {
    transaction: deps.transaction ?? ((fn) => withExecutor(undefined, job, fn)),
    now: deps.now ?? (() => new Date()),
    schedule: deps.schedule ?? pgBossRoutingScheduler,
    signIn: { signInStatuses: statuses },
    alert: deps.alert ?? captureAlert,
    log: deps.log ?? defaultLogger,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: OrderModeSchema,
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  destination_country_id: z.uuid(),
  destination_city_id: z.uuid().nullable(),
  postcode_zone_id: z.uuid().nullable(),
  iana_zone: z.string().min(1),
  same_day_cutoff_local: z
    .string()
    .regex(/^\d{2}:\d{2}$/u)
    .nullable(),
});

const LineRow = z.object({
  kind: z.enum(["product", "addon", "surcharge"]),
  product_id: z.uuid().nullable(),
  addon_id: z.uuid().nullable(),
  tier_key: z.string().nullable(),
  qty: z.coerce.number().int().positive(),
});

const AssignmentRow = z.object({
  partner_id: z.uuid(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  withdrawn: z.boolean(),
});

const Instant = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "not an instant" });
    return z.NEVER;
  }
  return date;
});

const PartnerRow = z.object({
  id: z.uuid(),
  status: z.string(),
  capacity_per_day: z.coerce.number().int().positive(),
  payout_currency_code: z.string(),
  rating_90d_bp: z.coerce.number().int().nullable(),
  acceptance_rate_bp: z.coerce.number().int().nullable(),
  member_count: z.coerce.number().int().nonnegative(),
  blackout: z.boolean(),
  load: z.coerce.number().int().nonnegative(),
  offers_90d: z.coerce.number().int().nonnegative(),
  last_offered_at: Instant.nullable(),
  coverage: z.array(
    z.object({
      cityId: z.uuid().nullable(),
      postcodeZoneId: z.uuid().nullable(),
      capacityPerDay: z.coerce.number().int().positive().nullable(),
    }),
  ),
  catalog: z.array(
    z.object({
      productId: z.uuid(),
      tierKey: z.string().nullable(),
      canFulfil: z.boolean(),
      payoutMinor: z.coerce.number().int().nonnegative(),
    }),
  ),
});

const LoadRow = z.object({ load: z.coerce.number().int().nonnegative() });

/** Everything one run reads about its order, under the order's lock. */
export interface RoutingFacts {
  readonly orderId: string;
  readonly status: string;
  readonly mode: z.infer<typeof OrderModeSchema>;
  readonly deliveryDate: string;
  readonly countryId: string;
  /** Null when the country has no agreed operations (no same-day cutoff). */
  readonly destination: RoutingDestination | null;
  readonly order: Omit<RoutingOrder, "mode"> & { readonly mode: RoutedMode };
  readonly attempts: number;
  /** An offer still open, or accepted, and not withdrawn. */
  readonly live: boolean;
}

/** Locks the order and reads its routing facts; undefined when there is no such order. */
export async function lockRoutingFacts(
  executor: OrderExecutor,
  orderId: string,
): Promise<RoutingFacts | undefined> {
  if (!z.uuid().safeParse(orderId).success) return undefined;
  const [row] = await executor.execute(sql`
    SELECT o.id, o.status, o.mode, o.delivery_date::text AS delivery_date,
           o.destination_country_id, o.destination_city_id,
           (SELECT z.id FROM postcode_zone z
            WHERE o.destination_postcode IS NOT NULL
              AND z.country_id = o.destination_country_id
              AND starts_with(upper(o.destination_postcode), z.prefix)
            ORDER BY length(z.prefix) DESC LIMIT 1) AS postcode_zone_id,
           coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
           to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}
    FOR UPDATE OF o`);
  if (row === undefined) return undefined;
  const order = OrderRow.parse(row);
  const lines = (
    await executor.execute(sql`
      SELECT kind, product_id, addon_id, tier_key, qty FROM order_line
      WHERE order_id = ${orderId} ORDER BY created_at, id`)
  ).map((line) => LineRow.parse(line));
  const assignments = (
    await executor.execute(sql`
      SELECT partner_id, response, withdrawn_at IS NOT NULL AS withdrawn
      FROM order_assignment WHERE order_id = ${orderId} ORDER BY attempt`)
  ).map((assignment) => AssignmentRow.parse(assignment));

  const routingLines: RoutingLine[] = [];
  for (const line of lines) {
    if (line.kind === "product" && line.product_id !== null) {
      routingLines.push({
        kind: "product",
        productId: line.product_id,
        tierKey: line.tier_key,
        qty: line.qty,
      });
    } else if (line.kind === "addon" && line.addon_id !== null) {
      routingLines.push({
        kind: "addon",
        addonId: line.addon_id,
        qty: line.qty,
      });
    }
  }
  return {
    orderId: order.id,
    status: order.status,
    mode: order.mode,
    deliveryDate: order.delivery_date,
    countryId: order.destination_country_id,
    destination:
      order.same_day_cutoff_local === null
        ? null
        : {
            ianaZone: order.iana_zone,
            sameDayCutoffLocal: order.same_day_cutoff_local,
          },
    order: {
      mode: order.mode === "live" ? "live" : "test",
      postcodeZoneId: order.postcode_zone_id,
      cityId: order.destination_city_id,
      deliveryDate: order.delivery_date,
      lines: routingLines,
      offeredPartnerIds: assignments.map((assignment) => assignment.partner_id),
    },
    attempts: assignments.length,
    live: assignments.some(
      (assignment) =>
        !assignment.withdrawn &&
        (assignment.response === null || assignment.response === "accept"),
    ),
  };
}

/** Accepted plus open offers of `partnerId` on `deliveryDate` (withdrawn ones do not count). */
const loadSql = (partnerId: string, deliveryDate: string) => sql`
  SELECT count(*)::int AS load
  FROM order_assignment a JOIN "order" o ON o.id = a.order_id
  WHERE a.partner_id = ${partnerId}
    AND o.delivery_date = ${deliveryDate}::date
    AND a.withdrawn_at IS NULL
    AND (a.response IS NULL OR a.response = 'accept')`;

/** The florists of `status` in the destination country, as routing snapshots for the date. */
export async function readRoutingPartners(
  executor: OrderExecutor,
  input: {
    readonly countryId: string;
    readonly status: PartnerStatus;
    readonly deliveryDate: string;
    readonly productIds: readonly string[];
    readonly now: Date;
  },
): Promise<RoutingPartner[]> {
  const rows = await executor.execute(sql`
    SELECT p.id, p.status, p.capacity_per_day, p.payout_currency_code,
           p.rating_90d_bp, p.acceptance_rate_bp,
           (SELECT count(*) FROM partner_member m WHERE m.partner_id = p.id)::int AS member_count,
           EXISTS (SELECT 1 FROM partner_blackout b
                   WHERE b.partner_id = p.id AND b.date = ${input.deliveryDate}::date) AS blackout,
           (SELECT count(*) FROM order_assignment a JOIN "order" o ON o.id = a.order_id
            WHERE a.partner_id = p.id AND o.delivery_date = ${input.deliveryDate}::date
              AND a.withdrawn_at IS NULL
              AND (a.response IS NULL OR a.response = 'accept'))::int AS load,
           (SELECT count(*) FROM order_assignment a
            WHERE a.partner_id = p.id
              AND a.offered_at > ${input.now.toISOString()}::timestamptz - interval '90 days'
           )::int AS offers_90d,
           (SELECT max(a.offered_at) FROM order_assignment a WHERE a.partner_id = p.id)
             AS last_offered_at,
           coalesce((SELECT json_agg(json_build_object(
                       'cityId', c.city_id, 'postcodeZoneId', c.postcode_zone_id,
                       'capacityPerDay', c.capacity_per_day) ORDER BY c.id)
                     FROM partner_coverage c WHERE c.partner_id = p.id), '[]'::json) AS coverage,
           coalesce((SELECT json_agg(json_build_object(
                       'productId', m.product_id, 'tierKey', m.tier_key,
                       'canFulfil', m.can_fulfil, 'payoutMinor', m.partner_payout_minor)
                       ORDER BY m.id)
                     FROM partner_catalog_mapping m
                     WHERE m.partner_id = p.id
                       AND m.product_id::text = ANY(${textArray(input.productIds)})),
                    '[]'::json) AS catalog
    FROM fulfillment_partner p
    WHERE p.country_id = ${input.countryId} AND p.status = ${input.status}
    ORDER BY p.id`);
  return rows.map((raw) => {
    const row = PartnerRow.parse(raw);
    return RoutingPartnerSchema.parse({
      partnerId: row.id,
      status: row.status,
      capacityPerDay: row.capacity_per_day,
      coverage: row.coverage,
      catalog: row.catalog,
      payoutCurrency: row.payout_currency_code,
      blackoutDates: row.blackout ? [input.deliveryDate] : [],
      loadOnDate: row.load,
      memberCount: row.member_count,
      ratingBp: row.rating_90d_bp,
      acceptanceRateBp: row.acceptance_rate_bp,
      offers90d: row.offers_90d,
      lastOfferedAt: row.last_offered_at,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* The job                                                                    */
/* -------------------------------------------------------------------------- */

/** Why an order was given up (the `routing.no_partner` alert's `reason`). */
export type ExhaustionReason = "no_candidate" | "max_offers" | "deadline";

/** Why a run did nothing. */
export type RouteSkipReason =
  "not_found" | "demo" | "status" | "offer_open" | "no_operations";

export type RouteOutcome =
  | {
      readonly kind: "offered";
      readonly assignmentId: string;
      readonly partnerId: string;
      readonly attempt: number;
      readonly offeredAt: Date;
      readonly slaExpiresAt: Date;
    }
  | { readonly kind: "deferred"; readonly offerAt: Date }
  | {
      readonly kind: "exhausted";
      readonly reason: ExhaustionReason;
      /** When `order.no_partner_expire` cancels it (`graceEnd`); null with no cutoff. */
      readonly expiresAt: Date | null;
    }
  | { readonly kind: "skipped"; readonly reason: RouteSkipReason };

const MINUTE_MS = 60_000;

/** The statuses a run may route from: the first offer, and every next one. */
const ROUTABLE = new Set(["paid_unrouted", "routed"]);

/**
 * Writes `order.no_partner_available` (row 10 from `routed`, A8's row from `paid_unrouted`) and,
 * in the same transaction, schedules `order.no_partner_expire` at `graceEnd` (TASK-329): no
 * charged order waits without an end.
 */
async function exhaust(
  executor: OrderExecutor,
  facts: RoutingFacts,
  reason: ExhaustionReason,
  deps: ResolvedRoutingDeps,
): Promise<RouteOutcome> {
  await transition(
    facts.orderId,
    "order.no_partner_available",
    ORDER_ROUTE_ACTOR,
    { mode: facts.mode },
    { executor },
  );
  const expiresAt = await scheduleNoPartnerExpiry(
    executor,
    facts.orderId,
    deps.schedule,
  );
  return { kind: "exhausted", reason, expiresAt };
}

/**
 * The candidate that still fits once its row is locked and its load recounted, or undefined
 * when none does (step 4).
 */
async function lockFirstThatFits(
  executor: OrderExecutor,
  facts: RoutingFacts,
  partners: readonly RoutingPartner[],
  signIn: EligibilityContext,
): Promise<RoutingPartner | undefined> {
  const eligibility = eligibleCandidates(facts.order, partners, signIn);
  const ranked = rankCandidates(eligibility.candidates, null);
  for (const candidate of ranked) {
    const partner = partners.find(
      (snapshot) => snapshot.partnerId === candidate.partnerId,
    );
    if (partner === undefined) continue;
    const fresh = await lockAndRecount(executor, facts.deliveryDate, partner);
    if (
      eligibleCandidates(facts.order, [fresh], signIn).candidates.length === 1
    ) {
      return fresh;
    }
  }
  return undefined;
}

/**
 * Locks `partner`'s row `FOR UPDATE`, **then** recounts its accepted plus open offers on the
 * delivery date: the snapshot with the fresh load (step 4; `manualReroute` uses the same lock).
 */
export async function lockAndRecount(
  executor: OrderExecutor,
  deliveryDate: string,
  partner: RoutingPartner,
): Promise<RoutingPartner> {
  await executor.execute(sql`
    SELECT id FROM fulfillment_partner WHERE id = ${partner.partnerId} FOR UPDATE`);
  const [counted] = await executor.execute(
    loadSql(partner.partnerId, deliveryDate),
  );
  return { ...partner, loadOnDate: LoadRow.parse(counted).load };
}

function excludedCounts(
  excluded: readonly { readonly rule: ExclusionRule }[],
): Readonly<Partial<Record<ExclusionRule, number>>> {
  const counts: Partial<Record<ExclusionRule, number>> = {};
  for (const { rule } of excluded) counts[rule] = (counts[rule] ?? 0) + 1;
  return counts;
}

/** The run's work inside its transaction. */
async function routeWithin(
  executor: OrderExecutor,
  orderId: string,
  deps: ResolvedRoutingDeps,
): Promise<RouteOutcome> {
  const now = deps.now();
  const facts = await lockRoutingFacts(executor, orderId);
  if (facts === undefined) return { kind: "skipped", reason: "not_found" };
  if (facts.mode === "demo") return { kind: "skipped", reason: "demo" };
  if (!ROUTABLE.has(facts.status)) {
    return { kind: "skipped", reason: "status" };
  }
  if (facts.live) return { kind: "skipped", reason: "offer_open" };
  if (facts.attempts >= ROUTING_WINDOWS.maxOffers) {
    return exhaust(executor, facts, "max_offers", deps);
  }
  if (facts.destination === null) {
    // A country with no agreed cutoff is not open for orders (spec 009 `unavailable`); refusing
    // here keeps the order waiting for the founder instead of guessing a deadline.
    return { kind: "skipped", reason: "no_operations" };
  }
  const window = offerWindow(now, facts.deliveryDate, facts.destination);
  if (window.kind === "deadline_passed") {
    return exhaust(executor, facts, "deadline", deps);
  }
  if (window.deferred) {
    await deps.schedule([
      { name: "order.route", orderId, startAfter: window.offerAt },
    ]);
    return { kind: "deferred", offerAt: window.offerAt };
  }

  const partners = await readRoutingPartners(executor, {
    countryId: facts.countryId,
    status: PARTNER_STATUS_FOR_MODE[facts.order.mode],
    deliveryDate: facts.deliveryDate,
    productIds: facts.order.lines.flatMap((line) =>
      line.kind === "product" ? [line.productId] : [],
    ),
    now,
  });
  const eligibility = eligibleCandidates(facts.order, partners, deps.signIn);
  const chosen = await lockFirstThatFits(
    executor,
    facts,
    partners,
    deps.signIn,
  );
  deps.log.info(
    {
      order_id: orderId,
      job: "order.route",
      attempt: facts.attempts + 1,
      partners: partners.length,
      candidates: eligibility.candidates.length,
      excluded: excludedCounts(eligibility.excluded),
      outcome: chosen === undefined ? "exhausted" : "offered",
    },
    "routing.evaluated",
  );
  if (chosen === undefined)
    return exhaust(executor, facts, "no_candidate", deps);

  return writeOffer(executor, {
    facts,
    partnerId: chosen.partnerId,
    window,
    actor: ORDER_ROUTE_ACTOR,
    firstOffer: facts.status === "paid_unrouted",
    schedule: deps.schedule,
  });
}

/** What `writeOffer` needs: the locked order, the florist, the window and who acts. */
export interface OfferInput {
  readonly facts: RoutingFacts;
  readonly partnerId: string;
  readonly window: { readonly offerAt: Date; readonly slaEndsAt: Date };
  /** `system:order.route`, or the founder's `admin:{uuid}` for a manual reroute. */
  readonly actor: string;
  /** Write `order.routed` first (the order is not `routed` yet). */
  readonly firstOffer: boolean;
  readonly schedule: RoutingScheduler;
}

/**
 * The offer steps (step 5), shared by `order.route` and `manualReroute`: `order.routed` through
 * `transition` on a first offer, one `order_assignment` (`attempt` + 1, `offered_at`,
 * `sla_expires_at`), `assignment.offered` through `appendEvent`, and the reminder and the timeout
 * enqueued for the assignment.
 */
export async function writeOffer(
  executor: OrderExecutor,
  input: OfferInput,
): Promise<Extract<RouteOutcome, { kind: "offered" }>> {
  const { facts, partnerId, window, actor } = input;
  const orderId = facts.orderId;
  if (input.firstOffer) {
    await transition(
      orderId,
      "order.routed",
      actor,
      { mode: facts.mode, partnerId },
      { executor },
    );
  }
  const assignmentId = randomUUID();
  const attempt = facts.attempts + 1;
  await executor.execute(sql`
    INSERT INTO order_assignment (id, order_id, partner_id, offered_at, sla_expires_at, attempt)
    VALUES (${assignmentId}, ${orderId}, ${partnerId},
            ${window.offerAt.toISOString()}::timestamptz,
            ${window.slaEndsAt.toISOString()}::timestamptz, ${attempt})`);
  const windowMs = window.slaEndsAt.getTime() - window.offerAt.getTime();
  await appendEvent(
    orderId,
    "assignment.offered",
    actor,
    {
      mode: facts.mode,
      assignmentId,
      partnerId,
      attempt,
      answerWindowMinutes: Math.max(1, Math.ceil(windowMs / MINUTE_MS)),
    },
    { executor },
  );
  await input.schedule([
    {
      name: "assignment.remind",
      assignmentId,
      startAfter: new Date(window.offerAt.getTime() + Math.floor(windowMs / 2)),
    },
    { name: "assignment.timeout", assignmentId, startAfter: window.slaEndsAt },
  ]);
  return {
    kind: "offered",
    assignmentId,
    partnerId,
    attempt,
    offeredAt: window.offerAt,
    slaExpiresAt: window.slaEndsAt,
  };
}

/**
 * **`order.route`** for one order (§5.2). Returns what it did; raises `routing.no_partner` once
 * an exhaustion has committed.
 */
export async function routeOrder(
  orderId: string,
  deps: RoutingDeps = {},
): Promise<RouteOutcome> {
  const resolved = resolveRoutingDeps(deps, "order.route");
  const outcome = await resolved.transaction((executor) =>
    routeWithin(executor, orderId, resolved),
  );
  if (outcome.kind === "exhausted") {
    resolved.log.warn(
      { order_id: orderId, job: "order.route", reason: outcome.reason },
      "routing.no_partner",
    );
    resolved.alert("routing.no_partner", {
      order_id: orderId,
      reason: outcome.reason,
    });
  } else if (outcome.kind === "skipped") {
    const fields = {
      order_id: orderId,
      job: "order.route",
      reason: outcome.reason,
    };
    if (outcome.reason === "no_operations") {
      resolved.log.warn(fields, "routing.skipped");
    } else {
      resolved.log.info(fields, "routing.skipped");
    }
  }
  return outcome;
}
