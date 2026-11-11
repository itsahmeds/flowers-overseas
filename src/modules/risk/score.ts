/**
 * `scoreOrder`, the pure scoring function (spec 021 §5.2 "Signals", "Decision bands"; AC-8 to
 * AC-10, AC-12; TASK-493). Its input `RiskInputV1` holds no personal data: amounts, booleans,
 * counts, country codes and Radar's own facts. Its output names each fired signal with its points
 * (0 for an "always hold" or decisive signal) and never a value (`RiskSignalsV1`).
 *
 * Bands: a decisive signal (D1, D2) cancels; otherwise an "always hold" signal or a score of
 * `HOLD_SCORE` or more holds; otherwise the order passes. Under `risk.strict` the hold score is
 * `STRICT_HOLD_SCORE` and every first order at or above `STRICT_BAND` holds. A score of
 * `HIGH_SCORE` or more is high. Points add up and are capped at `SCORE_CAP`.
 *
 * Never a signal (§5.2): card country different from the destination, declared country
 * different from the destination, billing different from delivery, delivery abroad. S13 is a
 * modifier only and never applies to an EEA-issued card with liability shift (AC-9).
 */
import { z } from "zod";

import {
  EEA_COUNTRIES,
  FIRST_ORDER_BAND,
  HIGH_SCORE,
  HOLD_SCORE,
  PEAK_DAY_EXTRA,
  REVIEW_BAND,
  RISK_CURRENCIES,
  RISK_SIGNAL_IDS,
  RISK_SIGNALS,
  type RiskSignalId,
  S12_DECLINES,
  SCORE_CAP,
  STRICT_BAND,
  STRICT_HOLD_SCORE,
  VELOCITY,
} from "@/config/risk";

const Iso2 = z.string().regex(/^[A-Z]{2}$/u);
const Count = z.number().int().nonnegative();

/** Radar's facts for the order's payment (spec 013's `riskFactsFor`), as the score reads them. */
export const RadarFactsSchema = z
  .object({
    riskLevel: z.enum(["normal", "elevated", "highest"]).nullable(),
    outcomeType: z.string().max(64).nullable(),
    liabilityShift: z.boolean().nullable(),
    cardCountry: Iso2.nullable(),
    efwReceived: z.boolean(),
  })
  .strict();
export type RadarFacts = z.infer<typeof RadarFactsSchema>;

/** The scoring input, version 1 (no personal data). */
export const RiskInputV1Schema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["test", "live"]),
    totalMinor: z.number().int().nonnegative(),
    currency: z.enum(RISK_CURRENCIES),
    destinationCountry: Iso2,
    buyerCountryDeclared: Iso2.nullable(),
    sameDay: z.boolean(),
    firstOrder: z.boolean(),
    peakDay: z.boolean(),
    cardMessageMatch: z.boolean(),
    disposableEmail: z.boolean(),
    blocklistMatch: z.boolean(),
    declinedAttempts: Count,
    /** `null` when `riskFactsFor` failed twice (S16). */
    radar: RadarFactsSchema.nullable(),
    velocity: z
      .object({
        paidOrdersByEmail24h: Count,
        recipientAddressesByEmail7d: Count,
        cardsByEmail7d: Count,
        emailsByCard7d: Count,
        buyersByRecipientAddress7d: Count,
      })
      .strict(),
    strict: z.boolean(),
  })
  .strict();
export type RiskInputV1 = z.infer<typeof RiskInputV1Schema>;

/** One fired signal: its id and its points, never a value. */
export const RiskSignalSchema = z
  .object({
    id: z.enum(RISK_SIGNAL_IDS),
    points: z.number().int().min(0).max(SCORE_CAP),
  })
  .strict();
/** `risk_assessment.signals`. */
export const RiskSignalsV1Schema = z.array(RiskSignalSchema);
export type RiskSignals = z.infer<typeof RiskSignalsV1Schema>;

export type RiskDecision = "pass" | "hold" | "cancel";

export interface RiskScore {
  readonly score: number;
  readonly decision: RiskDecision;
  readonly high: boolean;
  readonly signals: RiskSignals;
}

const EEA: ReadonlySet<string> = new Set(EEA_COUNTRIES);

/** The signals `input` fires, before S13's modifier rule. */
function firedSignals(input: RiskInputV1): RiskSignalId[] {
  const fired: RiskSignalId[] = [];
  const { radar, velocity } = input;
  const peak = input.peakDay ? PEAK_DAY_EXTRA : 0;
  if (radar?.riskLevel === "elevated") fired.push("S1");
  if (radar?.riskLevel === "highest") fired.push("S1h");
  if (radar?.outcomeType === "manual_review") fired.push("S2");
  if (radar !== null && radar.liabilityShift !== true) fired.push("S3");
  if (
    input.firstOrder &&
    input.totalMinor >= FIRST_ORDER_BAND[input.currency]
  ) {
    fired.push("S4");
  }
  if (input.totalMinor >= REVIEW_BAND[input.currency]) fired.push("S5");
  if (input.sameDay && input.firstOrder) fired.push("S6");
  if (velocity.paidOrdersByEmail24h >= VELOCITY.S7.count + peak)
    fired.push("S7");
  if (velocity.recipientAddressesByEmail7d >= VELOCITY.S8.count + peak) {
    fired.push("S8");
  }
  if (velocity.cardsByEmail7d >= VELOCITY.S9.count) fired.push("S9");
  if (velocity.emailsByCard7d >= VELOCITY.S10.count) fired.push("S10");
  if (velocity.buyersByRecipientAddress7d >= VELOCITY.S11.count + peak) {
    fired.push("S11");
  }
  if (input.declinedAttempts >= S12_DECLINES) fired.push("S12");
  if (input.disposableEmail) fired.push("S14");
  if (input.cardMessageMatch) fired.push("S15");
  if (radar === null) fired.push("S16");
  if (input.blocklistMatch) fired.push("D1");
  if (radar?.efwReceived === true) fired.push("D2");
  return fired;
}

/** S13's own condition: a card country outside both the declared country and the destination. */
function cardCountryElsewhere(input: RiskInputV1): boolean {
  const card = input.radar?.cardCountry ?? null;
  if (card === null) return false;
  if (card === input.destinationCountry) return false;
  if (
    input.buyerCountryDeclared !== null &&
    card === input.buyerCountryDeclared
  ) {
    return false;
  }
  // Never for an EEA-issued card with liability shift (Geo-blocking Regulation Art. 5(1)).
  return !(EEA.has(card) && input.radar?.liabilityShift === true);
}

function pointsOf(id: RiskSignalId): number {
  const effect = RISK_SIGNALS[id];
  return effect.kind === "points" ? effect.points : 0;
}

/** Scores `input` (the file header). Pure. */
export function scoreOrder(input: RiskInputV1): RiskScore {
  const fired = firedSignals(input);
  // S13 is a modifier: it counts only when another signal with points fired.
  if (cardCountryElsewhere(input) && fired.some((id) => pointsOf(id) > 0)) {
    fired.push("S13");
  }
  const signals = fired.map((id) => ({ id, points: pointsOf(id) }));
  const score = Math.min(
    SCORE_CAP,
    signals.reduce((sum, signal) => sum + signal.points, 0),
  );
  const decisive = fired.some((id) => RISK_SIGNALS[id].kind === "cancel");
  const alwaysHold = fired.some((id) => RISK_SIGNALS[id].kind === "hold");
  const holdAt = input.strict ? STRICT_HOLD_SCORE : HOLD_SCORE;
  const strictFirst =
    input.strict &&
    input.firstOrder &&
    input.totalMinor >= STRICT_BAND[input.currency];
  const decision: RiskDecision = decisive
    ? "cancel"
    : alwaysHold || score >= holdAt || strictFirst
      ? "hold"
      : "pass";
  return { score, decision, high: score >= HIGH_SCORE, signals };
}

/** The band decision for a bare score (no signal), for the boundary tests and the queue. */
export function bandFor(score: number, strict: boolean): "pass" | "hold" {
  return score >= (strict ? STRICT_HOLD_SCORE : HOLD_SCORE) ? "hold" : "pass";
}

/** Whether a score is high (deadline default and recommendation). */
export function isHighScore(score: number): boolean {
  return score >= HIGH_SCORE;
}
