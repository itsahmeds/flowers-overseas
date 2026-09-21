/**
 * T-23 / AC-22 (TASK-009): `validate-schema`. AC-22 names `schema/bad-price-mismatch.json`
 * ("`Offer.price` != `visiblePrice`") explicitly, so the case is copied in under that name.
 *
 * The allow-list assertions are the executable form of the `plan/02` §9 table: they pin the types
 * the table names and the three it forbids by name, so widening the list is a deliberate edit
 * with a failing test in front of it.
 */
import { describe, expect, it } from "vitest";

import {
  hasCommaDecimalSeparator,
  normaliseMoney,
} from "../../scripts/seo/lib";
import {
  ALLOWED_TYPES,
  collectTypedNodes,
  FORBIDDEN_TYPES,
  offerProblems,
  schemaFixtureSchema,
  shapeProblems,
  typeProblem,
} from "../../scripts/seo/validate-schema";
import { runSeoCli, withEmptyDir, withFixtureDir } from "./support/seo-cli";

const CLI = "validate-schema.ts";

describe("validate-schema CLI (T-23)", () => {
  it("exits 0 with 'no fixtures' on an empty directory", () => {
    const result = withEmptyDir((dir) => runSeoCli(CLI, dir));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no fixtures");
  });

  it("exits 0 over the committed fixture directory, which is no longer empty", () => {
    // Empty until spec 005 (TASK-069) seeded it with one real `offerProjection()` graph
    // (`/review 52`): the gate used to pass by having nothing to check, and now passes by
    // checking something. `catalog-offer-schema-identity.test.ts` keeps that fixture honest.
    const result = runSeoCli(CLI, "tests/fixtures/seo/schema");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fixture(s) ok");
    expect(result.stdout).not.toContain("no fixtures");
  });

  it("exits 0 on a Product/Offer graph whose price matches the visible price", () => {
    const result = withFixtureDir({ "good-schema.json": "pdp.json" }, (dir) =>
      runSeoCli(CLI, dir),
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 fixture(s) ok");
  });

  it("fails on bad-price-mismatch.json, naming the file (AC-22)", () => {
    const result = withFixtureDir(
      { "bad-price-mismatch.json": "bad-price-mismatch.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-price-mismatch.json");
    expect(result.stderr).toContain("does not equal visiblePrice");
  });

  it("fails when priceCurrency does not equal visibleCurrency", () => {
    const result = withFixtureDir(
      { "bad-currency-mismatch.json": "bad-currency-mismatch.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-currency-mismatch.json");
    expect(result.stderr).toContain("does not equal visibleCurrency");
  });

  it("fails on an Offer.price written with a comma, naming the file", () => {
    const result = withFixtureDir(
      { "bad-price-comma.json": "bad-price-comma.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-price-comma.json");
    expect(result.stderr).toContain("comma decimal separator");
  });

  it("fails on a forbidden @type with the plan/02 §9 reason", () => {
    const result = withFixtureDir(
      { "bad-forbidden-type.json": "bad-forbidden-type.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-forbidden-type.json");
    expect(result.stderr).toContain("@type LocalBusiness is forbidden");
    expect(result.stderr).toContain("we are not a local business");
  });

  it("fails on a @type outside the allow-list, including inside a @type array", () => {
    const result = withFixtureDir(
      { "bad-unknown-type.json": "bad-unknown-type.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-unknown-type.json");
    expect(result.stderr).toContain("@type SoftwareApplication is not in the");
  });

  it("fails when the JSON-LD does not parse", () => {
    const result = withFixtureDir(
      { "bad-schema-malformed.json": "bad-schema-malformed.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-schema-malformed.json");
    expect(result.stderr).toContain("JSON-LD cannot parse");
  });
});

describe("@type allow-list (plan/02 §9)", () => {
  it("contains every type the plan/02 §9 table names", () => {
    for (const type of [
      "BreadcrumbList",
      "WebSite",
      "SearchAction",
      "Organization",
      "Product",
      "Offer",
      "OfferShippingDetails",
      "DefinedRegion",
      "ShippingDeliveryTime",
      "MerchantReturnPolicy",
      "AggregateRating",
      "Review",
      "FAQPage",
      // The two children a valid `FAQPage` must have (TASK-093's corridor fixtures).
      "Question",
      "Answer",
      "BlogPosting",
      "WebPage",
    ]) {
      expect(ALLOWED_TYPES, type).toContain(type);
    }
  });

  it("rejects the three types plan/02 §9 forbids by name", () => {
    for (const type of ["LocalBusiness", "FloristShop", "JobPosting"]) {
      expect(ALLOWED_TYPES).not.toContain(type);
      expect(Object.keys(FORBIDDEN_TYPES)).toContain(type);
      expect(typeProblem(type)).toContain("is forbidden");
    }
  });

  it("rejects any other type with a pointer to plan/02 §9", () => {
    expect(typeProblem("SoftwareApplication")).toContain(
      "not in the plan/02 §9 allow-list",
    );
    expect(typeProblem("Product")).toBeNull();
  });

  it("finds @type at every depth: nested, arrays and @graph", () => {
    const nodes = collectTypedNodes({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", potentialAction: { "@type": "SearchAction" } },
        {
          "@type": ["Product", "Offer"],
          review: [{ "@type": "Review", reviewRating: { "@type": "Rating" } }],
        },
      ],
    });
    expect(nodes.flatMap((node) => node.types)).toEqual([
      "WebSite",
      "SearchAction",
      "Product",
      "Offer",
      "Review",
      "Rating",
    ]);
    expect(nodes.map((node) => node.path)).toEqual([
      "jsonld.@graph[0]",
      "jsonld.@graph[0].potentialAction",
      "jsonld.@graph[1]",
      "jsonld.@graph[1].review[0]",
      "jsonld.@graph[1].review[0].reviewRating",
    ]);
  });
});

describe("Offer.price == visiblePrice", () => {
  const nodesOf = (jsonld: unknown, extra: Record<string, string> = {}) => {
    const fixture = schemaFixtureSchema.parse({ jsonld, ...extra });
    return { fixture, nodes: collectTypedNodes(fixture.jsonld) };
  };

  it("compares as strings normalised to two fraction digits, never as floats", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: "49.1", priceCurrency: "eur" },
      { visiblePrice: "49.10", visibleCurrency: "EUR" },
    );
    expect(offerProblems(fixture, nodes)).toEqual([]);
  });

  it("reports a mismatch with both the raw and the normalised values", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: "44.00" },
      { visiblePrice: "49" },
    );
    expect(offerProblems(fixture, nodes)).toEqual([
      "jsonld: Offer.price 44.00 (normalised 44.00) does not equal visiblePrice 49 (normalised 49.00)",
    ]);
  });

  it("rejects a numeric price outright: a float cannot be trusted with cents", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: 49.1 },
      { visiblePrice: "49.10" },
    );
    expect(offerProblems(fixture, nodes)[0]).toContain(
      "must be a JSON string, not number",
    );
  });

  it("refuses an Offer.price that no visiblePrice backs", () => {
    const { fixture, nodes } = nodesOf({ "@type": "Offer", price: "49.00" });
    expect(offerProblems(fixture, nodes)[0]).toContain(
      "the fixture declares no visiblePrice",
    );
  });

  it("refuses a visiblePrice that no Offer carries", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Product", name: "x" },
      { visiblePrice: "49.00" },
    );
    expect(offerProblems(fixture, nodes)).toEqual([
      "declares visiblePrice 49.00 but no Offer with a price was found",
    ]);
  });

  it("rejects a comma decimal separator in Offer.price: schema.org requires '.'", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: "49,90" },
      { visiblePrice: "49,90" },
    );
    const problems = offerProblems(fixture, nodes);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("comma decimal separator");
    expect(problems[0]).toContain('write "49.90"');
  });

  it("still accepts a comma in the fixture's own visiblePrice", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: "49.90" },
      { visiblePrice: "49,90" },
    );
    expect(offerProblems(fixture, nodes)).toEqual([]);
  });

  it("requires priceCurrency once the fixture declares a visible currency", () => {
    const { fixture, nodes } = nodesOf(
      { "@type": "Offer", price: "49.00" },
      { visiblePrice: "49.00", visibleCurrency: "EUR" },
    );
    expect(offerProblems(fixture, nodes)[0]).toContain(
      "Offer.priceCurrency is missing",
    );
  });
});

describe("normaliseMoney (fo/no-float-money in spirit)", () => {
  it("pads to two fraction digits without arithmetic", () => {
    expect(normaliseMoney("49")).toBe("49.00");
    expect(normaliseMoney("49.1")).toBe("49.10");
    expect(normaliseMoney(" 49,50 ")).toBe("49.50");
    expect(normaliseMoney("0.10")).toBe("0.10");
  });

  it("distinguishes cents that a float would round together", () => {
    expect(normaliseMoney("0.1")).not.toBe(normaliseMoney("0.11"));
    expect(normaliseMoney("1.10")).toBe(normaliseMoney("1.1"));
  });

  it("treats a comma and a dot separator as the same amount", () => {
    expect(normaliseMoney("49,90")).toBe(normaliseMoney("49.90"));
  });

  it("rejects grouped separators, three-decimal and non-numeric input", () => {
    expect(normaliseMoney("1,234")).toBeNull();
    expect(normaliseMoney("1234.567")).toBeNull();
    expect(normaliseMoney("EUR 49")).toBeNull();
    expect(normaliseMoney("-49.00")).toBeNull();
    expect(normaliseMoney("")).toBeNull();
  });
});

describe("hasCommaDecimalSeparator (schema.org requires '.')", () => {
  it("is true only for a comma-separated decimal", () => {
    expect(hasCommaDecimalSeparator("49,90")).toBe(true);
    expect(hasCommaDecimalSeparator(" 49,9 ")).toBe(true);
    expect(hasCommaDecimalSeparator("49.90")).toBe(false);
    expect(hasCommaDecimalSeparator("49")).toBe(false);
    // Rejected by `normaliseMoney` already; not this predicate's business to relabel it.
    expect(hasCommaDecimalSeparator("1,234")).toBe(false);
  });
});

/**
 * The required-shape half of the gate (TASK-093, spec 007 AC-15).
 *
 * The allow-list above proves a document names no type we may not emit. It says nothing about
 * whether the node is a *valid* one: before these cases, a `BreadcrumbList` whose positions ran
 * `0, 7`, whose first `ListItem` had no `name` and whose `item` was the relative `/en`, and a
 * `Question` with no `acceptedAnswer`, all passed `pnpm seo:validate` with "1 fixture(s) ok".
 * Since the committed fixtures are regenerated from the builders, a builder defect of that kind
 * would have agreed with itself in every gate we had.
 *
 * The rules are the `plan/02` §9 table read a second way — the row names `Organization`'s
 * `name`/`url`/`logo`, and "markup stays valid" is the FAQ row's own wording — plus the property
 * cardinalities schema.org fixes for the types themselves. `Product` and `Offer` are deliberately
 * **not** given required properties here: their row is spec 009's (TASK-130's), and inventing the
 * requirement before the builder exists would be this task legislating for another.
 */
describe("required shape, not just allowed types (AC-15)", () => {
  const shapeOf = (jsonld: unknown): string[] =>
    collectTypedNodes(jsonld).flatMap((node) => shapeProblems(node));

  it("accepts the shapes the builders actually emit", () => {
    expect(
      shapeOf({
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://flowersoverseas.com/en",
              },
              { "@type": "ListItem", position: 2, name: "Poland" },
            ],
          },
          {
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Do you deliver to Poland?",
                acceptedAnswer: { "@type": "Answer", text: "Yes." },
              },
            ],
          },
          {
            "@type": "Organization",
            name: "Flowers Overseas",
            url: "https://flowersoverseas.com",
            logo: "https://flowersoverseas.com/icon.svg",
          },
          {
            "@type": "WebSite",
            name: "Flowers Overseas",
            url: "https://flowersoverseas.com",
          },
        ],
      }),
    ).toStrictEqual([]);
  });

  it("rejects breadcrumb positions that are not 1..n in order", () => {
    const problems = shapeOf({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" },
        { "@type": "ListItem", position: 7, name: "Poland" },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("position");
    expect(problems[0]).toContain("7");
  });

  it("rejects a ListItem with no name: an unnamed crumb shows nothing", () => {
    expect(
      shapeOf({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, item: "https://x.test/en" },
          { "@type": "ListItem", position: 2, name: "Poland" },
        ],
      }).join(" "),
    ).toContain("name");
  });

  it("rejects an empty or single-item BreadcrumbList", () => {
    expect(
      shapeOf({ "@type": "BreadcrumbList", itemListElement: [] }).join(" "),
    ).toContain("itemListElement");
    expect(
      shapeOf({
        "@type": "BreadcrumbList",
        itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }],
      }).join(" "),
    ).toContain("itemListElement");
  });

  it("rejects a Question with no acceptedAnswer, and an Answer with no text", () => {
    expect(
      shapeOf({
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: "Where?" }],
      }).join(" "),
    ).toContain("acceptedAnswer");
    expect(
      shapeOf({
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Where?",
            acceptedAnswer: { "@type": "Answer", text: "   " },
          },
        ],
      }).join(" "),
    ).toContain("text");
  });

  it("rejects a FAQPage with no mainEntity at all", () => {
    expect(shapeOf({ "@type": "FAQPage" }).join(" ")).toContain("mainEntity");
  });

  it("requires Organization's name, url and logo — the three plan/02 §9 names", () => {
    const problems = shapeOf({ "@type": "Organization" }).join(" ");
    for (const property of ["name", "url", "logo"]) {
      expect(problems).toContain(property);
    }
  });

  it("requires WebSite's name and url", () => {
    const problems = shapeOf({ "@type": "WebSite" }).join(" ");
    expect(problems).toContain("name");
    expect(problems).toContain("url");
  });

  it("rejects a relative URL in any URL-valued property", () => {
    // A relative URL in JSON-LD resolves against the @context's base, not the page: `/icon.svg`
    // is not the logo, it is nothing.
    expect(
      shapeOf({
        "@type": "Organization",
        name: "Flowers Overseas",
        url: "https://flowersoverseas.com",
        logo: "/icon.svg",
      }).join(" "),
    ).toContain("logo");
    expect(
      shapeOf({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "/en" },
          { "@type": "ListItem", position: 2, name: "Poland" },
        ],
      }).join(" "),
    ).toContain("item");
  });

  it("leaves Product and Offer to spec 009: no required property is invented here", () => {
    expect(shapeOf({ "@type": "Product" })).toStrictEqual([]);
    expect(shapeOf({ "@type": "Offer" })).toStrictEqual([]);
  });
});

describe("the required-shape gate fails the CLI, not just the unit test (AC-15)", () => {
  it("fails on a BreadcrumbList whose positions and names are wrong", () => {
    const result = withFixtureDir(
      { "bad-breadcrumb-shape.json": "bad-breadcrumb-shape.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-breadcrumb-shape.json");
  });

  it("fails on a Question that marks up an answer the page cannot show", () => {
    const result = withFixtureDir(
      { "bad-faq-answerless.json": "bad-faq-answerless.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("acceptedAnswer");
  });
});
