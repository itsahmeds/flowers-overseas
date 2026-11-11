/**
 * `assess(orderId, 'routing')` (spec 021 §5.2 "The risk gate", "Inputs", "Facts unavailable";
 * AC-7, AC-11, AC-14, AC-15; TASK-494). On the caller's transaction it gathers `RiskInputV1`
 * (no personal data), calls the pure `scoreOrder`, writes the order's `risk_identity` rows
 * (email, card, recipient address) and one `risk_assessment`, and returns the decision.
 *
 * Read in memory and never stored or logged: the buyer email, the card fingerprint, the
 * recipient's street, postcode and country (each only hashed under `RISK_HASH_KEY`), and the
 * card message and "sign as" (only `cardMessageMatches`' boolean leaves this function).
 *
 * Radar's facts come from spec 013's `riskFactsFor`, handed in by the job layer (this module
 * never imports payments). On a failure it waits `FACTS_RETRY_MS` and asks once more; a second
 * failure assesses without them and S16 holds the order, so a provider outage delays a florist
 * offer instead of failing the outbox delivery.
 *
 * Without a configured hash key no identity row is written and the velocity, blocklist and
 * first-order facts read as none (logged once as `risk.hash_key_missing`); Radar's facts, the
 * amount bands and the card message still score.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { upcomingOccasions } from "@/modules/geo";
import {
  BuyerSnapshotSchema,
  jsonb,
  type OrderExecutor,
  RecipientSnapshotSchema,
} from "@/modules/orders";
import {
  PEAK_OCCASION_KEYS,
  RISK_CURRENCIES,
  RISK_RULES_VERSION,
} from "@/config/risk";

import { isDisposableEmail } from "./disposable.ts";
import { emailHash, identityHash, normaliseAddress } from "./normalise.ts";
import {
  type RadarFacts,
  type RiskDecision,
  type RiskInputV1,
  RiskInputV1Schema,
  type RiskSignals,
  scoreOrder,
} from "./score.ts";
import { cardMessageMatches } from "./signals.ts";
import {
  type IdentityHashes,
  recordIdentities,
  velocityCounts,
} from "./velocity.ts";

/** One retry of `riskFactsFor`, this long after the first failure (§5.2). */
export const FACTS_RETRY_MS = 2_000;

/** What spec 013's `riskFactsFor` answers (§5.2 "Inputs"), as this module reads it. */
export interface RiskFactsInput {
  readonly riskLevel: "normal" | "elevated" | "highest" | null;
  readonly riskScore: number | null;
  readonly outcomeType: string | null;
  readonly threeDsResult: string | null;
  readonly liabilityShift: boolean | null;
  readonly cardCountry: string | null;
  readonly cardFingerprint: string | null;
  readonly wallet: string | null;
  readonly efwReceived: boolean;
}

/** `riskFactsFor` bound to a provider by the job layer; it may read on `executor`. */
export type RiskFactsSource = (
  orderId: string,
  executor: OrderExecutor,
) => Promise<RiskFactsInput>;

export interface AssessDeps {
  readonly now: Date;
  readonly hashKey: Uint8Array | null;
  readonly strict: boolean;
  readonly enforced: boolean;
  readonly riskFactsFor: RiskFactsSource;
  /** Waits before the retry (`setTimeout` by default; the suites pass an instant one). */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface Assessment {
  readonly id: string;
  readonly orderId: string;
  readonly mode: "test" | "live";
  readonly score: number;
  readonly decision: RiskDecision;
  readonly high: boolean;
  readonly signals: RiskSignals;
  readonly rulesVersion: number;
  readonly enforced: boolean;
  readonly liabilityShift: boolean | null;
  readonly hashes: IdentityHashes;
  /** The decisive signal that cancels, if any: D2 (EFW) blocklists with `source = 'efw'`. */
  readonly decisive: "D1" | "D2" | null;
}

const OrderRow = z.object({
  mode: z.enum(["test", "live"]),
  buyer_total_minor: z.number().int().nonnegative(),
  buyer_currency_code: z.string(),
  delivery_date: z.string(),
  buyer_snapshot: z.unknown(),
  recipient_snapshot: z.unknown(),
  destination_postcode: z.string().nullable(),
  destination_country: z.string(),
  same_day: z.boolean().nullable(),
});

const sleepFor = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** `riskFactsFor` with its one retry; `null` after two failures (S16). */
async function factsWithRetry(
  orderId: string,
  executor: OrderExecutor,
  deps: AssessDeps,
): Promise<RiskFactsInput | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await deps.riskFactsFor(orderId, executor);
    } catch (error) {
      logger.warn(
        {
          order_id: orderId,
          count: attempt,
          reason: error instanceof Error ? error.name : "unknown",
        },
        "risk.facts_unavailable",
      );
      if (attempt === 1) await (deps.sleep ?? sleepFor)(FACTS_RETRY_MS);
    }
  }
  return null;
}

function radarOf(facts: RiskFactsInput | null): RadarFacts | null {
  if (facts === null) return null;
  return {
    riskLevel: facts.riskLevel,
    outcomeType: facts.outcomeType,
    liabilityShift: facts.liabilityShift,
    cardCountry:
      facts.cardCountry !== null && /^[A-Z]{2}$/u.test(facts.cardCountry)
        ? facts.cardCountry
        : null,
    efwReceived: facts.efwReceived,
  };
}

/** Whether the delivery date is a peak occasion in the destination (§13 Q11). */
export function isPeakDay(countryIso2: string, deliveryDate: string): boolean {
  const peak: readonly string[] = PEAK_OCCASION_KEYS;
  return upcomingOccasions(
    countryIso2,
    deliveryDate as Parameters<typeof upcomingOccasions>[1],
    1,
  ).some(
    (occasion) =>
      occasion.date === deliveryDate && peak.includes(occasion.occasionKey),
  );
}

/**
 * An earlier order of the same mode with this email hash, delivered and never charged back. In
 * `live` this is §5.2's "no earlier `live` order"; a `test` order compares with `test` orders,
 * so staging's synthetic orders (AC-11) never mix with real ones.
 */
async function deliveredBefore(
  executor: OrderExecutor,
  orderId: string,
  email: string,
  mode: "test" | "live",
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM risk_identity i
      JOIN "order" o ON o.id = i.order_id
      WHERE i.kind = 'email' AND i.hash = ${email} AND o.id <> ${orderId}
        AND o.mode = ${mode}
        AND EXISTS (SELECT 1 FROM order_event d
                    WHERE d.order_id = o.id AND d.type = 'order.delivered')
        AND NOT EXISTS (SELECT 1 FROM order_event c
                        WHERE c.order_id = o.id AND c.type = 'order.chargeback_opened')
    ) AS found`);
  return row?.["found"] === true;
}

/** Whether the email or card hash is on the live blocklist; a match sets `last_matched_at`. */
async function blocklistMatch(
  executor: OrderExecutor,
  hashes: IdentityHashes,
  now: Date,
): Promise<boolean> {
  const at = now.toISOString();
  const rows = await executor.execute(sql`
    UPDATE risk_blocklist SET last_matched_at = ${at}::timestamptz
    WHERE expires_at > ${at}::timestamptz
      AND ((kind = 'email' AND hash = ${hashes.email ?? ""})
        OR (kind = 'card' AND hash = ${hashes.card ?? ""}))
    RETURNING kind`);
  return rows.length > 0;
}

async function declinedAttempts(
  executor: OrderExecutor,
  orderId: string,
): Promise<number> {
  const [row] = await executor.execute(sql`
    SELECT count(DISTINCT (payload ->> 'payment_id', payload ->> 'attempt'))::int AS n
    FROM order_event
    WHERE order_id = ${orderId} AND type = 'order.payment_attempt_failed'`);
  return z
    .number()
    .int()
    .nonnegative()
    .parse(row?.["n"] ?? 0);
}

/**
 * Assesses one paid order at the routing stage (the file header). Returns `null` for an order
 * that is not `test` or `live` (a demo order is never assessed).
 */
export async function assess(
  executor: OrderExecutor,
  orderId: string,
  deps: AssessDeps,
): Promise<Assessment | null> {
  const now = deps.now;
  const [raw] = await executor.execute(sql`
    SELECT o.mode, o.buyer_total_minor::int AS buyer_total_minor, o.buyer_currency_code, o.delivery_date::text AS delivery_date,
           o.buyer_snapshot, o.recipient_snapshot, o.destination_postcode,
           c.iso2 AS destination_country,
           (o.delivery_date = (${now.toISOString()}::timestamptz
              AT TIME ZONE coalesce(ci.iana_zone, c.iana_zone))::date) AS same_day
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}`);
  const parsed = OrderRow.safeParse(raw);
  if (!parsed.success) return null;
  const order = parsed.data;
  const buyer = BuyerSnapshotSchema.safeParse(order.buyer_snapshot);
  const recipient = RecipientSnapshotSchema.safeParse(order.recipient_snapshot);
  const facts = await factsWithRetry(orderId, executor, deps);

  const key = deps.hashKey;
  if (key === null) {
    logger.warn({ order_id: orderId, reason: "env" }, "risk.hash_key_missing");
  }
  const email = buyer.success ? buyer.data.email : null;
  const hashes: IdentityHashes = {
    email: key === null || email === null ? null : emailHash(email, key),
    card:
      key === null || facts?.cardFingerprint == null
        ? null
        : identityHash("card", facts.cardFingerprint, key),
    recipient_address:
      key === null || !recipient.success
        ? null
        : identityHash(
            "recipient_address",
            normaliseAddress({
              countryIso2: order.destination_country,
              postcode:
                order.destination_postcode ?? recipient.data.postcode ?? null,
              line1: recipient.data.addressLines[0] ?? "",
            }),
            key,
          ),
  };
  await recordIdentities(executor, orderId, hashes, now);

  const currency = z.enum(RISK_CURRENCIES).safeParse(order.buyer_currency_code);
  const input: RiskInputV1 = RiskInputV1Schema.parse({
    version: 1,
    mode: order.mode,
    totalMinor: order.buyer_total_minor,
    // A currency outside the bands' table cannot be charged (spec 013's `toStripeAmount`).
    currency: currency.success ? currency.data : "EUR",
    destinationCountry: order.destination_country,
    buyerCountryDeclared: buyer.success ? buyer.data.countryIso2 : null,
    sameDay: order.same_day === true,
    firstOrder:
      hashes.email === null
        ? true
        : !(await deliveredBefore(executor, orderId, hashes.email, order.mode)),
    peakDay: isPeakDay(order.destination_country, order.delivery_date),
    cardMessageMatch: recipient.success
      ? cardMessageMatches(recipient.data.cardMessage, recipient.data.signAs)
      : false,
    disposableEmail: email === null ? false : isDisposableEmail(email),
    blocklistMatch:
      hashes.email === null && hashes.card === null
        ? false
        : await blocklistMatch(executor, hashes, now),
    declinedAttempts: await declinedAttempts(executor, orderId),
    radar: radarOf(facts),
    velocity: await velocityCounts(executor, hashes, now),
    strict: deps.strict,
  });
  const scored = scoreOrder(input);
  const [inserted] = await executor.execute(sql`
    INSERT INTO risk_assessment (order_id, stage, mode, rules_version, score, decision, enforced,
                                 signals, liability_shift, radar_risk_level, radar_risk_score,
                                 radar_outcome, created_at)
    VALUES (${orderId}, 'routing', ${order.mode}, ${RISK_RULES_VERSION}, ${scored.score},
            ${scored.decision}, ${deps.enforced}, ${jsonb(scored.signals)},
            ${facts?.liabilityShift ?? null}, ${facts?.riskLevel ?? null},
            ${facts?.riskScore ?? null}, ${outcomeCode(facts?.outcomeType ?? null)},
            ${now.toISOString()}::timestamptz)
    RETURNING id`);
  const id = z.uuid().parse(inserted?.["id"]);
  const fired = new Set(scored.signals.map((signal) => signal.id));
  const assessment: Assessment = {
    id,
    orderId,
    mode: order.mode,
    score: scored.score,
    decision: scored.decision,
    high: scored.high,
    signals: scored.signals,
    rulesVersion: RISK_RULES_VERSION,
    enforced: deps.enforced,
    liabilityShift: facts?.liabilityShift ?? null,
    hashes,
    decisive: fired.has("D2") ? "D2" : fired.has("D1") ? "D1" : null,
  };
  logger.info(
    {
      order_id: orderId,
      assessment_id: id,
      mode: order.mode,
      stage: "routing",
      decision: scored.decision,
      enforced: deps.enforced,
      score: scored.score,
      signals: scored.signals.map((signal) => signal.id),
      rules_version: RISK_RULES_VERSION,
      radar_risk_level: facts?.riskLevel ?? null,
      liability_shift: facts?.liabilityShift ?? null,
    },
    "risk.assessed",
  );
  return assessment;
}

/** Radar's outcome type as the column's code shape, else `null`. */
function outcomeCode(outcome: string | null): string | null {
  return outcome !== null && /^[a-z_]{1,32}$/u.test(outcome) ? outcome : null;
}
