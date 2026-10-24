/**
 * `POST /api/checkout/start` (spec 010 §2 "The entry from the product page", §5.2, §8, AC-6;
 * §14 A-founder-2026-10-22 items 1 D6, D7, D12, 4 and 7; AC-54, AC-55, AC-56, AC-62; TASK-203,
 * TASK-348). The route file is one line; the contract is here, testable without a server.
 *
 * The product page's two submits ("Try a demo order" or, live, "Continue", and "Add to basket")
 * sit inside its existing form, so the body is a form post of `CheckoutStartSchema`: the
 * selection, the total and currency the page displayed, and `then` (`checkout` or `basket`). In
 * order:
 *
 *  1. **405** for anything but `POST` (the route exports `GET` only to say so);
 *  2. **403** unless `Origin` names this host (`x-forwarded-host`, else `Host`), the check Next's
 *     server actions make for themselves; a missing `Origin` is foreign;
 *  3. the body parsed by `CheckoutStartSchema`; an unknown product, tier or country, a malformed
 *     body, a price the provider cannot give or a product the database does not hold answers
 *     **303 to the product page with no query string** (or to the locale's home when there is no
 *     product page to go back to), and writes nothing;
 *  4. the basket the cookie names, when it is active and unplaced; with no cookie, an expired one
 *     or one for a placed basket, a new basket is started instead and the placed one is left as
 *     it was (AC-54);
 *  5. `currentCheckoutMode()` for the destination; `closed` stores no line (AC-56): back to the
 *     basket when there is one, else to the product page (TASK-203's escalation: the closed
 *     state's URL is TASK-204's);
 *  6. into an existing basket, **refusals write no line and 303 to `/{locale}/basket`**, which
 *     renders the notice from `checkout_draft.pending_notice`, never a query string: a mode other
 *     than the basket's (`other_mode`), a basket already at `BASKET_MAX_LINES` (`full`, also
 *     re-checked under the row lock), a line the provider cannot price in the basket's currency
 *     (`other_currency`);
 *  7. the price through spec 005, **in the basket's currency** (a new basket's is the one the
 *     product page showed for the locale); the line stores what the page displayed as its
 *     last-seen amount, so the next screen's notice names both amounts when they differ (AC-6);
 *  8. **append under the basket's row lock**, or a new basket with its first line and a fresh
 *     token; then **303** to `/{locale}/checkout` (`then=checkout`) or `/{locale}/basket`
 *     (`then=basket`, with the `added` notice).
 *
 * Cookies (item 7, AC-62): a new basket sets `fo_checkout` (its token, 30 days); an append sets
 * none (AC-6: no new token); every response that changes the number of lines sets `fo_basket` to
 * that number. Every response is `no-store` and carries no body; `/api/` is disallowed to crawlers
 * (spec 001), and robots directives are `modules/seo`'s alone. Nothing personal is read or written:
 * the body carries none, and the logs name the draft by id with codes and counts only (§8,
 * AC-78). Nothing reads the buyer's residence, `Accept-Language`, an IP or a geo header (AC-76).
 */
import { z } from "zod";

import { BASKET_MAX_LINES } from "@/config/checkout";
import { isCountryIso2 } from "@/config/countries";
import type { CurrencyCode } from "@/config/currencies";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import {
  type Quote,
  getProduct,
  listTiers,
  productAlternatePaths,
} from "@/modules/catalog";

import {
  basketCookieHeader,
  checkoutCookieHeader,
  draftTokenFromCookieHeader,
} from "./cookie";
import {
  type Draft,
  type DraftConnection,
  type PendingNotice,
  appendLine,
  createDraft,
  loadDraft,
  saveDraft,
} from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import {
  BasketCurrencyUnavailable,
  deriveLineQuote,
  deriveQuote,
} from "./pricing";
import { CheckoutStartSchema } from "./schemas";

/** What a test injects; production passes nothing. */
export interface StartDependencies {
  readonly now?: () => Date;
  readonly connection?: DraftConnection;
  readonly flags?: CheckoutFlagReader;
}

const BASE_HEADERS = { "Cache-Control": "no-store" } as const;

function respond(
  status: number,
  headers: Record<string, string> = {},
  cookies: readonly string[] = [],
): Response {
  const all = new Headers({ ...BASE_HEADERS, ...headers });
  for (const cookie of cookies) all.append("Set-Cookie", cookie);
  return new Response(null, { status, headers: all });
}

function seeOther(location: string, cookies: readonly string[] = []): Response {
  return respond(303, { Location: location }, cookies);
}

/** `GET` and every other method: 405 with `Allow: POST`. */
export function methodNotAllowed(): Response {
  return respond(405, { Allow: "POST" });
}

/** Does `Origin` name the host this request was sent to? */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null || origin === "null") return false;
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host");
  if (host === null || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Where the product page's two submits post (`formaction`, AC-5). */
export const CHECKOUT_START_PATH = "/api/checkout/start";

/**
 * The product page's form as `CheckoutStartSchema` reads it (AC-5, TASK-206): the size radio is
 * named `tier` (the page's `GET` form shares it with the size island), and the page carries what
 * it displayed for **each** size as `expect-{tierKey}`, because the size can change after the
 * page was served; the one matching the posted size is `expectedTotalMinor`. A body already in the
 * schema's own shape passes unchanged.
 */
export function startFields(
  fields: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "tier" || key.startsWith("expect-")) continue;
    out[key] = value;
  }
  const tier = fields["tier"];
  if (out["tierKey"] === undefined && tier !== undefined) out["tierKey"] = tier;
  const shown =
    out["tierKey"] === undefined
      ? undefined
      : fields[`expect-${out["tierKey"]}`];
  if (out["expectedTotalMinor"] === undefined && shown !== undefined) {
    out["expectedTotalMinor"] = shown;
  }
  return out;
}

/** The posted form: string fields only (a file part is refused), each key once. */
const StartBodySchema = z.record(z.string().max(256), z.string().max(256));

/**
 * The posted form as strings, the way `CheckoutStartSchema` reads it, or `null` for a body that is
 * not a form (`formData()` throws on any other content type) or carries a file.
 */
async function formFields(
  request: Request,
): Promise<Record<string, string> | null> {
  try {
    const parsed = StartBodySchema.safeParse(
      Object.fromEntries((await request.formData()).entries()),
    );
    return parsed.success ? startFields(parsed.data) : null;
  } catch {
    return null;
  }
}

/**
 * Where a refused start goes back to: the product page for this product, destination and locale
 * when it exists, else the locale's home, else the site root. Never with a query string.
 */
async function backTo(fields: Record<string, string> | null): Promise<string> {
  const locale = fields?.["locale"];
  const countryIso = fields?.["countryIso"];
  const sku = fields?.["sku"];
  if (locale === undefined || !isLocaleCode(locale)) return "/";
  if (
    countryIso !== undefined &&
    sku !== undefined &&
    isCountryIso2(countryIso) &&
    (await getProduct(sku).catch(() => null)) !== null
  ) {
    const paths = await productAlternatePaths({ sku, countryIso }).catch(
      () => ({}) as Readonly<Record<string, string>>,
    );
    const path = paths[locale];
    if (path !== undefined) return path;
  }
  return `/${locale}`;
}

function refused(code: string): void {
  logger.info({ code }, "checkout.refused");
}

/** A refusal into an existing basket (item 4): the notice is stored, no line is (AC-78 keys). */
async function refuseIntoBasket(
  draft: Draft,
  locale: LocaleCode,
  code: PendingNotice | "closed",
  countryIso: string,
  now: Date,
  connection: DraftConnection | undefined,
): Promise<Response> {
  if (code !== "closed") {
    await saveDraft(draft.id, { pendingNotice: code }, now, connection);
  }
  logger.info(
    {
      draft_id: draft.id,
      code,
      country_iso: countryIso,
      mode: draft.mode,
    },
    "checkout.basket_refused",
  );
  return seeOther(`/${locale}/basket`);
}

/** `POST /api/checkout/start`. */
export async function startCheckout(
  request: Request,
  dependencies: StartDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(request)) {
    refused("foreign_origin");
    return respond(403);
  }

  const fields = await formFields(request);
  const parsed = CheckoutStartSchema.safeParse(fields ?? undefined);
  if (!parsed.success) {
    refused("invalid_selection");
    return seeOther(await backTo(fields));
  }
  const start = parsed.data;
  const locale: LocaleCode = start.locale;
  if (!isCountryIso2(start.countryIso)) {
    refused("unknown_country");
    return seeOther(await backTo(fields));
  }
  const countryIso = start.countryIso;

  const product = await getProduct(start.sku).catch(() => null);
  const tiers =
    product === null ? [] : await listTiers(start.sku).catch(() => []);
  if (!tiers.some((tier) => tier.tierKey === start.tierKey)) {
    refused(product === null ? "unknown_product" : "unknown_tier");
    return seeOther(await backTo(fields));
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const connection = dependencies.connection;
  const lookup = await loadDraft(
    draftTokenFromCookieHeader(request.headers.get("cookie")),
    now,
    connection,
  );
  // A placed basket is read-only (AC-52): the next add starts a new one, with a new token.
  const basket =
    lookup.status === "active" && lookup.draft.purchaseId === null
      ? lookup.draft
      : null;

  const mode = await currentCheckoutMode({
    countryIso,
    locale,
    ...(dependencies.flags === undefined ? {} : { flags: dependencies.flags }),
  });
  if (mode === "closed") {
    logger.info(
      { reason: "mode_closed", country_iso: countryIso },
      "checkout.closed",
    );
    return basket === null
      ? seeOther(await backTo(fields))
      : refuseIntoBasket(basket, locale, "closed", countryIso, now, connection);
  }
  if (basket !== null && basket.mode !== mode) {
    return refuseIntoBasket(
      basket,
      locale,
      "other_mode",
      countryIso,
      now,
      connection,
    );
  }
  if (basket !== null && basket.lines.length >= BASKET_MAX_LINES) {
    return refuseIntoBasket(
      basket,
      locale,
      "full",
      countryIso,
      now,
      connection,
    );
  }

  // The product page offers a date only when the destination is live (spec 009 AC-8); in `demo`
  // and `test` step 1 shows the demo calendar, so a posted date is not carried over.
  const deliveryDate = mode === "live" ? (start.date ?? null) : null;
  const selection = {
    countryIso,
    sku: start.sku,
    tierKey: start.tierKey,
    deliveryDate,
    addonKeys: [] as string[],
  };
  const basketCurrency = (basket?.currency ?? null) as CurrencyCode | null;
  let signed: Quote;
  try {
    signed =
      basket === null || basketCurrency === null
        ? await deriveQuote({ locale, ...selection }, now)
        : await deriveLineQuote(selection, basketCurrency, locale, now);
  } catch (error) {
    if (basket !== null && error instanceof BasketCurrencyUnavailable) {
      return refuseIntoBasket(
        basket,
        locale,
        "other_currency",
        countryIso,
        now,
        connection,
      );
    }
    refused("no_price");
    return seeOther(await backTo(fields));
  }

  // What the product page displayed: the line's last-seen amount, in its own currency (AC-6).
  const lastSeen = {
    amountMinor: z.number().int().nonnegative().parse(start.expectedTotalMinor),
    currency: start.expectedCurrency,
  };
  const line = {
    countryIso,
    sku: start.sku,
    tierKey: start.tierKey,
    deliveryDate,
    quote: signed,
    lastSeen,
  };
  const destination =
    start.then === "basket" ? `/${locale}/basket` : `/${locale}/checkout`;
  const notice: PendingNotice | null = start.then === "basket" ? "added" : null;
  const priceNotice = (draftId: string): void => {
    if (
      lastSeen.amountMinor !== signed.totalMinor ||
      lastSeen.currency !== signed.currency
    ) {
      logger.info(
        {
          draft_id: draftId,
          country_iso: countryIso,
          mode,
          code: "price_changed",
        },
        "checkout.price_changed",
      );
    }
  };

  if (basket !== null) {
    const appended = await appendLine(basket.id, line, now, connection, notice);
    if (appended.status === "full") {
      return refuseIntoBasket(
        basket,
        locale,
        "full",
        countryIso,
        now,
        connection,
      );
    }
    if (appended.status === "appended") {
      logger.info(
        {
          draft_id: basket.id,
          position: appended.position,
          country_iso: countryIso,
          mode,
        },
        "checkout.basket_line_added",
      );
      priceNotice(basket.id);
      // Positions have no gap, so the new line's position is the number of lines.
      return seeOther(destination, [basketCookieHeader(appended.position)]);
    }
    if (appended.status === "missing") {
      refused("product_not_in_database");
      return seeOther(await backTo(fields));
    }
    // `placed`: placed between the read and the lock; a new basket below.
  }

  const created = await createDraft(
    { locale, mode, line, expected: lastSeen, pendingNotice: notice, now },
    connection,
  );
  if (created === null) {
    refused("product_not_in_database");
    return seeOther(await backTo(fields));
  }
  logger.info(
    { draft_id: created.draftId, position: 1, country_iso: countryIso, mode },
    "checkout.basket_line_added",
  );
  priceNotice(created.draftId);
  return seeOther(destination, [
    checkoutCookieHeader(created.token),
    basketCookieHeader(1),
  ]);
}
