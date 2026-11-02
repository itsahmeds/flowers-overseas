/**
 * @purpose Review constants: invite timing, text cap, display and rating thresholds (spec 022a)
 * @spec 022a
 *
 * The numbers of spec 022a §5.2 "Constants" (TASK-368), in one place, so the invitation job, the
 * form, the display blocks, the rating and the alerts cannot disagree. Durations are absolute
 * (hours and days of 24 hours), never calendar arithmetic. Counts are whole numbers.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */

/** B9 goes this long after the delivery photo (§13 Q1). */
export const REVIEW_INVITE_DELAY_HOURS = 24;

/** An invite's link works this long after the delivery photo, then it is marked `expired`. */
export const REVIEW_INVITE_LIFE_DAYS = 30;

/** `ReviewSubmission.text`: at most this many graphemes (`Intl.Segmenter`). */
export const REVIEW_TEXT_MAX_GRAPHEMES = 1000;

/** The database's own cap on `review.text` (`review_text_length_check`, characters). */
export const REVIEW_TEXT_MAX_CHARACTERS = 2000;

/** A PDP or corridor block shows with at least this many published reviews (§13 Q6). */
export const REVIEW_BLOCK_MINIMUM = 3;

/** The reviews page may be indexed with at least this many published reviews with text (§13 Q5). */
export const REVIEWS_PAGE_INDEX_MINIMUM = 10;

/** The florist rating reads the last this-many days of first-party ratings (§13 Q10). */
export const RATING_WINDOW_DAYS = 90;

/** Fewer ratings than this in the window: the rating is `NULL`. */
export const RATING_MINIMUM = 3;

/** Fewer answered offers than this in the window: the acceptance rate is `NULL`. */
export const ACCEPTANCE_MINIMUM = 5;

/** A review pending longer than this raises `alert=reviews.pending_overdue` (§13 Q9). */
export const REVIEW_PENDING_ALERT_HOURS = 72;

/**
 * `rating_90d_bp` = round(mean × `RATING_BP_PER_STAR`): 5.00 stars = 10 000, 4.50 = 9 000
 * (§13 Q10; spec 016's `rankCandidates` reads a `NULL` rating as 9 000).
 */
export const RATING_BP_PER_STAR = 2000;

/** The ratings a buyer can give. */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
