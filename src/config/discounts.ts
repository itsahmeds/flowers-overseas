/**
 * Discount code limits (spec 047 §5.2 `src/config/discounts.ts`, §2, §13 Q1, Q10; TASK-445).
 *
 * Every number the discounts module, its admin form and its checkout control read, in one place.
 * Migration `0037_discount_codes` checks the same bounds (`percent_bp BETWEEN 100 AND 5000`,
 * `code_normalised ~ '^[A-Z0-9]{6,32}$'`, `amount_off_minor * 2 <= min_order_minor`, the campaign
 * label's 80 characters), so changing one here is a migration too;
 * `tests/unit/discounts-core.test.ts` pins the two equal.
 *
 * No database is read here and none may be (`pnpm check:no-db`).
 */

/** Percent codes: 1 % to 50 %, in basis points (§13 Q1). */
export const DISCOUNT_PERCENT_MIN_BP = 100;
export const DISCOUNT_PERCENT_MAX_BP = 5_000;

/** A fixed amount is at most this share of its currency's minimum order (§13 Q1: half). */
export const DISCOUNT_FIXED_CEILING_DIVISOR = 2;

/** The code text after normalising: A to Z and 0 to 9, 6 to 32 characters (§13 Q10). */
export const DISCOUNT_CODE_MIN_LENGTH = 6;
export const DISCOUNT_CODE_MAX_LENGTH = 32;
/** The raw value a form may post before normalising (spaces and hyphens included). */
export const DISCOUNT_CODE_RAW_MAX_LENGTH = 64;

/** "Generate": 10 characters from an alphabet without look-alikes (no I, L, O, U, 0, 1). */
export const DISCOUNT_GENERATED_LENGTH = 10;
export const DISCOUNT_GENERATED_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** The internal campaign label (never shown to a buyer) and the internal note. */
export const DISCOUNT_LABEL_MAX_LENGTH = 80;
export const DISCOUNT_NOTE_MAX_LENGTH = 2_000;

/** The per buyer email cap a new code starts with (§13 Q4). */
export const DISCOUNT_DEFAULT_MAX_PER_EMAIL = 1;

/** Guessing limits (§2 "Abuse limits"): per checkout, then site wide. No IP is read. */
export const DISCOUNT_ATTEMPTS_PER_WINDOW = 5;
export const DISCOUNT_ATTEMPT_WINDOW_MINUTES = 15;
export const DISCOUNT_LOCK_MINUTES = 15;
export const DISCOUNT_SITE_ALERT_FAILURES = 100;
export const DISCOUNT_SITE_ALERT_WINDOW_MINUTES = 10;

/** Codes are entered in this zone by default in admin, shown with it, and stored in UTC (§13 Q13). */
export const DISCOUNT_DEFAULT_TIME_ZONE = "Europe/London";
