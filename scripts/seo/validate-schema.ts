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
 * are not, and no float ever gets the chance to make that call.
 *
 * Usage: `node scripts/seo/validate-schema.ts [--dir tests/fixtures/seo/schema]`
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

import {
  exitWith,
  formatZodError,
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
