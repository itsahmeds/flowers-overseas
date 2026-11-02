/**
 * Who may be offered an order, and in what order (spec 016 §5.2 "Routing functions":
 * `eligibleCandidates`, `rankCandidates`, `ownerOfOrder`, `canServe`; §14 A-founder-2026-10-23;
 * `plan/06` §5.2 rule 2; AC-2, AC-3, AC-27, AC-50, AC-51; TASK-327).
 *
 * Pure: the caller reads the order and one snapshot per partner (in the `system` context, on a
 * `no-store` path) and passes them in; nothing here reads a clock, a database or an environment.
 * The snapshots are zod schemas, so the reader that builds them (spec 016 task 1b's `order.route`,
 * and the coverage check spec 010 §14 A3.2 registers) parses once at that boundary.
 *
 * Countries are data: no rule here names a country, a zone or a currency.
 */
import { z } from "zod";

import { ROUTING_RANKING } from "@/config/routing";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** `fulfillment_partner.status` (migration `0005`). */
export const PARTNER_STATUSES = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;
export const PartnerStatusSchema = z.enum(PARTNER_STATUSES);
export type PartnerStatus = z.infer<typeof PartnerStatusSchema>;

/**
 * The modes this router serves. `demo` orders are spec 010's `demoRoute`'s and never reach it
 * (§2), so the schema refuses them.
 */
export const RoutedModeSchema = z.enum(["live", "test"]);
export type RoutedMode = z.infer<typeof RoutedModeSchema>;

/**
 * Mode pairing (§5.2; spec 010's `ASSIGNMENT_MODE_MISMATCH` trigger enforces the same pair): a
 * `live` order goes to an `active` florist, a `test` order to a `demo` florist.
 */
export const PARTNER_STATUS_FOR_MODE = Object.freeze({
  live: "active",
  test: "demo",
} as const satisfies Record<RoutedMode, PartnerStatus>);

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const IdSchema = z.string().min(1);

/** One `order_line`, as routing reads it. Add-on lines are carried but never checked. */
export const RoutingLineSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("product"),
      productId: IdSchema,
      tierKey: z.string().min(1).nullable(),
      qty: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("addon"),
      addonId: IdSchema,
      qty: z.number().int().positive(),
    })
    .strict(),
]);
export type RoutingLine = z.infer<typeof RoutingLineSchema>;

/** The order, as routing reads it. */
export const RoutingOrderSchema = z
  .object({
    mode: RoutedModeSchema,
    /** The `postcode_zone` the destination postcode falls in (longest prefix), if any. */
    postcodeZoneId: IdSchema.nullable(),
    /** The destination city, if known (spec 010 §13 Q13: may be null at checkout step 1). */
    cityId: IdSchema.nullable(),
    deliveryDate: IsoDateSchema,
    lines: z.array(RoutingLineSchema).min(1),
    /** Partners already offered this order (any response, or none yet). */
    offeredPartnerIds: z.array(IdSchema),
  })
  .strict();
export type RoutingOrder = z.infer<typeof RoutingOrderSchema>;

/** One `partner_coverage` row. A row names a city, a postcode zone, or both. */
export const CoverageRowSchema = z
  .object({
    cityId: IdSchema.nullable(),
    postcodeZoneId: IdSchema.nullable(),
    /** Per-area override; null means the partner's own `capacity_per_day`. */
    capacityPerDay: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((row) => row.cityId !== null || row.postcodeZoneId !== null, {
    message: "a coverage row names a city, a postcode zone, or both",
  });
export type CoverageRow = z.infer<typeof CoverageRowSchema>;

/** One `partner_catalog_mapping` row. A null `tierKey` covers every tier of the product. */
export const CatalogRowSchema = z
  .object({
    productId: IdSchema,
    tierKey: z.string().min(1).nullable(),
    canFulfil: z.boolean(),
    /** `partner_payout_minor`, per unit, in the partner's payout currency. */
    payoutMinor: z.number().int().nonnegative().safe(),
  })
  .strict();
export type CatalogRow = z.infer<typeof CatalogRowSchema>;

/** One florist, as routing reads it for one order's delivery date. */
export const RoutingPartnerSchema = z
  .object({
    partnerId: IdSchema,
    status: PartnerStatusSchema,
    capacityPerDay: z.number().int().positive(),
    coverage: z.array(CoverageRowSchema),
    catalog: z.array(CatalogRowSchema),
    payoutCurrency: z.string().regex(/^[A-Z]{3}$/u),
    blackoutDates: z.array(IsoDateSchema),
    /** Accepted plus open offers on the order's delivery date (counted after the lock, §5.2). */
    loadOnDate: z.number().int().nonnegative(),
    /** `partner_member` rows: someone who could receive the sign-in link. */
    memberCount: z.number().int().nonnegative(),
    /** `rating_90d_bp`, mean × 2000 (4.50 = 9000); null when unrated. */
    ratingBp: z.number().int().min(0).max(10_000).nullable(),
    /** `acceptance_rate_bp`; null when never computed. */
    acceptanceRateBp: z.number().int().min(0).max(10_000).nullable(),
    /** Offers made to this partner in the last 90 days. */
    offers90d: z.number().int().nonnegative(),
    /** The partner's latest offer of any order (round-robin); null when never offered. */
    lastOfferedAt: z.date().nullable(),
  })
  .strict();
export type RoutingPartner = z.infer<typeof RoutingPartnerSchema>;

/**
 * What decides sign-in reachability: the partner statuses spec 011's `signInPolicy(environment)`
 * allows. Passed in, because the policy is the florist sign-in instance's and depends on the
 * environment; routing never reads either.
 */
export interface EligibilityContext {
  readonly signInStatuses: readonly PartnerStatus[];
}

/* -------------------------------------------------------------------------- */
/* eligibleCandidates                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The hard filters, in the order they are checked; a partner is reported under the first it
 * fails. The names are the `filtered:{rule}` values of the `routing.evaluated` log (§11, §14
 * A-founder-2026-10-23), with `already_offered` its own outcome.
 */
export const EXCLUSION_RULES = [
  "mode",
  "coverage",
  "catalogue",
  "blackout",
  "capacity",
  "already_offered",
  "sign_in",
] as const;
export type ExclusionRule = (typeof EXCLUSION_RULES)[number];

/** A partner who passed every filter, with what ranking needs. */
export interface Candidate {
  readonly partnerId: string;
  readonly ratingBp: number | null;
  readonly acceptanceRateBp: number | null;
  readonly offers90d: number;
  /** What this partner is paid for this order: Σ payout per unit × qty over product lines. */
  readonly payout: { readonly minor: number; readonly currency: string };
  readonly lastOfferedAt: Date | null;
}

export interface Eligibility {
  readonly candidates: readonly Candidate[];
  readonly excluded: readonly {
    readonly partnerId: string;
    readonly rule: ExclusionRule;
  }[];
}

/**
 * The coverage row that serves the order: a row naming a postcode zone matches that zone only; a
 * row naming a city alone matches the whole city. When several match, the zone row wins (it is the
 * more specific, and its capacity override is the one meant for this area).
 */
function matchingCoverage(
  order: Pick<RoutingOrder, "postcodeZoneId" | "cityId">,
  partner: RoutingPartner,
): CoverageRow | undefined {
  const byZone = partner.coverage.find(
    (row) =>
      row.postcodeZoneId !== null &&
      order.postcodeZoneId !== null &&
      row.postcodeZoneId === order.postcodeZoneId,
  );
  if (byZone !== undefined) return byZone;
  return partner.coverage.find(
    (row) =>
      row.postcodeZoneId === null &&
      row.cityId !== null &&
      order.cityId !== null &&
      row.cityId === order.cityId,
  );
}

/** The mapping that answers for one product line: the exact tier first, else the any-tier row. */
function mappingFor(
  partner: RoutingPartner,
  line: Extract<RoutingLine, { kind: "product" }>,
): CatalogRow | undefined {
  const forProduct = partner.catalog.filter(
    (row) => row.productId === line.productId,
  );
  return (
    forProduct.find(
      (row) => row.tierKey !== null && row.tierKey === line.tierKey,
    ) ?? forProduct.find((row) => row.tierKey === null)
  );
}

function productLines(
  lines: readonly RoutingLine[],
): Extract<RoutingLine, { kind: "product" }>[] {
  return lines.filter(
    (line): line is Extract<RoutingLine, { kind: "product" }> =>
      line.kind === "product",
  );
}

type Verdict =
  | { readonly ok: true; readonly payoutMinor: number }
  | { readonly ok: false; readonly rule: ExclusionRule };

function verdict(
  order: Omit<RoutingOrder, "offeredPartnerIds"> & {
    readonly offeredPartnerIds: readonly string[];
  },
  partner: RoutingPartner,
  context: EligibilityContext,
): Verdict {
  if (partner.status !== PARTNER_STATUS_FOR_MODE[order.mode]) {
    return { ok: false, rule: "mode" };
  }
  const coverage = matchingCoverage(order, partner);
  if (coverage === undefined) return { ok: false, rule: "coverage" };
  let payoutMinor = 0;
  for (const line of productLines(order.lines)) {
    const mapping = mappingFor(partner, line);
    if (mapping?.canFulfil !== true) return { ok: false, rule: "catalogue" };
    payoutMinor += mapping.payoutMinor * line.qty;
  }
  if (partner.blackoutDates.includes(order.deliveryDate)) {
    return { ok: false, rule: "blackout" };
  }
  const capacity = Math.min(
    partner.capacityPerDay,
    coverage.capacityPerDay ?? partner.capacityPerDay,
  );
  if (partner.loadOnDate >= capacity) return { ok: false, rule: "capacity" };
  if (order.offeredPartnerIds.includes(partner.partnerId)) {
    return { ok: false, rule: "already_offered" };
  }
  if (
    partner.memberCount < 1 ||
    !context.signInStatuses.includes(partner.status)
  ) {
    return { ok: false, rule: "sign_in" };
  }
  return { ok: true, payoutMinor };
}

/**
 * **`eligibleCandidates(order, partners, context)`** — every partner that passes every hard
 * filter of §5.2, in input order, and every other partner with the first filter it failed:
 *
 *  1. `mode` — status pairs with the order's mode (`live` → `active`, `test` → `demo`);
 *  2. `coverage` — a coverage row matches the order's postcode zone or city;
 *  3. `catalogue` — `can_fulfil` for every product line and its tier;
 *  4. `blackout` — no blackout on the delivery date;
 *  5. `capacity` — accepted plus open offers on that date below
 *     `min(fulfillment_partner.capacity_per_day, partner_coverage.capacity_per_day)`;
 *  6. `already_offered` — not offered this order before;
 *  7. `sign_in` — at least one member, and `signInPolicy` allows the partner's status.
 */
export function eligibleCandidates(
  order: RoutingOrder,
  partners: readonly RoutingPartner[],
  context: EligibilityContext,
): Eligibility {
  const candidates: Candidate[] = [];
  const excluded: { partnerId: string; rule: ExclusionRule }[] = [];
  for (const partner of partners) {
    const result = verdict(order, partner, context);
    if (result.ok) {
      candidates.push({
        partnerId: partner.partnerId,
        ratingBp: partner.ratingBp,
        acceptanceRateBp: partner.acceptanceRateBp,
        offers90d: partner.offers90d,
        payout: { minor: result.payoutMinor, currency: partner.payoutCurrency },
        lastOfferedAt: partner.lastOfferedAt,
      });
    } else {
      excluded.push({ partnerId: partner.partnerId, rule: result.rule });
    }
  }
  return { candidates, excluded };
}

/* -------------------------------------------------------------------------- */
/* rankCandidates                                                             */
/* -------------------------------------------------------------------------- */

/** A null rating ranks as 4.50 (§13 16-1). */
export function effectiveRatingBp(
  candidate: Pick<Candidate, "ratingBp">,
): number {
  return candidate.ratingBp ?? ROUTING_RANKING.defaultRatingBp;
}

/** Fewer than 5 offers in 90 days, or no rate yet, ranks as 100 % (§13 16-1). */
export function effectiveAcceptanceBp(
  candidate: Pick<Candidate, "acceptanceRateBp" | "offers90d">,
): number {
  if (
    candidate.offers90d < ROUTING_RANKING.minOffersForAcceptanceRate ||
    candidate.acceptanceRateBp === null
  ) {
    return ROUTING_RANKING.defaultAcceptanceRateBp;
  }
  return candidate.acceptanceRateBp;
}

function compareAscending(a: number | string, b: number | string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * `rankCandidates`'s key over `candidates` alone (§5.2; `plan/06` §5.2 rule 2):
 *
 *  1. inside the best-rating band (rating at least 95 % of the best of them) before outside it;
 *  2. rating descending **outside the band only**: inside it the ratings count as equal, which is
 *     what the band is for (`plan/06` rule 2c: payout decides "only within 5 % of the best
 *     rating"; AC-3 and T-50 observe the band, which a plain rating sort would make vacuous);
 *  3. acceptance rate descending;
 *  4. payout for this order ascending (compared within one payout currency: a mixed set orders
 *     by currency code first, so the order stays total and deterministic);
 *  5. last offer ascending, never offered first (round-robin);
 *  6. partner id ascending.
 */
function rankByKey(candidates: readonly Candidate[]): Candidate[] {
  if (candidates.length === 0) return [];
  const best = Math.max(...candidates.map(effectiveRatingBp));
  const inBand = (candidate: Candidate): boolean =>
    effectiveRatingBp(candidate) * 100 >=
    best * ROUTING_RANKING.ratingBandPercent;
  return [...candidates].sort(
    (a, b) =>
      Number(inBand(b)) - Number(inBand(a)) ||
      (inBand(a) ? 0 : effectiveRatingBp(b) - effectiveRatingBp(a)) ||
      effectiveAcceptanceBp(b) - effectiveAcceptanceBp(a) ||
      compareAscending(a.payout.currency, b.payout.currency) ||
      a.payout.minor - b.payout.minor ||
      (a.lastOfferedAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (b.lastOfferedAt?.getTime() ?? Number.NEGATIVE_INFINITY) ||
      compareAscending(a.partnerId, b.partnerId),
  );
}

/**
 * **`rankCandidates(candidates, ownerPartnerId)`** — deterministic. When `ownerPartnerId` names a
 * candidate (the order's own florist, `ownerOfOrder`; §14 A-founder-2026-10-23), it is first and
 * the others follow by the key computed over them alone, so the owner's rating never moves the
 * band. With `null`, or an owner not among the candidates, the output is the key alone.
 */
export function rankCandidates(
  candidates: readonly Candidate[],
  ownerPartnerId: string | null,
): Candidate[] {
  const owner =
    ownerPartnerId === null
      ? undefined
      : candidates.find((candidate) => candidate.partnerId === ownerPartnerId);
  if (owner === undefined) return rankByKey(candidates);
  return [
    owner,
    ...rankByKey(candidates.filter((candidate) => candidate !== owner)),
  ];
}

/* -------------------------------------------------------------------------- */
/* ownerOfOrder                                                               */
/* -------------------------------------------------------------------------- */

/**
 * **`ownerOfOrder(lines, origins)`** — the florist named by `product_origin` for every product line
 * when they all name the same one, else `null` (no product line, a line with no origin, or two
 * owners). Add-on lines are ignored (§14 A-founder-2026-10-23 item 1). `origins` is
 * `catalog.productOwners`'s answer: product id → partner id.
 */
export function ownerOfOrder(
  lines: readonly RoutingLine[],
  origins: ReadonlyMap<string, string>,
): string | null {
  const products = productLines(lines);
  if (products.length === 0) return null;
  let owner: string | undefined;
  for (const line of products) {
    const origin = origins.get(line.productId);
    if (origin === undefined) return null;
    if (owner !== undefined && origin !== owner) return null;
    owner = origin;
  }
  return owner ?? null;
}

/* -------------------------------------------------------------------------- */
/* canServe                                                                   */
/* -------------------------------------------------------------------------- */

/** `canServe`'s input: spec 010 §14 A3.2's contract. */
export const CanServeInputSchema = z
  .object({
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
    postcode: z.string().trim().min(1),
    cityId: IdSchema.nullable(),
    deliveryDate: IsoDateSchema,
    lines: z.array(RoutingLineSchema).min(1),
    mode: RoutedModeSchema,
  })
  .strict();
export type CanServeInput = z.infer<typeof CanServeInputSchema>;

export type CanServeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no_coverage" | "no_capacity" };

/**
 * The coverage verdict over loaded snapshots — `eligibleCandidates`'s rules minus "already
 * offered" (§5.2): `ok` when a partner passes every rule; `no_capacity` when none does but at
 * least one fails on capacity alone (every covering, able partner is full that date); otherwise
 * `no_coverage`.
 */
export function servability(
  order: Omit<RoutingOrder, "offeredPartnerIds">,
  partners: readonly RoutingPartner[],
  context: EligibilityContext,
): CanServeResult {
  let fullOnly = false;
  for (const partner of partners) {
    const result = verdict(
      { ...order, offeredPartnerIds: [] },
      partner,
      context,
    );
    if (result.ok) return { ok: true };
    if (result.rule === "capacity") {
      const ignoringCapacity = verdict(
        { ...order, offeredPartnerIds: [] },
        { ...partner, loadOnDate: 0 },
        context,
      );
      if (ignoringCapacity.ok) fullOnly = true;
    }
  }
  return { ok: false, reason: fullOnly ? "no_capacity" : "no_coverage" };
}

/**
 * What `canServe` needs from storage: the order-shaped view of the destination (the postcode's
 * zone by longest prefix, in the country) and the partner snapshots for that date, read in the
 * `system` context on a `no-store` path. Built by the routing jobs' reader (spec 016 task 1b).
 */
export interface CoverageReader {
  postcodeZoneId(countryIso2: string, postcode: string): Promise<string | null>;
  partnersFor(input: {
    readonly countryIso2: string;
    readonly mode: RoutedMode;
    readonly deliveryDate: string;
  }): Promise<readonly RoutingPartner[]>;
}

/**
 * **`canServe`**, bound to a reader and the sign-in policy: the function spec 010's checkout calls
 * through `registerCoverageCheck` (§14 A3.2) at step 1 and at placement. Its input is parsed here
 * (zod at the boundary); a malformed input or a reader failure throws, and spec 010 treats a
 * throw as a refusal, never as `ok`. A null `cityId` matches by postcode zone alone (spec 010
 * §13 Q13).
 */
export function createCanServe(
  reader: CoverageReader,
  context: EligibilityContext,
): (input: CanServeInput) => Promise<CanServeResult> {
  return async (raw) => {
    const input = CanServeInputSchema.parse(raw);
    const [postcodeZoneId, partners] = await Promise.all([
      reader.postcodeZoneId(input.countryIso2, input.postcode),
      reader.partnersFor({
        countryIso2: input.countryIso2,
        mode: input.mode,
        deliveryDate: input.deliveryDate,
      }),
    ]);
    return servability(
      {
        mode: input.mode,
        postcodeZoneId,
        cityId: input.cityId,
        deliveryDate: input.deliveryDate,
        lines: input.lines,
      },
      partners.map((partner) => RoutingPartnerSchema.parse(partner)),
      context,
    );
  };
}
