/**
 * The basket's two numbers (spec 010 §14 A-founder-2026-10-22 D3, D7; TASK-347, TASK-348).
 *
 * Their own file, holding no message key, because the order engine reads the cap
 * (`placePurchase` places at most this many orders in one purchase) and the engine is imported by
 * routes that render no checkout copy: `src/config/checkout.ts` is inside the checkout's i18n
 * review scope (`src/modules/i18n/review-scope.ts`), this file is not. `src/config/checkout.ts`
 * re-exports both, so the checkout reads them where it reads every other limit.
 *
 * No database is read here and none may be (`pnpm check:no-db`).
 */

/**
 * At most this many lines in one basket, and so orders in one purchase (D3, §13 Q21). A sixth add
 * is refused and writes nothing. Migration `0020_checkout_draft_lines` checks `position BETWEEN 1
 * AND 5` with the same number, so changing it is a migration; `tests/unit/checkout-config.test.ts`
 * pins the two equal.
 */
export const BASKET_MAX_LINES = 5;

/**
 * A basket (the draft and its lines) is deleted this many days after its last change, and the
 * `fo_checkout` and `fo_basket` cookies live as long (D7, item 7: `Max-Age=2592000`).
 */
export const BASKET_LIFETIME_DAYS = 30;
