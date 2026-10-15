/**
 * The printed card's one limit (spec 004 §14 A-founder-2026-10-14c, AC-51; spec 010 §13 Q9;
 * TASK-229).
 *
 * **200 graphemes**: what a reader counts as one letter (`countGraphemes()` in
 * `src/modules/i18n/format.ts`), so "ł", "Ж" and a family emoji each count one. The product page's
 * counter and its island read this constant, and checkout's `CHECKOUT_LIMITS.cardMessage` **is**
 * this constant (`src/config/checkout.ts` imports it), so the two limits cannot drift and the
 * product page keeps no limit of its own.
 *
 * It lives in its own file, not in `checkout.ts`, because that file is under the checkout copy's
 * review scope (`src/modules/i18n/review-scope.ts`), which an indexable page may not import
 * (`pnpm i18n:check` check 11). A number carries no copy.
 */
export const CARD_MESSAGE_MAX = 200;
