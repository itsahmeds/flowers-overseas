/**
 * AC-18's JSON-LD type scan for the product page (spec 009 §6, AC-18, T-18; TASK-130), shared by
 * the e2e scan over every served PDP (`tests/e2e/schema.spec.ts`) and the unit suite that proves
 * the scanner bites (`tests/unit/catalog-product-schema.test.tsx`). One scanner, so the list the
 * e2e reads is the list the unit suite plants into: shortening it turns the unit case red.
 *
 * It imports nothing, because Playwright's loader cannot reach `modules/catalog` (the wall
 * `tests/support/shop-crawl-targets.ts` documents).
 */

/**
 * AC-18's eight, verbatim: "No PDP emits `Product`, `Offer`, `AggregateOffer`, `aggregateRating`,
 * `review`, `Event`, `LocalBusiness` or `FloristShop`". Six are types; `aggregateRating` and
 * `review` are properties, matched as keys, and their own types are refused beside them.
 */
export const PDP_FORBIDDEN_TYPES = [
  "Product",
  "Offer",
  "AggregateOffer",
  "Event",
  "LocalBusiness",
  "FloristShop",
  "AggregateRating",
  "Review",
] as const;
export const PDP_FORBIDDEN_PROPERTIES = ["aggregateRating", "review"] as const;

/**
 * Spec 009 AC-36: no JSON-LD `name` carries U+2014, a spaced hyphen or a spaced U+2013. The
 * breadcrumb's names are the trail's (country, category, product), so every served PDP is checked.
 */
const DASH_IN_NAME = /\u2014|\s[-\u2013]|[-\u2013]\s/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `@type` (string or array) and every property key, at every depth. */
function walk(
  value: unknown,
  found: { types: string[]; keys: Set<string>; names: string[] },
): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, found);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    found.keys.add(key);
    if (key === "name" && typeof child === "string") found.names.push(child);
    if (key === "@type") {
      for (const type of [child].flat()) {
        if (typeof type === "string") found.types.push(type);
      }
    } else {
      walk(child, found);
    }
  }
}

/** Every JSON-LD block of a served document, from its raw HTML. */
export function jsonLdBlocks(html: string): readonly string[] {
  return [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu,
    ),
  ].map((match) => match[1] ?? "");
}

/**
 * What is wrong with one PDP's served HTML under AC-18 in Phase 0: anything but exactly one
 * JSON-LD block carrying exactly one `BreadcrumbList`, any of the eight, and any `name` with a
 * forbidden dash (AC-36). Empty means it holds.
 */
export function pdpJsonLdProblems(html: string, where: string): string[] {
  const blocks = jsonLdBlocks(html);
  const problems: string[] = [];
  if (blocks.length !== 1) {
    problems.push(
      `${where}: ${String(blocks.length)} JSON-LD blocks, expected 1`,
    );
  }
  const found = {
    types: [] as string[],
    keys: new Set<string>(),
    names: [] as string[],
  };
  for (const block of blocks) {
    try {
      walk(JSON.parse(block) as unknown, found);
    } catch {
      problems.push(`${where}: a JSON-LD block does not parse`);
    }
  }
  if (found.types.filter((type) => type === "BreadcrumbList").length !== 1) {
    problems.push(`${where}: no single BreadcrumbList`);
  }
  for (const type of PDP_FORBIDDEN_TYPES) {
    if (found.types.includes(type)) problems.push(`${where}: @type ${type}`);
  }
  for (const property of PDP_FORBIDDEN_PROPERTIES) {
    if (found.keys.has(property)) problems.push(`${where}: ${property}`);
  }
  for (const name of found.names) {
    if (DASH_IN_NAME.test(name)) {
      problems.push(
        `${where}: name ${JSON.stringify(name)} carries a dash (AC-36)`,
      );
    }
  }
  return problems;
}
