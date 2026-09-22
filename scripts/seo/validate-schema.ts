/**
 * `validate-schema` (spec 001 §2 "CI", §6, §8, AC-22 / T-23, TASK-009).
 *
 * Over `tests/fixtures/seo/schema/*.json` (or `--dir <path>`), fixture shape:
 *
 * ```json
 * { "jsonld": { "@context": "https://schema.org", "@type": "Product", … },
 *   "visiblePrice": "49.00", "visibleCurrency": "EUR" }
 * ```
 *
 * `jsonld` is one node, an array of nodes, or a `@graph`; the walk handles all three and every
 * depth.
 *
 * Checks:
 *
 * 1. the fixture is valid JSON and matches the shape above (zod);
 * 2. every `@type` — nested, in arrays, inside `@graph`, and `@type` arrays — is in the
 *    allow-list derived from the `plan/02` §9 table (see `ALLOWED_TYPES`), and the three types
 *    that table forbids by name are rejected with the reason it gives;
 * 3. `Offer.price` equals the fixture's `visiblePrice` and `Offer.priceCurrency` equals
 *    `visibleCurrency` when one is given (`CLAUDE.md`: "Schema price = visible price";
 *    `plan/07` §4: price shown = price charged).
 *
 * Money is compared as strings normalised to two fraction digits — never parsed into a `number`
 * (`plan/12` §2, `fo/no-float-money`): `49.10` and `49.1` are the same price, `49.1` and `49.9`
 * are not, and no float ever gets the chance to make that call. `visiblePrice` may use the
 * locale's comma (`49,90`); `Offer.price` may not, because schema.org requires `.`.
 *
 * Usage: `node scripts/seo/validate-schema.ts [--dir tests/fixtures/seo/schema]`
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

import {
  exitWith,
  formatZodError,
  hasCommaDecimalSeparator,
  isMainModule,
  normaliseMoney,
  runValidator,
  type FixtureProblem,
} from "./lib.ts";

export const DEFAULT_DIR = "tests/fixtures/seo/schema";

/**
 * The schema.org types this site may emit, derived row by row from the `plan/02` §9 table:
 * the types the table names, plus the types those nest. Anything else is a fabrication risk
 * (structured data that describes something we are not), so the default is "no".
 *
 * | plan/02 §9 row | types |
 * |---|---|
 * | Every page / home | `BreadcrumbList` (+ `ListItem`), `WebSite`, `SearchAction` (+ `EntryPoint`) |
 * | Home / about, reviews page | `Organization` (+ `ContactPoint`, `PostalAddress`, `ImageObject` logo) |
 * | Product (country-scoped) | `Product` (+ `Brand`, `ImageObject`), one `Offer` (+ `MonetaryAmount` shippingRate), `OfferShippingDetails`, `DefinedRegion`, `ShippingDeliveryTime` (+ `QuantitativeValue`, `OpeningHoursSpecification` businessDays), `MerchantReturnPolicy` |
 * | Product with >= 3 verified reviews | `AggregateRating`, `Review` (+ `Rating`, `Person` author) |
 * | Corridor / occasion / FAQ | `FAQPage` (+ `Question`, `Answer`) |
 * | Blog | `BlogPosting` (+ `Person` author, `ImageObject`) |
 * | For florists | `WebPage`, `FAQPage` |
 */
export const ALLOWED_TYPES: readonly string[] = [
  "AggregateRating",
  "Answer",
  "BlogPosting",
  "Brand",
  "BreadcrumbList",
  "ContactPoint",
  "DefinedRegion",
  "EntryPoint",
  "FAQPage",
  "ImageObject",
  "ListItem",
  "MerchantReturnPolicy",
  "MonetaryAmount",
  "Offer",
  "OfferShippingDetails",
  "OpeningHoursSpecification",
  "Organization",
  "Person",
  "PostalAddress",
  "Product",
  // `Question` is the mandatory child of every `FAQPage` (`mainEntity`), and the table above has
  // always named it; it was missing from this list until the first real `FAQPage` fixture was
  // written against it (TASK-093). Its absence was an oversight in the transcription, not a
  // policy — `plan/02` §9 authorises `FAQPage` "for visible Q&A only", and a `FAQPage` without
  // `Question`/`Answer` children is not a valid one.
  "Question",
  "QuantitativeValue",
  "Rating",
  "Review",
  "SearchAction",
  "ShippingDeliveryTime",
  "WebPage",
  "WebSite",
];

/**
 * Types `plan/02` §9 forbids explicitly, with the reason, so the failure message teaches instead
 * of just saying "not allowed". They would also fail the allow-list; the point is the wording.
 */
export const FORBIDDEN_TYPES: Readonly<Record<string, string>> = {
  LocalBusiness:
    "we are not a local business (plan/02 §9: misleading structured data risks a manual action)",
  FloristShop:
    "per-city florist entities would be fabricated (plan/02 §9: never per-city FloristShop)",
  JobPosting:
    "florist onboarding is a partnership, not employment (plan/02 §9: 'For florists' is WebPage + FAQPage)",
};

export const schemaFixtureSchema = z.object({
  jsonld: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  visiblePrice: z.string().min(1).optional(),
  visibleCurrency: z.string().min(1).optional(),
});

export type SchemaFixture = z.infer<typeof schemaFixtureSchema>;

export interface TypedNode {
  /** Breadcrumb of the node inside `jsonld`, e.g. `jsonld.@graph[1].offers`. */
  readonly path: string;
  readonly types: readonly string[];
  readonly node: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

/** Every node carrying an `@type`, at any depth, including inside arrays and `@graph`. */
export function collectTypedNodes(
  value: unknown,
  path = "jsonld",
): TypedNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectTypedNodes(entry, `${path}[${String(index)}]`),
    );
  }
  if (!isRecord(value)) return [];
  const found: TypedNode[] = [];
  const types = typesOf(value["@type"]);
  if (types.length > 0) found.push({ path, types, node: value });
  for (const [key, child] of Object.entries(value)) {
    if (key === "@type") continue;
    found.push(...collectTypedNodes(child, `${path}.${key}`));
  }
  return found;
}

/** The reason a `@type` is unacceptable, or `null`. */
export function typeProblem(type: string): string | null {
  const forbidden = FORBIDDEN_TYPES[type];
  if (forbidden !== undefined) {
    return `@type ${type} is forbidden: ${forbidden}`;
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return `@type ${type} is not in the plan/02 §9 allow-list (add the type to plan/02 §9 first, then to ALLOWED_TYPES)`;
  }
  return null;
}

/**
 * Properties whose value is a URL. A relative URL in JSON-LD resolves against the document's
 * `@context` base, not against the page that carries it, so `/icon.svg` names no logo and `/en`
 * names no breadcrumb target — the claim silently evaporates. Every builder in
 * `src/modules/seo/schema/` goes through `absoluteUrl()` for exactly this reason; this is the gate
 * that keeps it true of whatever a later spec adds.
 */
export const URL_PROPERTIES: readonly string[] = [
  "item",
  "logo",
  "merchantReturnLink",
  "sameAs",
  "url",
];

/**
 * The properties a node of each type must carry to be the thing it says it is.
 *
 * Derived from the `plan/02` §9 table the same way `ALLOWED_TYPES` is — the Organization row names
 * `name`, `url`, `logo`; the corridor row's "markup stays valid" is the FAQ requirement — plus the
 * cardinalities schema.org fixes for the types themselves (a `Question` without an `acceptedAnswer`
 * is not a Question; a `BreadcrumbList` is an ordered list from 1).
 *
 * **`Product` and `Offer` are deliberately absent.** Their row is spec 009's and their builder is
 * TASK-130's; requiring `sku` or `image[]` here would make this task legislate for one that has not
 * been written, and would fail a fixture whose author never agreed to the rule. `Offer` already has
 * the price gate below, which is the rule `CLAUDE.md` actually states.
 */
export const REQUIRED_PROPERTIES: Readonly<Record<string, readonly string[]>> =
  {
    Answer: ["text"],
    ListItem: ["name"],
    Organization: ["name", "url", "logo"],
    Question: ["name", "acceptedAnswer"],
    WebSite: ["name", "url"],
  };

/** The smallest trail worth announcing — a parent and the page (`breadcrumbList.ts`'s own rule). */
const BREADCRUMB_MIN_ITEMS = 2;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** `BreadcrumbList` problems: an ordered, named trail of at least two crumbs. */
function breadcrumbProblems(node: Readonly<Record<string, unknown>>): string[] {
  const items = node["itemListElement"];
  if (!Array.isArray(items) || items.length < BREADCRUMB_MIN_ITEMS) {
    return [
      `BreadcrumbList.itemListElement must be an array of at least ${String(BREADCRUMB_MIN_ITEMS)} ListItem (one crumb is not a trail: it tells a crawler the page's parent is itself)`,
    ];
  }
  const problems: string[] = [];
  items.forEach((entry, index) => {
    const expected = index + 1;
    if (!isRecord(entry)) {
      problems.push(
        `BreadcrumbList.itemListElement[${String(index)}] is not a ListItem object`,
      );
      return;
    }
    if (!typesOf(entry["@type"]).includes("ListItem")) {
      problems.push(
        `BreadcrumbList.itemListElement[${String(index)}] has no @type ListItem`,
      );
    }
    const position = entry["position"];
    if (position !== expected) {
      problems.push(
        `BreadcrumbList.itemListElement[${String(index)}].position is ${JSON.stringify(position)}, expected ${String(expected)} (positions must run 1..n in the order the trail is shown)`,
      );
    }
  });
  return problems;
}

/** `FAQPage` problems: at least one `Question`, each of them a real question. */
function faqPageProblems(node: Readonly<Record<string, unknown>>): string[] {
  const entities = node["mainEntity"];
  if (!Array.isArray(entities) || entities.length === 0) {
    return [
      "FAQPage.mainEntity must be a non-empty array of Question (a FAQPage that marks up no question describes nothing the page shows)",
    ];
  }
  return entities.flatMap((entry, index) =>
    isRecord(entry) && typesOf(entry["@type"]).includes("Question")
      ? []
      : [`FAQPage.mainEntity[${String(index)}] is not a Question`],
  );
}

/**
 * Everything wrong with the *shape* of one node, as opposed to its `@type` (`typeProblem`).
 *
 * Google's rich-result requirements and schema.org's own definitions are the source; the point is
 * that the committed fixtures are regenerated from the builders, so a builder that emitted a
 * nameless crumb or an answerless question would agree with itself in every other gate. This is
 * the gate that does not take the document's word for it.
 */
export function shapeProblems(node: TypedNode): string[] {
  const problems: string[] = [];

  for (const type of node.types) {
    for (const property of REQUIRED_PROPERTIES[type] ?? []) {
      const value = node.node[property];
      const missing = isRecord(value)
        ? Object.keys(value).length === 0
        : !isNonEmptyString(value);
      if (missing) {
        problems.push(
          `${type} requires a non-empty ${property} (plan/02 §9), and has ${JSON.stringify(value)}`,
        );
      }
    }
    if (type === "BreadcrumbList")
      problems.push(...breadcrumbProblems(node.node));
    if (type === "FAQPage") problems.push(...faqPageProblems(node.node));
  }

  for (const property of URL_PROPERTIES) {
    const value = node.node[property];
    const urls = typeof value === "string" ? [value] : [];
    for (const url of urls) {
      if (!isAbsoluteHttpUrl(url)) {
        problems.push(
          `${property} ${JSON.stringify(url)} is not an absolute http(s) URL (a relative URL in JSON-LD resolves against the @context, not the page, so it names nothing)`,
        );
      }
    }
  }

  return problems;
}

/** Price/currency problems of one fixture, comparing `Offer` nodes with the visible values. */
export function offerProblems(
  fixture: SchemaFixture,
  nodes: readonly TypedNode[],
): string[] {
  const problems: string[] = [];
  const offers = nodes.filter((node) => node.types.includes("Offer"));
  const { visiblePrice, visibleCurrency } = fixture;

  const expectedPrice =
    visiblePrice === undefined ? null : normaliseMoney(visiblePrice);
  if (visiblePrice !== undefined && expectedPrice === null) {
    problems.push(
      `visiblePrice ${JSON.stringify(visiblePrice)} is not a plain decimal string (expected e.g. "49" or "49.00")`,
    );
  }

  let pricesSeen = 0;
  for (const offer of offers) {
    const price = offer.node["price"];
    const currency = offer.node["priceCurrency"];

    if (price !== undefined) {
      pricesSeen += 1;
      if (typeof price !== "string") {
        problems.push(
          `${offer.path}: Offer.price must be a JSON string, not ${typeof price} (a float loses cents; plan/12 §2)`,
        );
      } else {
        const actual = normaliseMoney(price);
        if (actual === null) {
          problems.push(
            `${offer.path}: Offer.price ${JSON.stringify(price)} is not a plain decimal string`,
          );
        } else if (hasCommaDecimalSeparator(price)) {
          // Rejected even when it equals `visiblePrice`: schema.org consumers may read the comma
          // as a thousands separator, so `49,90` is a mis-priced Offer, not a formatting nit.
          problems.push(
            `${offer.path}: Offer.price ${JSON.stringify(price)} uses a comma decimal separator; schema.org requires "." (write ${JSON.stringify(actual)} — visiblePrice may keep the locale's comma)`,
          );
        } else if (visiblePrice === undefined) {
          problems.push(
            `${offer.path}: Offer.price is ${price} but the fixture declares no visiblePrice, so "schema price = visible price" cannot be proven`,
          );
        } else if (expectedPrice !== null && actual !== expectedPrice) {
          problems.push(
            `${offer.path}: Offer.price ${price} (normalised ${actual}) does not equal visiblePrice ${visiblePrice} (normalised ${expectedPrice})`,
          );
        }
      }
    }

    if (visibleCurrency !== undefined) {
      if (typeof currency !== "string") {
        problems.push(
          `${offer.path}: Offer.priceCurrency is missing but the fixture declares visibleCurrency ${visibleCurrency}`,
        );
      } else if (
        currency.trim().toUpperCase() !== visibleCurrency.trim().toUpperCase()
      ) {
        problems.push(
          `${offer.path}: Offer.priceCurrency ${currency} does not equal visibleCurrency ${visibleCurrency}`,
        );
      }
    }
  }

  if (visiblePrice !== undefined && pricesSeen === 0) {
    problems.push(
      `declares visiblePrice ${visiblePrice} but no Offer with a price was found`,
    );
  }
  return problems;
}

export function validateSchemaFile(
  path: string,
  file: string,
): readonly FixtureProblem[] {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return [
      {
        file,
        reason: `is not valid JSON, so the JSON-LD cannot parse (${(error as Error).message})`,
      },
    ];
  }
  const parsed = schemaFixtureSchema.safeParse(data);
  if (!parsed.success) {
    return [
      {
        file,
        reason: `does not match the schema fixture shape (${formatZodError(parsed.error)})`,
      },
    ];
  }

  const nodes = collectTypedNodes(parsed.data.jsonld);
  const problems: FixtureProblem[] = [];
  if (nodes.length === 0) {
    problems.push({ file, reason: "contains no node with an @type" });
  }
  for (const node of nodes) {
    for (const type of node.types) {
      const reason = typeProblem(type);
      if (reason !== null)
        problems.push({ file, reason: `${node.path}: ${reason}` });
    }
    for (const reason of shapeProblems(node)) {
      problems.push({ file, reason: `${node.path}: ${reason}` });
    }
  }
  for (const reason of offerProblems(parsed.data, nodes)) {
    problems.push({ file, reason });
  }
  return problems;
}

export function main(argv: readonly string[]): number {
  return runValidator(
    {
      name: "validate-schema",
      defaultDir: DEFAULT_DIR,
      extension: ".json",
      validateFile: validateSchemaFile,
    },
    argv,
  );
}

if (isMainModule(import.meta.url)) exitWith(main(process.argv.slice(2)));
