/**
 * The account pages' request helpers (spec 018 §14 A-founder-2026-10-22 C.5, C.13, AC-25, AC-34;
 * TASK-344): the `account.open` flag for a locale, the locale of a route, the order modes the
 * account lists in this environment, and the buyer's RLS-scoped runner.
 */
import { randomUUID } from "node:crypto";

import { isLocaleCode, type LocaleCode } from "@/config/locales";
import { type BuyerContext, toDbContext } from "@/lib/auth/buyer";
import { appEnvironment } from "@/lib/env.schema";
import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";
import { routableLocale } from "@/modules/i18n";
import {
  accountOrderModes,
  type CustomerRunner,
  customerRunner,
} from "@/modules/orders/account-orders";

/**
 * Whether the account is on for `locale` (AC-34): `account.open` globally, or for that locale.
 * A flag that cannot be read is off (fail closed: the routes answer 404).
 */
export async function accountOpen(locale: LocaleCode): Promise<boolean> {
  try {
    if (await isEnabled("account.open")) return true;
    return await isEnabled("account.open", { kind: "locale", ref: locale });
  } catch (error) {
    logger.warn(
      { error_name: error instanceof Error ? error.name : "unknown" },
      "account.flag_unreadable",
    );
    return false;
  }
}

/** The route's locale when the site serves it, else `null` (the page answers 404). */
export function accountLocale(requested: string): LocaleCode | null {
  const code = routableLocale(requested)?.code;
  return code !== undefined && isLocaleCode(code) ? code : null;
}

/** The order modes the account lists here: `live`, plus `test` outside production (AC-25). */
export function listedModes(): readonly string[] {
  return accountOrderModes(appEnvironment(process.env));
}

/** The buyer's `customer` database context as a runner: RLS scopes every read (AC-25). */
export function asCustomer(context: BuyerContext): CustomerRunner {
  return customerRunner(toDbContext(context, randomUUID()));
}

/** `/{locale}/account/orders/{reference}`. */
export function orderDetailPath(locale: LocaleCode, reference: string): string {
  return `/${locale}/account/orders/${reference}`;
}

/** `/{locale}/account/invoices/{invoiceId}`: the owner's download, no token (AC-23). */
export function invoicePath(locale: LocaleCode, invoiceId: string): string {
  return `/${locale}/account/invoices/${invoiceId}`;
}
