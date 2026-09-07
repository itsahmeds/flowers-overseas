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

  it("exits 0 with 'no fixtures' on the committed fixture directory", () => {
    const result = runSeoCli(CLI, "tests/fixtures/seo/schema");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no fixtures");
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
