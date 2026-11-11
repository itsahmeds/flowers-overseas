/**
 * The account pages' request helpers (spec 018 §14 A-founder-2026-10-22 C.5, C.13, AC-25, AC-34;
 * TASK-344): the `account.open` flag for a locale, the locale of a route, the order modes the
 * account lists in this environment, and the buyer's RLS-scoped runner. TASK-352 adds the
 * `account.recipients` flag, the account runner of `@/modules/customers` and the two page paths;
 * TASK-353 the `account.reminders` flag, the `system` runner for the reminder consent and two paths.
 */
import { randomUUID } from "node:crypto";

import { isLocaleCode, type LocaleCode } from "@/config/locales";
import { type BuyerContext, toDbContext } from "@/lib/auth/buyer";
import { appEnvironment } from "@/lib/env.schema";
import { isEnabled } from "@/lib/flags";
import { logger } from "@/lib/logger";
import { routableLocale } from "@/modules/i18n";
import { type AccountRunner, systemAccountRunner } from "@/modules/customers";
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

/**
 * Whether saved recipients are on (spec 018 §14 C.7.3, C.11; TASK-352): `account.recipients`,
 * global. A flag that cannot be read is off: the page answers 404 and the save box is absent.
 */
export async function recipientsOpen(): Promise<boolean> {
  try {
    return await isEnabled("account.recipients");
  } catch (error) {
    logger.warn(
      { error_name: error instanceof Error ? error.name : "unknown" },
      "account.flag_unreadable",
    );
    return false;
  }
}

/**
 * Whether occasion reminders are on (spec 018 §14 C.7.4, C.11; TASK-353): `account.reminders`,
 * global. A flag that cannot be read is off: the page answers 404 and the nav item is absent.
 */
export async function remindersOpen(): Promise<boolean> {
  try {
    return await isEnabled("account.reminders");
  } catch (error) {
    logger.warn(
      { error_name: error instanceof Error ? error.name : "unknown" },
      "account.flag_unreadable",
    );
    return false;
  }
}

/**
 * The `system` database context as the customers module's runner (TASK-353): only for the
 * reminder consent columns and `consent_log`, which a buyer session may not write, and only for
 * the customer the server resolved from the session.
 */
export const asSystemAccount: AccountRunner =
  systemAccountRunner("account.reminders");

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

/** The buyer's `customer` database context as the customers module's runner (RLS). */
export function asCustomerAccount(context: BuyerContext): AccountRunner {
  const run = asCustomer(context);
  return (fn) => run((executor) => fn(executor));
}

/** `/{locale}/account/details`. */
export function detailsPath(locale: LocaleCode): string {
  return `/${locale}/account/details`;
}

/** `/{locale}/account/recipients`. */
export function recipientsPath(locale: LocaleCode): string {
  return `/${locale}/account/recipients`;
}

/** `/{locale}/account/reminders`. */
export function remindersPath(locale: LocaleCode): string {
  return `/${locale}/account/reminders`;
}

/** `/{locale}/account/reminders/unsubscribe`: the stop page, no session needed (C.13). */
export function reminderUnsubscribePath(locale: LocaleCode): string {
  return `/${locale}/account/reminders/unsubscribe`;
}

/** `/{locale}/account/orders/{reference}`. */
export function orderDetailPath(locale: LocaleCode, reference: string): string {
  return `/${locale}/account/orders/${reference}`;
}

/** `/{locale}/account/invoices/{invoiceId}`: the owner's download, no token (AC-23). */
export function invoicePath(locale: LocaleCode, invoiceId: string): string {
  return `/${locale}/account/invoices/${invoiceId}`;
}
