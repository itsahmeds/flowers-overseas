/**
 * @purpose Client-safe entry to i18n: `formatMoney` for a `"use client"` file, with no zod and no locale registry (TASK-503, TASK-522)
 * @spec 003
 *
 * The second public entry of the i18n module, next to `index.ts`, and the only one a
 * `"use client"` file may use. The barrel also carries the review ledger (`review-ledger.ts`
 * loads `./db/ledger.ts`, which reaches `src/lib/db.ts`, `server-only` and Node built-ins) and
 * Server Components; a bundler follows a dynamic `import()` as well as a static one, so a client
 * island that imports `formatMoney` from the barrel drags all of that into the browser graph and
 * `next build` fails (TASK-503).
 *
 * TASK-503's first version re-exported `format.ts`, which imports zod and the locale registry
 * (`src/config/locales.ts`), so the two admin islands that format money shipped both
 * (`tests/unit/client-message-graph.test.ts`). This version reaches only import-free files: the
 * one money formatter (`money-format.ts`, which `format.ts` delegates to as well) and two mirrors,
 * `src/config/locales-client.data.ts` (the formatting tag) and
 * `src/config/currencies-client.data.ts` (the exponent). `tests/unit/i18n-client-money.test.ts`
 * holds the mirrors to their sources and this `formatMoney` to the barrel's, string for string.
 * `eslint/modules.js` lets another module import `client.ts` as it lets it import `index.ts`.
 */
import { CURRENCY_EXPONENTS_CLIENT } from "../../config/currencies-client.data.ts";
import { FORMATTING_TAGS_CLIENT } from "../../config/locales-client.data.ts";

import { type FormatMoneyOptions, formatMinorMoney } from "./money-format.ts";

export type { FormatMoneyOptions } from "./money-format.ts";

/** Integer minor units and an ISO currency: the barrel's `Money`, restated without zod. */
export interface ClientMoney {
  readonly amountMinor: number | bigint;
  readonly currency: string;
}

/**
 * `money` in `locale`'s format, exactly as the barrel's `formatMoney` renders it. Throws on a
 * non-integer amount, an unknown currency or an unknown locale, as the barrel's does.
 */
export function formatMoney(
  money: ClientMoney,
  locale: string,
  opts: FormatMoneyOptions = {},
): string {
  if (
    typeof money.amountMinor !== "bigint" &&
    !Number.isSafeInteger(money.amountMinor)
  ) {
    throw new Error("formatMoney: amountMinor must be an integer");
  }
  const exponent = CURRENCY_EXPONENTS_CLIENT[money.currency];
  if (exponent === undefined) {
    throw new Error(`formatMoney: unknown currency ${money.currency}`);
  }
  const tag = FORMATTING_TAGS_CLIENT[locale];
  if (tag === undefined) {
    throw new Error(`formatMoney: unknown locale ${locale}`);
  }
  return formatMinorMoney(
    tag,
    money.currency,
    money.amountMinor,
    exponent,
    opts,
  );
}
