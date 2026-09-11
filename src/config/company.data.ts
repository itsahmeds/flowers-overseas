/**
 * The trading name as a plain constant, with **no imports at all** (spec 004 §14 A1, AC-12;
 * TASK-055).
 *
 * The same trade `src/config/locales.data.ts` and `src/modules/i18n/error-copy.data.ts` make, for
 * the same reason: the two 500 boundaries are Client Components (Next requires an error boundary
 * to be one) and `src/app/global-error.tsx`'s chunk is attached to **every** document, `/`
 * included. They print the wordmark — `docs/design/wireframes/errors-*.dc.html`'s "minimal chrome:
 * the wordmark, the copy, two actions" — and `./company.ts` reaches zod, so they may not read it
 * there.
 *
 * This is not a second copy of the name: `./company.ts` builds `COMPANY.tradingName` from this
 * constant, so there is one string in the repository and `tests/unit/company-config.test.ts`
 * pins the two together. The rest of the identity — the registry fields, the contact channel and
 * the `registered` refinement that AC-9 turns on — stays in `./company.ts` behind its schema,
 * because none of it belongs on a failure page.
 */

/** The brand's trading name. Never translated (`content/i18n/glossary.en.md`). */
export const TRADING_NAME = "Flowers Overseas";
