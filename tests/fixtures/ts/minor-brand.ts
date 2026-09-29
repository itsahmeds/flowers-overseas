// Fixture for spec 001 §14 A20, AC-59 / T-63 (TASK-163): the branded `Minor` type.
//
// MUST fail `tsc -p tsconfig.fixtures.json` on the line under each `// red:` comment, with the
// code it names, and MUST compile on every other line. `tests/unit/catalog-pricing-minor.test.ts`
// reads tsc's output for exactly those lines rather than trusting an `@ts-expect-error` (audit
// row 7). Excluded from the main `pnpm typecheck` project.
import type { z } from "zod";

import type { MinorUnitsSchema as DatasetMinorUnitsSchema } from "@/config/catalogue/schemas";
import { toMinor } from "@/modules/catalog/pricing/money";
import { MinorUnitsSchema } from "@/modules/catalog/schemas";
import type {
  IntegerMoney,
  Minor,
  PricePoint,
  Quote,
  QuoteLine,
  Surcharge,
  VatLine,
  VatSplit,
} from "@/modules/catalog/types";

declare const priceMinor: Minor;
declare const amountMinor: Minor;
declare const rate: number;
declare const price: PricePoint;

// Arithmetic on a `Minor` gives a plain `number` (AC-59's two named lines).
// red: TS2322
export const shown: Minor = priceMinor / 100;
export const money: IntegerMoney = {
  // red: TS2322
  amountMinor: amountMinor * rate,
  currency: "EUR",
};

// A bare number is not money until it has been through the one parse.
// red: TS2322
export const literal: Minor = 4590;
export const surcharge: IntegerMoney = {
  // red: TS2322
  amountMinor: price.amountMinor + rate,
  currency: "EUR",
};

// Every `*Minor` field of the pricing types is a `Minor`: widening any one back to `number` makes
// its line compile. `catalog-pricing-minor.test.ts` also asks the compiler for every such field.
// red: TS2322
export const integerMoneyAmountMinor: IntegerMoney["amountMinor"] = rate;
// red: TS2322
export const surchargeAmountMinor: Surcharge["amountMinor"] = rate;
// red: TS2322
export const pricePointAmountMinor: PricePoint["amountMinor"] = rate;
// red: TS2322
export const pricePointVatAmountMinor: PricePoint["vatAmountMinor"] = rate;
// red: TS2322
export const pricePointNetAmountMinor: PricePoint["netAmountMinor"] = rate;
// red: TS2322
export const vatLineGrossMinor: VatLine["grossMinor"] = rate;
// red: TS2322
export const vatSplitNetMinor: VatSplit["netMinor"] = rate;
// red: TS2322
export const vatSplitVatMinor: VatSplit["vatMinor"] = rate;
// red: TS2322
export const vatSplitGrossMinor: VatSplit["grossMinor"] = rate;
// red: TS2322
export const quoteLineAmountMinor: QuoteLine["amountMinor"] = rate;
// red: TS2322
export const quoteTotalMinor: Quote["totalMinor"] = rate;

// The brand is on the module's schema only (A20): the dataset's schema stays unbranded.
// red: TS2322
export const branded: z.infer<typeof MinorUnitsSchema> = 4590;
export const dataset: z.infer<typeof DatasetMinorUnitsSchema> = 4590;

// The two ways in, and a `Minor` is still a `number` on the way out.
export const parsed: Minor = MinorUnitsSchema.parse(4590);
export const converted: Minor = toMinor(4590);
export const repaired: IntegerMoney = {
  amountMinor: toMinor(amountMinor * 3),
  currency: "EUR",
};
export const out: number = price.netAmountMinor + price.vatAmountMinor;
