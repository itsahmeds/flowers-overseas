/**
 * The fraud pre-checks' numbers (spec 021 §5.2 "Signals", "Decision bands", "Deadline",
 * "Pay-step pre-check", "Card-testing detector"; §13 Q3, Q5, Q9, Q11; TASK-493): the signal table
 * with its points, the bands per currency in integer minor units, the score bands, the velocity
 * counts and windows, the review deadline constants, the pay-step limits, the card-testing
 * detector's thresholds and `EEA_COUNTRIES`.
 *
 * Every threshold is a constant with a test at its boundary (§13 Q9). Amounts are integer minor
 * units for exactly the currencies spec 013's `toStripeAmount` supports (GBP, EUR, PLN; AC-10).
 * Bumping a point value or a threshold bumps `RISK_RULES_VERSION`, which every assessment stores.
 *
 * No database and no env here (`pnpm check:no-db` scans `src/config`).
 */

/** The rule set's version, stored on every `risk_assessment` row. */
export const RISK_RULES_VERSION = 1;

/** The currencies an intent may be created in (spec 013's `STRIPE_CHARGE_CURRENCIES`). */
export type RiskCurrency = "GBP" | "EUR" | "PLN";
export const RISK_CURRENCIES = ["GBP", "EUR", "PLN"] as const;

/** A band per currency, integer minor units; "at or above the figure counts". */
export type RiskBand = Readonly<Record<RiskCurrency, number>>;

/** S4: a first order at or above this scores (EUR 150.00, GBP 130.00, PLN 650.00). */
export const FIRST_ORDER_BAND: RiskBand = {
  EUR: 15_000,
  GBP: 13_000,
  PLN: 65_000,
};
/** S5: any order at or above this always holds (EUR 300.00, GBP 260.00, PLN 1 300.00). */
export const REVIEW_BAND: RiskBand = { EUR: 30_000, GBP: 26_000, PLN: 130_000 };
/** `risk.strict`: every first order at or above this holds (EUR 100.00, GBP 85.00, PLN 430.00). */
export const STRICT_BAND: RiskBand = { EUR: 10_000, GBP: 8_500, PLN: 43_000 };

/** Every signal id of §5.2's table. */
export const RISK_SIGNAL_IDS = [
  "S1",
  "S1h",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
  "S14",
  "S15",
  "S16",
  "D1",
  "D2",
] as const;
export type RiskSignalId = (typeof RISK_SIGNAL_IDS)[number];

/** What a signal does: add points, always hold, or cancel (decisive). */
export type RiskSignalEffect =
  | { readonly kind: "points"; readonly points: number }
  | { readonly kind: "hold" }
  | { readonly kind: "cancel" };

/** §5.2's table: each signal's effect. */
export const RISK_SIGNALS: Readonly<Record<RiskSignalId, RiskSignalEffect>> = {
  S1: { kind: "points", points: 30 },
  S1h: { kind: "points", points: 60 },
  S2: { kind: "hold" },
  S3: { kind: "points", points: 15 },
  S4: { kind: "points", points: 20 },
  S5: { kind: "hold" },
  S6: { kind: "points", points: 15 },
  S7: { kind: "points", points: 25 },
  S8: { kind: "points", points: 25 },
  S9: { kind: "points", points: 30 },
  S10: { kind: "points", points: 30 },
  S11: { kind: "points", points: 30 },
  S12: { kind: "points", points: 20 },
  S13: { kind: "points", points: 10 },
  S14: { kind: "points", points: 40 },
  S15: { kind: "hold" },
  S16: { kind: "hold" },
  D1: { kind: "cancel" },
  D2: { kind: "cancel" },
};

/** The sum of points is capped here. */
export const SCORE_CAP = 100;
/** A score at or above this holds. */
export const HOLD_SCORE = 40;
/** Under `risk.strict`, a score at or above this holds. */
export const STRICT_HOLD_SCORE = 20;
/** A score at or above this is high (it changes only the deadline default and recommendation). */
export const HIGH_SCORE = 70;

/** Velocity counts: a signal fires at or above its count, inside its window. */
export const VELOCITY = {
  /** S7: paid orders with this email hash. */
  S7: { count: 3, windowHours: 24 },
  /** S8: distinct recipient-address hashes for this email hash. */
  S8: { count: 4, windowHours: 7 * 24 },
  /** S9: distinct card hashes for this email hash. */
  S9: { count: 3, windowHours: 7 * 24 },
  /** S10: distinct email hashes for this card hash. */
  S10: { count: 3, windowHours: 7 * 24 },
  /** S11: distinct buyer email hashes for this recipient-address hash. */
  S11: { count: 3, windowHours: 7 * 24 },
} as const;
/** On a peak day, S7, S8 and S11 need this many more (§13 Q11). */
export const PEAK_DAY_EXTRA = 2;
/**
 * The occasions that make a delivery date a peak day (§13 Q11: "Mother's Day, Women's Day,
 * Valentine's"), read against the destination's occasion calendar (spec 007). Keys of spec 005's
 * taxonomy; a country without one of them simply has no such peak.
 */
export const PEAK_OCCASION_KEYS = [
  "mothers_day",
  "womens_day",
  "valentines",
] as const;
/** S12: declined attempts on this order before it was paid. */
export const S12_DECLINES = 3;

/** `latestSafeOfferAt = routingDeadline − REVIEW_ROUTING_MARGIN` (3 hours). */
export const REVIEW_ROUTING_MARGIN_MS = 3 * 60 * 60_000;
/** A hold lasts at most 12 hours. */
export const REVIEW_MAX_HOLD_MS = 12 * 60 * 60_000;
/** Under 30 minutes left, the default applies at once (`decide_now`). */
export const REVIEW_MIN_WINDOW_MS = 30 * 60_000;
/** `risk.review_due_soon` fires once at `deadline − 60 min`. */
export const REVIEW_DUE_SOON_MS = 60 * 60_000;
/** An EFW on a `paid` order: decide by `productionStartAt − 60 min` (§5.2 "After routing"). */
export const POST_ROUTING_MARGIN_MS = 60 * 60_000;
/** Site velocity (§5.2): more than this many new-email `live` orders paid in an hour alerts. */
export const SITE_VELOCITY_MAX_NEW_EMAILS = 5;
export const SITE_VELOCITY_WINDOW_MINUTES = 60;

/** The pay step: the order's declined attempts that end it (spec 013 AC-5's counter). */
export const MAX_DECLINED_ATTEMPTS = 5;
/** The pay step: an email whose orders ended unpaid this many times ... */
export const FAILED_ORDERS_THRESHOLD = 3;
/** ... within this window is refused. */
export const FAILED_ORDERS_WINDOW_MS = 24 * 60 * 60_000;

/** The card-testing detector reads this window ... */
export const CARD_TESTING_WINDOW_MINUTES = 10;
/** ... and fires at this many declines or more ... */
export const CARD_TESTING_MIN_DECLINES = 10;
/** ... when declines are at least this share of attempts, as a fraction (50 %). */
export const CARD_TESTING_DECLINE_SHARE = {
  numerator: 1,
  denominator: 2,
} as const;
/** The automatic pause (`live` only) lasts this long (§13 Q5). */
export const CARD_TESTING_PAUSE_MINUTES = 30;

/** `risk_identity.expires_at` and the retention rows of A11 (c), in days. */
export const IDENTITY_RETENTION_DAYS = {
  email: 365,
  card: 365,
  recipient_address: 90,
} as const;
/** A blocklist entry lasts this long after its last match (or its creation). */
export const BLOCKLIST_RETENTION_DAYS = 365;

/**
 * The 30 EEA states (27 EU plus Iceland, Liechtenstein, Norway), ISO 3166-1 alpha-2. S13 never
 * applies to a card issued here with liability shift (Geo-blocking Regulation Art. 5(1)), and the
 * runbook's Radar review list may hold none of them (AC-37).
 */
export const EEA_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
] as const;

/** The flags of §5.2 "Flags" (registered in `feature-flags.ts`). */
export const RISK_FLAGS = {
  gate: "risk.gate",
  strict: "risk.strict",
  payPause: "risk.pay_pause",
} as const;
