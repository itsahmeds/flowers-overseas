/**
 * The listing pages' JSON-LD scan (spec 008 §2 "Schema", §6, §13 Q5, **AC-17**, **AC-18**; T-17,
 * T-18; TASK-115), shared by the e2e scan over every served listing in every locale
 * (`tests/e2e/schema.spec.ts`), the unit suite that renders each listing type
 * (`tests/unit/catalog-listing-schema.test.tsx`) and the unit suite that proves this scanner bites
 * (`tests/unit/listing-jsonld-scan.test.ts`). One scanner, so the rule the e2e reads is the rule the
 * unit suite mutates.
 *
 * It works on **raw HTML** and imports nothing, because Playwright's loader cannot reach
 * `modules/catalog` (the wall `tests/support/pdp-jsonld-scan.ts` documents) and because a request
 * per page is what lets the e2e visit a thousand listings in seconds.
 *
 * What it reads off the page is what a visitor sees, and what it reads off the JSON-LD is what a
 * crawler is told; a problem is any difference between the two:
 *
 *  - exactly one JSON-LD block, which parses;
 *  - none of AC-18's eight: `Product`, `Offer`, `AggregateOffer`, `Event`, `LocalBusiness`,
 *    `FloristShop` as types, and `aggregateRating`, `review` as keys (their own types too);
 *  - exactly one `BreadcrumbList` whose names are the trail's `<li>`s in order, with an `item`
 *    exactly where the trail links, to the same path;
 *  - an `ItemList` exactly when the page renders cards, whose count, order, names and URLs are
 *    the rendered cards' (AC-17), and which carries no price, image, offer or rating.
 */

/** AC-18's eight, verbatim: six types and two properties, the properties' own types beside them. */
export const LISTING_FORBIDDEN_TYPES = [
  "Product",
  "Offer",
  "AggregateOffer",
  "Event",
  "LocalBusiness",
  "FloristShop",
  "AggregateRating",
  "Review",
] as const;
export const LISTING_FORBIDDEN_PROPERTIES = [
  "aggregateRating",
  "review",
] as const;

/** Keys no `ItemList` entry may carry: it describes an order, not an offer (spec 008 §2). */
const ITEM_LIST_MONEY_KEYS = [
  "price",
  "priceCurrency",
  "offers",
  "image",
] as const;

/** One thing the page shows: its visible name and the path it links to, if it is a link. */
export interface RenderedEntry {
  readonly name: string;
  readonly href: string | undefined;
}

/** React's text escapes, undone (`&#x27;` and friends), so a name compares as the reader sees it. */
export function decodeHtml(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x2F;", "/")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

function textOf(html: string): string {
  return decodeHtml(html.replaceAll(/<[^>]*>/g, " "))
    .replaceAll(/\s+/g, " ")
    .trim();
}

function hrefOf(tag: string): string | undefined {
  const href = /\shref="([^"]*)"/.exec(tag)?.[1];
  return href === undefined ? undefined : decodeHtml(href);
}

/** The breadcrumb trail of the server HTML (spec 008 §14 A16 (d)): one entry per `<li>`. */
export function renderedTrail(html: string): readonly RenderedEntry[] {
  const trail = /<ol[^>]*data-fo-breadcrumb-trail[^>]*>(.*?)<\/ol>/s.exec(
    html,
  )?.[1];
  if (trail === undefined) return [];
  return [...trail.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((item) => {
    const cell = item[1] ?? "";
    return {
      name: textOf(cell),
      href: hrefOf(/<a\s[^>]*>/.exec(cell)?.[0] ?? ""),
    };
  });
}

/**
 * The product cards of the page, in document order: each `<article data-fo-product-card>`'s
 * heading name, and its link where the card is one (`data-fo-product-card-kind="link"`). Each card
 * is cut at the next one, so a card's link is its own.
 */
export function renderedCards(html: string): readonly RenderedEntry[] {
  return html
    .split(/(?=<article[^>]*data-fo-product-card=)/)
    .filter((part) => /^<article[^>]*data-fo-product-card=/.test(part))
    .map((card) => {
      const name = /<h[2-4][^>]*>\s*<bdi>(.*?)<\/bdi>/s.exec(card)?.[1];
      return {
        name: name === undefined ? "" : textOf(name),
        href: /^<article[^>]*data-fo-product-card-kind="link"/.test(card)
          ? hrefOf(/<a\s[^>]*>/.exec(card)?.[0] ?? "")
          : undefined,
      };
    });
}

/**
 * The occasions index's entries, in document order: every link carrying `data-fo-occasion` inside
 * `<main>` (the dated table's names, then both chip groups). The "next six" cards carry
 * `data-fo-next-occasion` and repeat six of them, so they are not read.
 */
export function renderedOccasionEntries(
  html: string,
): readonly RenderedEntry[] {
  const main = /<main[^>]*>(.*)<\/main>/s.exec(html)?.[1] ?? "";
  return [
    ...main.matchAll(/<a([^>]*\sdata-fo-occasion="[^"]*"[^>]*)>(.*?)<\/a>/gs),
  ].map((match) => ({
    name: textOf(match[2] ?? ""),
    href: hrefOf(match[1] ?? ""),
  }));
}

/** Every JSON-LD block of a served document, from its raw HTML. */
export function jsonLdBlocks(html: string): readonly string[] {
  return [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu,
    ),
  ].map((match) => match[1] ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Found {
  readonly nodes: Record<string, unknown>[];
  readonly keys: Set<string>;
}

/** Every node with an `@type`, and every property key, at every depth. */
function walk(value: unknown, found: Found): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, found);
    return;
  }
  if (!isRecord(value)) return;
  if (value["@type"] !== undefined) found.nodes.push(value);
  for (const [key, child] of Object.entries(value)) {
    found.keys.add(key);
    if (key !== "@type") walk(child, found);
  }
}

function typesOf(node: Record<string, unknown>): string[] {
  return [node["@type"]]
    .flat()
    .filter((type): type is string => typeof type === "string");
}

/** A JSON-LD URL as the path the page links, so the check does not depend on the origin. */
function pathOf(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return `relative:${url}`;
  }
}

function entriesOf(node: Record<string, unknown> | undefined): unknown[] {
  const list = node?.["itemListElement"];
  return Array.isArray(list) ? list : [];
}

/** Which rendered entries a listing's `ItemList` must equal. */
export type ListingKind = "cards" | "occasions";

/**
 * What is wrong with one served listing under AC-17 and AC-18. Empty means it holds.
 *
 * `kind` names what the page lists: product cards (the five product listings) or the occasions
 * index's hub entries.
 */
export function listingJsonLdProblems(
  html: string,
  where: string,
  kind: ListingKind,
): string[] {
  const blocks = jsonLdBlocks(html);
  const problems: string[] = [];
  if (blocks.length !== 1) {
    problems.push(
      `${where}: ${String(blocks.length)} JSON-LD blocks, expected 1`,
    );
  }
  const found: Found = { nodes: [], keys: new Set() };
  for (const block of blocks) {
    try {
      walk(JSON.parse(block) as unknown, found);
    } catch {
      problems.push(`${where}: a JSON-LD block does not parse`);
    }
  }
  const types = found.nodes.flatMap(typesOf);
  for (const type of LISTING_FORBIDDEN_TYPES) {
    if (types.includes(type)) problems.push(`${where}: @type ${type}`);
  }
  for (const property of LISTING_FORBIDDEN_PROPERTIES) {
    if (found.keys.has(property)) problems.push(`${where}: ${property}`);
  }

  // The trail.
  const breadcrumbs = found.nodes.filter((node) =>
    typesOf(node).includes("BreadcrumbList"),
  );
  if (breadcrumbs.length !== 1) {
    problems.push(
      `${where}: ${String(breadcrumbs.length)} BreadcrumbList, expected 1`,
    );
  }
  const trail = renderedTrail(html);
  const crumbs = entriesOf(breadcrumbs[0]);
  const shownTrail = trail.map((crumb) => [crumb.name, crumb.href]);
  const toldTrail = crumbs.map((crumb) =>
    isRecord(crumb) ? [crumb["name"], pathOf(crumb["item"])] : [crumb],
  );
  if (JSON.stringify(shownTrail) !== JSON.stringify(toldTrail)) {
    problems.push(
      `${where}: BreadcrumbList ${JSON.stringify(toldTrail)} is not the visible trail ${JSON.stringify(shownTrail)}`,
    );
  }

  // The list.
  const rendered =
    kind === "occasions" ? renderedOccasionEntries(html) : renderedCards(html);
  const lists = found.nodes.filter((node) =>
    typesOf(node).includes("ItemList"),
  );
  if (lists.length !== (rendered.length === 0 ? 0 : 1)) {
    problems.push(
      `${where}: ${String(lists.length)} ItemList for ${String(rendered.length)} rendered entries`,
    );
  }
  const list = lists[0];
  const items = entriesOf(list);
  const shown = rendered.map((entry, index) => [
    index + 1,
    entry.name,
    entry.href,
  ]);
  const told = items.map((item) =>
    isRecord(item)
      ? [item["position"], item["name"], pathOf(item["url"])]
      : [item],
  );
  if (list !== undefined && JSON.stringify(shown) !== JSON.stringify(told)) {
    problems.push(
      `${where}: ItemList ${JSON.stringify(told)} is not the rendered cards ${JSON.stringify(shown)}`,
    );
  }
  if (list !== undefined && list["numberOfItems"] !== rendered.length) {
    problems.push(
      `${where}: ItemList.numberOfItems ${JSON.stringify(list["numberOfItems"])} for ${String(rendered.length)} rendered entries`,
    );
  }
  for (const item of items) {
    for (const key of ITEM_LIST_MONEY_KEYS) {
      if (isRecord(item) && key in item) {
        problems.push(`${where}: an ItemList entry carries ${key}`);
      }
    }
  }
  return problems;
}
