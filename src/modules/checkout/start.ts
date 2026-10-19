/**
 * `POST /api/checkout/start` (spec 010 §2 "The entry from the product page", §5.2, §8, AC-6;
 * TASK-203). The route file is one line; the contract is here, testable without a server.
 *
 * The product page's "Try a demo order" (or, live, "Continue") is a submit button inside its
 * existing form, so the body is a form post of `CheckoutStartSchema`: the selection and the total
 * and currency the page displayed. In order:
 *
 *  1. **405** for anything but `POST` (the route exports `GET` only to say so);
 *  2. **403** unless `Origin` names this host (`x-forwarded-host`, else `Host`), the check Next's
 *     server actions make for themselves; a missing `Origin` is foreign;
 *  3. the body parsed by `CheckoutStartSchema`; an unknown product, tier or country, a malformed
 *     body, a price the provider cannot give or a product the database does not hold answers
 *     **303 to the product page with no query string** (or to the locale's home when there is no
 *     product page to go back to), and writes nothing;
 *  4. `currentCheckoutMode()`; `closed` writes nothing and goes back to the product page (see the
 *     escalation in `docs/tasks/TASK-203.md`: the closed state's URL is TASK-204's);
 *  5. the price through spec 005 (`deriveQuote`), one draft with the signed quote, the
 *     `fo_checkout` cookie, and **303 to `/{locale}/checkout`**. When the posted total differs from
 *     the server's, the draft records the posted one as the last total the buyer saw, so step 1
 *     opens with the notice naming both amounts (§2 "Money").
 *
 * Every response is `no-store` and carries no body; `/api/` is disallowed to crawlers (spec 001),
 * and robots directives are `modules/seo`'s alone. Nothing personal is read or written: the body
 * carries none, and the logs name the draft by id (§8).
 */
import { z } from "zod";

import { isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import {
  getProduct,
  listTiers,
  productAlternatePaths,
} from "@/modules/catalog";

import { checkoutCookieHeader } from "./cookie";
import { type DraftConnection, createDraft } from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import { deriveQuote } from "./pricing";
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
): Response {
  return new Response(null, {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

function seeOther(
  location: string,
  headers: Record<string, string> = {},
): Response {
  return respond(303, { Location: location, ...headers });
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
    return parsed.success ? parsed.data : null;
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
    return seeOther(await backTo(fields));
  }

  const now = (dependencies.now ?? (() => new Date()))();
  // The product page offers a date only when the destination is live (spec 009 AC-8); in `demo`
  // and `test` step 1 shows the demo calendar, so a posted date is not carried over.
  const deliveryDate = mode === "live" ? (start.date ?? null) : null;
  let signed;
  try {
    signed = await deriveQuote(
      {
        locale,
        countryIso,
        sku: start.sku,
        tierKey: start.tierKey,
        deliveryDate,
        addonKeys: [],
      },
      now,
    );
  } catch {
    refused("no_price");
    return seeOther(await backTo(fields));
  }

  const expected = {
    amountMinor: z.number().int().nonnegative().parse(start.expectedTotalMinor),
    currency: start.expectedCurrency,
  };
  const created = await createDraft(
    {
      locale,
      countryIso,
      sku: start.sku,
      tierKey: start.tierKey,
      deliveryDate,
      mode,
      quote: signed,
      expected,
      // The total the buyer last saw is the one the product page displayed: when the server's
      // differs, `priceChange()` names both and step 1 opens with the notice.
      confirmed: expected,
      now,
    },
    dependencies.connection,
  );
  if (created === null) {
    refused("product_not_in_database");
    return seeOther(await backTo(fields));
  }

  logger.info(
    { draft_id: created.draftId, mode, locale, country_iso: countryIso },
    "checkout.draft_created",
  );
  if (
    expected.amountMinor !== signed.totalMinor ||
    expected.currency !== signed.currency
  ) {
    logger.info(
      {
        draft_id: created.draftId,
        from_minor: expected.amountMinor,
        to_minor: signed.totalMinor,
        currency: signed.currency,
      },
      "checkout.price_changed",
    );
  }
  return seeOther(`/${locale}/checkout`, {
    "Set-Cookie": checkoutCookieHeader(created.token),
  });
}
