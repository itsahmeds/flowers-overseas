/**
 * The remembered country after the paint: the price and link fill on country-less pages and the
 * URL rule on country pages (spec 004 §14 A-founder-2026-10-24a item 3, "Rendering", AC-80,
 * AC-81; TASK-391).
 *
 * Called by the header's motion module after the LCP paint (`../motion/MotionIsland.tsx`, the
 * deferred set's `motions` entry), so it adds no island and no request to the page load: the one
 * request it makes is after the paint, and only with `fo_dest` set on a country-less page. The
 * server HTML is the same for everyone and is never read differently because of the cookie.
 *
 * **Which page is which** is the header's own answer: `data-fo-mega-context` holds the route's
 * country on a country page and is empty on a country-less one (TASK-381's menu model, static per
 * route).
 *
 *  - **Country-less, `fo_dest` set:** fetch `/api/prices/{locale}/{iso2}` (public, cached, reads
 *    no cookie). Each card's reserved price box (`data-fo-card-ask`) takes the country's "from"
 *    price and its inclusive wording, and its "Choose where to send" line (`data-fo-card-cta`)
 *    takes the equivalents line in the same box (a no-break space when there is none, so no box
 *    changes height). Every chooser link (`/{locale}/{chooseSegment}/{next}`) becomes that
 *    country's page from the document's map, else the path form `/{locale}/{chooseSegment}/
 *    {iso2}/{next}`. The `shop.hub.noMoney` box takes `shop.chosen.line` and the reviewed
 *    "change destination" link to the chooser, in the same reserved box (the orchestrator's design
 *    call of 2026-10-24: the no-money sentence would be untrue beside prices).
 *  - **Country page, `fo_dest` naming another country:** `fo_dest` becomes the URL's country
 *    (the URL wins, AC-81). No `fo_dest` is ever created here.
 *
 * The cookie's pattern is the boundary check (a zod parse would cost more than the budget), and
 * the attributes it writes are `destCookieHeader()`'s; `tests/unit/remembered-country.test.ts`
 * pins both to `src/config/cookies.ts` and `src/modules/catalog/chooser-choice.ts`. No
 * `"use client"`: plain functions.
 */

import { PRICES_ROUTE_PREFIX } from "@/config/commerce";

/** `fo_dest` as the chooser writes it (a lowercase ISO code), anywhere in `document.cookie`. */
export const DEST_COOKIE = /(?:^|;\s*)fo_dest=([a-z]{2})(?:;|$)/;

/** What follows `fo_dest={iso2}` when the URL rule rewrites it: `destCookieHeader()`'s attributes. */
export const DEST_COOKIE_ATTRIBUTES =
  "; Max-Age=15552000; Path=/; SameSite=Lax; Secure";

/** The prices document, as `src/app/api/prices/[locale]/[iso2]/route.ts` serves it. */
export interface PricesDocumentBody {
  readonly iso2: string;
  readonly chooser: string;
  readonly line: string;
  readonly change: string;
  readonly cards: Readonly<
    Record<
      string,
      {
        readonly price: string;
        readonly inclusive: string;
        readonly equivalents: string | null;
      }
    >
  >;
  readonly links: Readonly<Record<string, string>>;
}

/** The route's country, or `""` on a country-less page; `null` when the header is absent. */
function urlCountry(d: Document): string | null {
  return (
    d
      .querySelector("[data-fo-mega-context]")
      ?.getAttribute("data-fo-mega-context")
      ?.toLowerCase() ?? null
  );
}

/** The URL wins (AC-81): an existing `fo_dest` follows the country page being looked at. */
export function followUrlCountry(d: Document): void {
  const remembered = DEST_COOKIE.exec(d.cookie)?.[1];
  const here = urlCountry(d);
  if (remembered && here && /^[a-z]{2}$/.test(here) && here !== remembered) {
    d.cookie = `fo_dest=${here}${DEST_COOKIE_ATTRIBUTES}`;
  }
}

/** Applies a fetched document to a country-less page. Exported for the unit test. */
export function applyPrices(d: Document, body: PricesDocumentBody): void {
  for (const card of d.querySelectorAll<HTMLElement>(
    "[data-fo-product-card]",
  )) {
    const entry = body.cards[card.getAttribute("data-fo-product-card") ?? ""];
    const ask = card.querySelector("[data-fo-card-ask]");
    if (!entry || !ask) continue;
    const strong = d.createElement("strong");
    strong.className = "text-ink";
    strong.textContent = entry.price;
    ask.replaceChildren(strong, ` ${entry.inclusive}`);
    const line = card.querySelector("[data-fo-card-cta]");
    if (line) {
      line.className = "text-ink-muted m-0 mt-[6px] text-xs";
      line.textContent = entry.equivalents ?? " ";
    }
    card.setAttribute("data-fo-product-card-money", "filled");
  }

  const prefix = body.chooser;
  for (const link of d.querySelectorAll<HTMLAnchorElement>(
    `a[href^="${prefix}"]:not([data-fo-change])`,
  )) {
    const href = link.getAttribute("href") ?? "";
    if (href !== prefix && !href.startsWith(`${prefix}/`)) continue;
    const next = href.slice(prefix.length + 1);
    // Already the path form (no `next` shape starts with a two-letter word).
    if (/^[a-z]{2}(\/|$)/.test(next)) continue;
    link.setAttribute(
      "href",
      body.links[next] ?? `${prefix}/${body.iso2}${next ? `/${next}` : ""}`,
    );
  }

  const change =
    d.querySelector("form[data-fo-choose]")?.getAttribute("action") ?? prefix;
  for (const box of d.querySelectorAll(
    "[data-fo-no-money],[data-fo-hub-no-money]",
  )) {
    const link = d.createElement("a");
    link.href = change;
    link.rel = "nofollow";
    link.className =
      "text-link ms-[8px] font-bold underline underline-offset-4";
    link.setAttribute("data-fo-change", "");
    link.textContent = body.change;
    box.replaceChildren(body.line, link);
    box.setAttribute("data-fo-chosen", body.iso2);
  }
}

/** The fill (AC-80): one request after the paint, only with `fo_dest` on a country-less page. */
export async function fillRememberedCountry(
  d: Document,
  load: (url: string) => Promise<Response> = fetch,
): Promise<void> {
  const iso2 = DEST_COOKIE.exec(d.cookie)?.[1];
  if (!iso2 || urlCountry(d) !== "") return;
  const locale = location.pathname.split("/")[1];
  try {
    const response = await load(`${PRICES_ROUTE_PREFIX}/${locale}/${iso2}`);
    if (response.ok)
      applyPrices(d, (await response.json()) as PricesDocumentBody);
  } catch {
    // Offline or a failed document: the page stays exactly as served.
  }
}
