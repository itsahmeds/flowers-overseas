/**
 * The JSON-LD builders, against the **rendered** page (spec 007 §2 "Schema", §5.2 L65, AC-15,
 * AC-16; T-16; `plan/02` §9; TASK-093).
 *
 * The whole point of AC-15 is that structured data cannot claim something the page does not show,
 * so the assertions here never compare a builder against a hand-written expectation of the trail
 * or the Q&A. They render the real components — `CorridorBreadcrumb`, `CorridorFaq`, through
 * `CorridorPage` and `DestinationsHubPage` — over the real `messages/*.json` and the real corridor
 * corpus, extract what a reader sees, and compare that to what the builder emits:
 *
 *  - **order and label**, item by item, for `BreadcrumbList` (and the `item` URL against the
 *    `href` the crumb actually links to);
 *  - **character for character**, question by question and answer by answer, for `FAQPage`.
 *
 * A builder that took its own copy of the trail or of the Q&A would pass a test written the other
 * way round and still ship a lie, which is the failure `plan/02` §9 is about.
 *
 * `Organization` and `WebSite` are asserted as **field sets**, not as values: the risk there is an
 * invented fact (a registry number, an address, a social profile we do not have), so the test pins
 * the exact key list in both states of `company.ts`'s `registered` flag.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  collectTypedNodes,
  typeProblem,
} from "../../scripts/seo/validate-schema.ts";
import { CompanySchema, COMPANY } from "../../src/config/company.ts";
import { corridorView, hubView } from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";
import { DestinationsHubPage } from "../../src/modules/geo/ui/DestinationsHubPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import {
  FAQ_MAX_ITEMS,
  FAQ_MIN_ITEMS,
  ORGANIZATION_LOGO_PATH,
  breadcrumbList,
  faqPage,
  jsonLdDocument,
  jsonLdScript,
  organization,
  webSite,
} from "../../src/modules/seo";

const BASE = { baseUrl: "https://flowersoverseas.com" } as const;
const FROM = "2026-09-15";

/** Every namespace a corridor or hub document resolves (`tests/unit/corridor-page.test.tsx`). */
const NAMESPACES = [
  "corridor",
  "destinationsHub",
  "breadcrumb",
  "destinations",
  "catalog",
  "common",
  "a11y",
  "media",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function decode(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x2F;", "/")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function text(html: string): string {
  return decode(html.replaceAll(/<[^>]*>/g, " "))
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** The visible breadcrumb of a rendered document: one `{ name, href }` per `<li>`, in order. */
function visibleTrail(
  html: string,
): readonly { name: string; href: string | undefined }[] {
  const nav = /<nav[^>]*data-fo-breadcrumb[^>]*>(.*?)<\/nav>/s.exec(html)?.[1];
  if (nav === undefined) throw new Error("no breadcrumb in the document");
  return [...nav.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((item) => {
    const cell = item[1] ?? "";
    const href = /<a[^>]*href="([^"]*)"/.exec(cell)?.[1];
    // The separator is `aria-hidden` and not part of any label.
    const label = text(
      cell.replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/s, ""),
    );
    return { name: label, href: href === undefined ? undefined : decode(href) };
  });
}

/** The visible Q&A of a rendered corridor document, in document order. */
function visibleFaq(html: string): readonly { q: string; a: string }[] {
  const block = /<section[^>]*data-fo-corridor-faq[^>]*>(.*?)<\/section>/s.exec(
    html,
  )?.[1];
  if (block === undefined) throw new Error("no FAQ block in the document");
  const questions = [...block.matchAll(/<h3[^>]*>(.*?)<\/h3>/gs)].map((match) =>
    text(match[1] ?? ""),
  );
  const answers = [...block.matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map((match) =>
    text(match[1] ?? ""),
  );
  return questions.map((q, index) => ({ q, a: answers[index] ?? "" }));
}

interface ListItem {
  readonly "@type": string;
  readonly position: number;
  readonly name: string;
  readonly item?: string;
}

function items(node: Record<string, unknown> | undefined): readonly ListItem[] {
  if (node === undefined) throw new Error("the builder emitted no node");
  return node["itemListElement"] as readonly ListItem[];
}

const guide = corridorView("PL", "en", { from: FROM });
if (guide === undefined) throw new Error("the en Poland guide must exist");

/**
 * The label resolver the route hands the builder: a dotted registry key read out of the same
 * catalogue the component renders (`messages/{locale}.json` through `loadMessages`).
 */
function labelFor(locale: string): (key: string) => string {
  const messages = loadMessages(locale, [...NAMESPACES]) as Record<
    string,
    unknown
  >;
  return (key: string): string => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (scope, part) =>
          scope === undefined
            ? undefined
            : (scope as Record<string, unknown>)[part],
        messages,
      );
    if (typeof value !== "string") throw new Error(`no message for ${key}`);
    return value;
  };
}

const label = labelFor("en");

describe("BreadcrumbList equals the visible trail (AC-15, T-16)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    it(`matches the corridor trail in ${locale}, item for item`, () => {
      const view = corridorView("PL", locale, { from: FROM });
      if (view === undefined) throw new Error(`no ${locale} guide`);
      const html = render(<CorridorPage view={view} />, locale);
      const trail = visibleTrail(html);
      const built = items(
        breadcrumbList(view.breadcrumb, labelFor(locale), BASE),
      );

      expect(built).toHaveLength(trail.length);
      built.forEach((item, index) => {
        expect(item["@type"]).toBe("ListItem");
        expect(item.position).toBe(index + 1);
        expect(item.name).toBe(trail[index]?.name);
        const href = trail[index]?.href;
        expect(item.item).toBe(
          href === undefined ? undefined : `${BASE.baseUrl}${href}`,
        );
      });
    });
  }

  it("matches the hub trail, including the crumb that is text rather than a link", () => {
    const view = hubView("en");
    const html = render(<DestinationsHubPage locale="en" />, "en");
    const trail = visibleTrail(html);
    const built = items(breadcrumbList(view.breadcrumb, label, BASE));

    expect(built.map((item) => item.name)).toEqual(
      trail.map((crumb) => crumb.name),
    );
    // The current crumb is not a link on the hub, so it announces no `item` either.
    expect(built.at(-1)?.item).toBeUndefined();
    expect(trail.at(-1)?.href).toBeUndefined();
  });

  it("emits nothing for a trail of fewer than two crumbs", () => {
    expect(
      breadcrumbList(
        [{ labelKey: "common.homeLink", href: "/en", current: true }],
        label,
        BASE,
      ),
    ).toBeUndefined();
    expect(breadcrumbList([], label, BASE)).toBeUndefined();
  });

  it("refuses a crumb whose label resolves to nothing", () => {
    expect(() => breadcrumbList(guide.breadcrumb, () => "  ", BASE)).toThrow(
      /label/i,
    );
  });
});

describe("FAQPage equals the visible Q&A (AC-15, T-16)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    it(`matches every rendered question and answer in ${locale}`, () => {
      const view = corridorView("PL", locale, { from: FROM });
      if (view === undefined) throw new Error(`no ${locale} guide`);
      const html = render(<CorridorPage view={view} />, locale);
      const visible = visibleFaq(html);
      const node = faqPage(view.faq);
      const questions = node?.["mainEntity"] as readonly Record<
        string,
        unknown
      >[];

      expect(visible.length).toBeGreaterThanOrEqual(FAQ_MIN_ITEMS);
      expect(questions).toHaveLength(visible.length);
      questions.forEach((question, index) => {
        expect(question["@type"]).toBe("Question");
        expect(question["name"]).toBe(visible[index]?.q);
        const answer = question["acceptedAnswer"] as Record<string, unknown>;
        expect(answer["@type"]).toBe("Answer");
        expect(answer["text"]).toBe(visible[index]?.a);
      });
    });
  }

  it("emits nothing outside the 8–12 band, and a node inside it", () => {
    const entry = (n: number) => ({ q: `q${String(n)}`, a: `a${String(n)}` });
    const band = (count: number) =>
      Array.from({ length: count }, (_, index) => entry(index));

    expect(faqPage(band(FAQ_MIN_ITEMS - 1))).toBeUndefined();
    expect(faqPage(band(FAQ_MAX_ITEMS + 1))).toBeUndefined();
    expect(faqPage(band(FAQ_MIN_ITEMS))).toBeDefined();
    expect(faqPage(band(FAQ_MAX_ITEMS))).toBeDefined();
  });

  it("emits nothing when an answer is blank: an empty answer is not a visible one", () => {
    const eight = Array.from({ length: FAQ_MIN_ITEMS }, (_, index) => ({
      q: `q${String(index)}`,
      a: index === 3 ? "   " : `a${String(index)}`,
    }));
    expect(faqPage(eight)).toBeUndefined();
  });
});

describe("Organization carries only what company.ts has (AC-15, T-16)", () => {
  it("is name, url and logo while the company is not registered", () => {
    expect(COMPANY.registered).toBe(false);
    const node = organization(COMPANY, BASE);

    expect(Object.keys(node).sort()).toEqual(["@type", "logo", "name", "url"]);
    expect(node["name"]).toBe(COMPANY.tradingName);
    expect(node["url"]).toBe(BASE.baseUrl);
    expect(node["logo"]).toBe(`${BASE.baseUrl}${ORGANIZATION_LOGO_PATH}`);
  });

  it("gains address, vatID and sameAs only once registered", () => {
    const registered = CompanySchema.parse({
      ...COMPANY,
      registered: true,
      legalName: "Flowers Overseas OÜ",
      registryName: "Estonian Business Register",
      registrationNumber: "16000000",
      vatId: "EE102000000",
      address: {
        lines: ["Narva mnt 5"],
        postalCode: "10117",
        city: "Tallinn",
        countryIso2: "EE",
      },
    });
    const node = organization(registered, {
      ...BASE,
      sameAs: ["https://www.linkedin.com/company/flowersoverseas"],
    });

    expect(Object.keys(node).sort()).toEqual([
      "@type",
      "address",
      "logo",
      "name",
      "sameAs",
      "url",
      "vatID",
    ]);
    expect(node["vatID"]).toBe("EE102000000");
    expect(node["address"]).toMatchObject({
      "@type": "PostalAddress",
      addressCountry: "EE",
      addressLocality: "Tallinn",
      postalCode: "10117",
      streetAddress: "Narva mnt 5",
    });
  });

  it("never announces a profile it was not given", () => {
    const node = organization(COMPANY, { ...BASE, sameAs: [] });
    expect(node["sameAs"]).toBeUndefined();
  });
});

describe("WebSite without SearchAction (AC-15, T-16)", () => {
  it("is name and url, and carries no potentialAction of any kind", () => {
    const node = webSite(COMPANY.tradingName, BASE);

    expect(Object.keys(node).sort()).toEqual(["@type", "name", "url"]);
    expect(JSON.stringify(node)).not.toContain("SearchAction");
    expect(JSON.stringify(node)).not.toContain("potentialAction");
  });
});

describe("the document the page emits (AC-16, T-16)", () => {
  it("inlines @context for one node and uses @graph for several", () => {
    const one = jsonLdDocument([webSite(COMPANY.tradingName, BASE)]);
    expect(one?.["@context"]).toBe("https://schema.org");
    expect(one?.["@type"]).toBe("WebSite");
    expect(one?.["@graph"]).toBeUndefined();

    const two = jsonLdDocument([
      organization(COMPANY, BASE),
      webSite(COMPANY.tradingName, BASE),
    ]);
    expect(two?.["@context"]).toBe("https://schema.org");
    expect((two?.["@graph"] as readonly unknown[]).length).toBe(2);
  });

  it("drops absent nodes and emits no document at all when none is left", () => {
    expect(jsonLdDocument([undefined, undefined])).toBeUndefined();
    expect(jsonLdScript([undefined])).toBeUndefined();
    const doc = jsonLdDocument([undefined, webSite("x", BASE)]);
    expect(doc?.["@type"]).toBe("WebSite");
  });

  it("escapes `<` so no answer can close the script element", () => {
    const script = jsonLdScript([
      faqPage(
        Array.from({ length: FAQ_MIN_ITEMS }, (_, index) => ({
          q: `q${String(index)}`,
          a: index === 0 ? "</script><script>alert(1)</script>" : "a",
        })),
      ),
    ]);
    expect(script).toBeDefined();
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c");
    expect(JSON.parse(script ?? "")).toBeTruthy();
  });

  it("emits no forbidden or unlisted @type over the real corpus (AC-16)", () => {
    const document = jsonLdDocument([
      breadcrumbList(guide.breadcrumb, label, BASE),
      faqPage(guide.faq),
      organization(COMPANY, BASE),
      webSite(COMPANY.tradingName, BASE),
    ]);
    const nodes = collectTypedNodes(document);

    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      for (const type of node.types) expect(typeProblem(type)).toBeNull();
    }
    const serialised = JSON.stringify(document);
    for (const forbidden of [
      "LocalBusiness",
      "FloristShop",
      "Product",
      "Offer",
      "aggregateRating",
      "AggregateRating",
      "review",
      "Review",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
