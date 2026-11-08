/**
 * @purpose Client-safe entry to i18n: the pure formatters and collator a `"use client"` file may import (TASK-503)
 * @spec 003
 *
 * The second public entry of the i18n module, next to `index.ts`, and the only one a
 * `"use client"` file may use. The barrel also carries the review ledger (`review-ledger.ts`
 * loads `./db/ledger.ts`, which reaches `src/lib/db.ts`, `server-only` and Node built-ins) and
 * Server Components; a bundler follows a dynamic `import()` as well as a static one, so a client
 * island that imports `formatMoney` from the barrel drags all of that into the browser graph and
 * `next build` fails (TASK-503).
 *
 * This file re-exports `format.ts` and `collate.ts` and nothing else: functions, types and the
 * money schema, exactly the names the barrel already exports for them, so a caller gets the same
 * `formatMoney` (integer minor units, `Intl` through the registry) whichever entry it uses.
 * `eslint/modules.js` lets another module import `client.ts` as it lets it import `index.ts`, and
 * `tests/unit/client-server-graph.test.ts` fails if anything this file reaches imports server code.
 */
export {
  type DateParts,
  type DateStyle,
  type FormatMoneyOptions,
  type FormatNumberOptions,
  type FormatTimeInZoneOptions,
  type ListType,
  type Money,
  MoneySchema,
  type RangeEnds,
  type ZoneNameStyle,
  type ZonedClock,
  countGraphemes,
  formatDate,
  formatDateParts,
  formatList,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRegionName,
  formatRange,
  formatRangeEnds,
  formatRelativeTime,
  formatTimeInZone,
  moneyDecimalString,
  zonedClock,
} from "./format.ts";

export { collator, sortBy } from "./collate.ts";
