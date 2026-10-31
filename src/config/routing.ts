/**
 * The routing rules' numbers (spec 016 §5.2 "Routing functions", §13 16-1 and 16-2; `plan/06`
 * §5.2 rules 2c and 3; TASK-327).
 *
 * Every wall-clock time here is read in the **destination's** IANA zone (spec 009's zone helpers),
 * never the server's; every duration is added to an absolute instant. The functions that use them
 * are `src/modules/orders/routing/` (`offerWindow`, `graceEnd`, `rankCandidates`); changing a
 * number here changes routing for every country at once, which is why none of them is per country:
 * a country's own input is its `sameDayCutoffLocal` and `ianaZone` (`CountryOperations`), as data.
 *
 * No database is read here and none may be (`pnpm check:no-db`).
 */

/** `HH:mm`, the shape `CountryOperations.sameDayCutoffLocal` is authored in. */
type LocalTime = string;

export interface RoutingWindowRules {
  /** From this local time until `offersFromLocal` no florist is woken: the offer waits. */
  readonly nightStartsLocal: LocalTime;
  /** The night's waiting offers go out at this local time. */
  readonly offersFromLocal: LocalTime;
  /** Daytime starts: from here to `nightStartsLocal` an offer runs for its minutes of SLA. */
  readonly dayStartsLocal: LocalTime;
  /** A same-day offer made at night or before `dayStartsLocal` must be answered by this time. */
  readonly earlySlaEndSameDayLocal: LocalTime;
  /** Any other offer made at night or before `dayStartsLocal` must be answered by this time. */
  readonly earlySlaEndLocal: LocalTime;
  /** A daytime offer for delivery the same day: minutes to answer. */
  readonly sameDaySlaMinutes: number;
  /** A daytime offer for a later day: minutes to answer. */
  readonly slaMinutes: number;
  /** The routing deadline is the delivery date's same-day cutoff plus this many minutes (16-2). */
  readonly deadlineAfterCutoffMinutes: number;
  /** At most this many offers per order before it is exhausted (`plan/06` §5.2 rule 3). */
  readonly maxOffers: number;
}

export interface GraceRules {
  /** An exhausted order due today is cancelled this many minutes after exhaustion (16-2). */
  readonly dueTodayMinutes: number;
  /** An order not due today waits until the first of this local time ... */
  readonly morningLocal: LocalTime;
  /** ... that is at least this many minutes after exhaustion. */
  readonly minimumMinutes: number;
}

export interface RankingRules {
  /** A candidate is in the best-rating band at this percentage of the best rating or above. */
  readonly ratingBandPercent: number;
  /** A null `rating_90d_bp` ranks as this (4.50 of 5, encoded mean × 2000; §13 16-1). */
  readonly defaultRatingBp: number;
  /** Below this many offers in 90 days the acceptance rate is not yet meaningful ... */
  readonly minOffersForAcceptanceRate: number;
  /** ... and ranks as this (100 %; §13 16-1). */
  readonly defaultAcceptanceRateBp: number;
}

/** The offer and SLA windows (`plan/06` §5.2 rule 3; spec 016 §5.2 `offerWindow`). */
export const ROUTING_WINDOWS: RoutingWindowRules = Object.freeze({
  nightStartsLocal: "20:00",
  offersFromLocal: "07:30",
  dayStartsLocal: "08:00",
  earlySlaEndSameDayLocal: "08:00",
  earlySlaEndLocal: "09:00",
  sameDaySlaMinutes: 30,
  slaMinutes: 60,
  deadlineAfterCutoffMinutes: 120,
  maxOffers: 5,
});

/** The no-partner grace window (founder 16-2, advisor's pick; spec 016 §5.2 `graceEnd`). */
export const NO_PARTNER_GRACE: GraceRules = Object.freeze({
  dueTodayMinutes: 120,
  morningLocal: "10:00",
  minimumMinutes: 120,
});

/** The ranking defaults (`plan/06` §5.2 rule 2c; §13 16-1; spec 022a §12's encoding). */
export const ROUTING_RANKING: RankingRules = Object.freeze({
  ratingBandPercent: 95,
  defaultRatingBp: 9000,
  minOffersForAcceptanceRate: 5,
  defaultAcceptanceRateBp: 10_000,
});
