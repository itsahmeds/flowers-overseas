/**
 * The remembered country after the paint (spec 004 §14 A-founder-2026-10-24a item 3, AC-80,
 * AC-81; T-86, T-87 unit halves; TASK-391): the island's fill and URL rule, the prices document's
 * view and its route.
 *
 * The node test environment has no DOM, so the document is a small fake with exactly the API the
 * island uses (the `basket-count.test.ts` precedent). The browser halves (byte-identical served
 * HTML with and without the cookie, layout shift at most 0.01, the island's Brotli share, the
 * `Set-Cookie` scan of cached responses) are T-86 and T-87's e2e, owed to the later test pass.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { PRICES_ROUTE_PREFIX } from "../../src/config/commerce.ts";
import {
  DEST_COOKIE_MAX_AGE_SECONDS,
  DEST_COOKIE_NAME,
} from "../../src/config/cookies.ts";
import { destCookieHeader } from "../../src/modules/catalog/chooser-choice.ts";
import { productCardView } from "../../src/modules/catalog/listing.ts";
import { listProducts } from "../../src/modules/catalog/read.ts";
import {
  pricesDocuments,
  rememberedPricesView,
} from "../../src/modules/catalog/remembered-prices.ts";
import {
  DEST_COOKIE,
  DEST_COOKIE_ATTRIBUTES,
  type PricesDocumentBody,
  applyPrices,
  fillRememberedCountry,
  followUrlCountry,
} from "../../src/modules/ui/shop/remembered-country.ts";

/* -------------------------------------------------------------------------- */
/* A fake document with exactly what the island calls.                        */
/* -------------------------------------------------------------------------- */

class FakeElement {
  readonly attributes = new Map<string, string>();
  children: (FakeElement | string)[] = [];
  className = "";
  textContent = "";
  href = "";
  rel = "";
  readonly tag: string;
  constructor(
    tag: string,
    attributes: Record<string, string> = {},
    children: FakeElement[] = [],
  ) {
    this.tag = tag;
    for (const [name, value] of Object.entries(attributes)) {
      this.attributes.set(name, value);
    }
    this.children = children;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.children = nodes;
    this.textContent = nodes
      .map((node) => (typeof node === "string" ? node : node.textContent))
      .join("");
  }
  descendants(): FakeElement[] {
    return this.children.flatMap((child) =>
      typeof child === "string" ? [] : [child, ...child.descendants()],
    );
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((element) => matches(element, selector));
  }
}

/** The handful of selector shapes the island writes, and nothing else. */
function matches(element: FakeElement, selector: string): boolean {
  return selector.split(",").some((part) => {
    const shape =
      /^(?<tag>[a-z]*)(?:\[(?<attr>[a-z-]+)(?:\^="(?<prefix>[^"]*)")?\])(?::not\(\[(?<not>[a-z-]+)\]\))?$/u.exec(
        part.trim(),
      );
    if (shape?.groups === undefined) throw new Error(`fake: ${part}`);
    const { tag, attr, prefix, not } = shape.groups;
    if (tag && element.tag !== tag) return false;
    if (attr === undefined) return false;
    const value = element.getAttribute(attr);
    if (value === null) return false;
    if (prefix !== undefined && !value.startsWith(prefix)) return false;
    if (not !== undefined && element.hasAttribute(not)) return false;
    return true;
  });
}

function fakeDocument(
  context: string,
  cookie: string,
): {
  d: Document;
  root: FakeElement;
  writes: string[];
} {
  const writes: string[] = [];
  const root = new FakeElement("html", {}, [
    new FakeElement("nav", { "data-fo-mega-context": context }, [
      new FakeElement("a", { href: "/en/choose-country/flowers/roses" }),
      new FakeElement("a", { href: "/en/choose-country/price/low" }),
    ]),
    new FakeElement("p", { "data-fo-hub-no-money": "" }),
    new FakeElement("form", {
      "data-fo-choose": "",
      action: "/en/choose-country/flowers/roses",
    }),
    new FakeElement("article", { "data-fo-product-card": "SKU-A" }, [
      new FakeElement("a", { href: "/en/choose-country/product/a" }, [
        new FakeElement("p", { "data-fo-card-ask": "" }),
        new FakeElement("p", { "data-fo-card-cta": "" }),
      ]),
    ]),
    new FakeElement("article", { "data-fo-product-card": "SKU-B" }, [
      new FakeElement("a", { href: "/en/choose-country/product/b" }, [
        new FakeElement("p", { "data-fo-card-ask": "" }),
        new FakeElement("p", { "data-fo-card-cta": "" }),
      ]),
    ]),
    new FakeElement("a", { href: "/en/choose-country" }),
    new FakeElement("a", { href: "/en/choose-country/pl/product/a" }),
    new FakeElement("a", { href: "/en/flowers/roses" }),
  ]);
  let jar = cookie;
  const d = {
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      writes.push(value);
      jar = value;
    },
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
    createElement: (tag: string) => new FakeElement(tag),
  } as unknown as Document;
  return { d, root, writes };
}

const BODY: PricesDocumentBody = {
  iso2: "pl",
  chooser: "/en/choose-country",
  line: "Sending to Poland",
  change: "change destination",
  cards: {
    "SKU-A": {
      price: "from PLN 149.00",
      inclusive: "Includes VAT and delivery",
      equivalents: "about €35.00",
    },
  },
  links: {
    "": "/en/poland/flowers",
    "flowers/roses": "/en/poland/flowers/roses",
    "product/a": "/en/poland/product/a",
  },
};

const hrefOf = (root: FakeElement, index: number): string | null =>
  root.querySelectorAll("a[href]")[index]?.getAttribute("href") ?? null;

describe("the cookie the island reads and writes is the chooser's (AC-80, AC-81)", () => {
  it("reads `fo_dest` by the register's name, lowercase ISO code only", () => {
    expect(DEST_COOKIE.source).toContain(`${DEST_COOKIE_NAME}=`);
    expect(DEST_COOKIE.exec("a=1; fo_dest=pl; b=2")?.[1]).toBe("pl");
    expect(DEST_COOKIE.exec("fo_dest=PL")).toBeNull();
    expect(DEST_COOKIE.exec("fo_dest=pol")).toBeNull();
    expect(DEST_COOKIE.exec("xfo_dest=pl")).toBeNull();
  });

  it("writes `destCookieHeader()`'s attributes, the register's lifetime", () => {
    expect(`${DEST_COOKIE_NAME}=pl${DEST_COOKIE_ATTRIBUTES}`).toBe(
      destCookieHeader("PL"),
    );
    expect(DEST_COOKIE_ATTRIBUTES).toContain(
      `Max-Age=${String(DEST_COOKIE_MAX_AGE_SECONDS)}`,
    );
  });
});

describe("the URL rule (AC-81)", () => {
  it("rewrites an existing `fo_dest` naming another country to the URL's", () => {
    const { d, writes } = fakeDocument("PL", "fo_dest=de");
    followUrlCountry(d);
    expect(writes).toStrictEqual([`fo_dest=pl${DEST_COOKIE_ATTRIBUTES}`]);
  });

  it("never creates `fo_dest` from a URL, and leaves an equal one alone", () => {
    for (const cookie of ["", "other=1", "fo_dest=pl"]) {
      const { d, writes } = fakeDocument("PL", cookie);
      followUrlCountry(d);
      expect(writes, cookie).toStrictEqual([]);
    }
  });

  it("writes nothing on a country-less page", () => {
    const { d, writes } = fakeDocument("", "fo_dest=de");
    followUrlCountry(d);
    expect(writes).toStrictEqual([]);
  });
});

describe("the fill (AC-80)", () => {
  it("fills a card's reserved boxes, rewrites chooser links and swaps the no-money line", () => {
    const { d, root } = fakeDocument("", "fo_dest=pl");
    applyPrices(d, BODY);
    const [first, second] = root.querySelectorAll("[data-fo-product-card]");
    expect(first?.querySelector("[data-fo-card-ask]")?.textContent).toBe(
      "from PLN 149.00 Includes VAT and delivery",
    );
    expect(first?.querySelector("[data-fo-card-cta]")?.textContent).toBe(
      "about €35.00",
    );
    expect(first?.getAttribute("data-fo-product-card-money")).toBe("filled");
    // A product the document does not price keeps its served box.
    expect(second?.querySelector("[data-fo-card-ask]")?.textContent).toBe("");
    expect(second?.getAttribute("data-fo-product-card-money")).toBeNull();

    // Mapped links go to the country's page; the rest to the path form; others untouched.
    expect(hrefOf(root, 0)).toBe("/en/poland/flowers/roses");
    expect(hrefOf(root, 1)).toBe("/en/choose-country/pl/price/low");
    expect(hrefOf(root, 2)).toBe("/en/poland/product/a");
    expect(hrefOf(root, 3)).toBe("/en/choose-country/pl/product/b");
    expect(hrefOf(root, 4)).toBe("/en/poland/flowers");
    expect(hrefOf(root, 5)).toBe("/en/choose-country/pl/product/a");
    expect(hrefOf(root, 6)).toBe("/en/flowers/roses");

    const box = root.querySelector("[data-fo-hub-no-money]");
    expect(box?.textContent).toBe("Sending to Polandchange destination");
    expect(box?.getAttribute("data-fo-chosen")).toBe("pl");
    const change = box?.children[1] as FakeElement | undefined;
    expect(change?.href).toBe("/en/choose-country/flowers/roses");
    expect(change?.rel).toBe("nofollow");
    expect(change?.hasAttribute("data-fo-change")).toBe(true);
  });

  it("keeps the equivalents box's height with a no-break space when there is no line", () => {
    const { d, root } = fakeDocument("", "fo_dest=pl");
    applyPrices(d, {
      ...BODY,
      cards: {
        "SKU-A": { price: "from £31.90", inclusive: "x", equivalents: null },
      },
    });
    expect(root.querySelector("[data-fo-card-cta]")?.textContent).toBe(" ");
  });

  it("makes no request without `fo_dest`, or on a country page", async () => {
    for (const [context, cookie] of [
      ["", ""],
      ["", "fo_dest=PL"],
      ["PL", "fo_dest=de"],
    ] as const) {
      const { d } = fakeDocument(context, cookie);
      const calls: string[] = [];
      await fillRememberedCountry(d, (url) => {
        calls.push(url);
        return Promise.resolve(new Response("{}"));
      });
      expect(calls, `${context} ${cookie}`).toStrictEqual([]);
    }
  });

  it("asks the one cached document for the remembered country, and survives a failure", async () => {
    const { d, root } = fakeDocument("", "fo_dest=pl");
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      value: { pathname: "/en/flowers/roses" },
      configurable: true,
    });
    try {
      const calls: string[] = [];
      await fillRememberedCountry(d, (url) => {
        calls.push(url);
        return Promise.resolve(Response.json(BODY));
      });
      expect(calls).toStrictEqual([`${PRICES_ROUTE_PREFIX}/en/pl`]);
      expect(hrefOf(root, 0)).toBe("/en/poland/flowers/roses");

      const other = fakeDocument("", "fo_dest=pl");
      await fillRememberedCountry(other.d, () =>
        Promise.reject(new Error("offline")),
      );
      await fillRememberedCountry(other.d, () =>
        Promise.resolve(new Response(null, { status: 404 })),
      );
      expect(hrefOf(other.root, 0)).toBe("/en/choose-country/flowers/roses");
    } finally {
      Object.defineProperty(globalThis, "location", {
        value: original,
        configurable: true,
      });
    }
  });
});

const NOW = new Date("2026-09-15T10:00:00Z");

describe("the prices document's view (AC-80)", () => {
  it("prices each core card exactly as the country's shop root does", async () => {
    const view = await rememberedPricesView("en", "pl", NOW);
    if (view === undefined) throw new Error("Poland is a shop country");
    expect(view.cards.length).toBeGreaterThan(0);
    const sold = new Map(
      (await listProducts({ countryIso: "PL" })).map((product) => [
        product.sku,
        product,
      ]),
    );
    for (const card of view.cards) {
      const product = sold.get(card.productId);
      if (product === undefined) throw new Error(card.productId);
      const listed = await productCardView(product, "en", "PL", {
        productLinks: true,
        now: NOW,
      });
      expect(card.price, card.productId).toStrictEqual(listed.price);
      expect(card.equivalents, card.productId).toStrictEqual(
        listed.equivalents,
      );
      expect(card.slots, card.productId).toStrictEqual(listed.slots);
    }
  });

  it("maps the home, the hubs and the core products, and never a price band", async () => {
    const view = await rememberedPricesView("en", "pl", NOW);
    expect(view?.chooser).toBe("/en/choose-country");
    expect(view?.links[""]).toBe("/en/poland/flowers");
    const keys = Object.keys(view?.links ?? {});
    expect(keys.some((key) => key.startsWith("flowers/"))).toBe(true);
    expect(keys.some((key) => key.startsWith("product/"))).toBe(true);
    expect(keys.some((key) => key.startsWith("price/"))).toBe(false);
    for (const target of Object.values(view?.links ?? {})) {
      expect(target).not.toMatch(/[?&](price|colour)=/u);
    }
  });

  it("answers nothing for a country outside the shop set or not a country", async () => {
    expect(await rememberedPricesView("en", "us", NOW)).toBeUndefined();
    expect(await rememberedPricesView("en", "zz", NOW)).toBeUndefined();
  });

  it("lists one document per launch locale and shop country, lowercase", async () => {
    const documents = await pricesDocuments();
    expect(documents.length).toBeGreaterThan(0);
    for (const document of documents) {
      expect(document.path).toBe(
        `${PRICES_ROUTE_PREFIX}/${document.locale}/${document.iso2.toLowerCase()}`,
      );
    }
  });
});

describe("the prices route (AC-80)", () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/app/api/prices/[locale]/[iso2]/route.ts",
    ),
    "utf8",
  );

  it("is ISR for an hour and reads no cookie, header or query", () => {
    expect(source).toMatch(/export const revalidate = 3600;/u);
    for (const read of [
      "cookies(",
      "headers(",
      "searchParams",
      "request.url",
    ]) {
      expect(source, read).not.toContain(read);
    }
  });

  it("serves a public, cached JSON document under 8,192 B Brotli, and 404s the rest", async () => {
    const { GET } =
      await import("../../src/app/api/prices/[locale]/[iso2]/route.ts");
    const answer = (locale: string, iso2: string) =>
      GET(new Request("https://example.test/"), {
        params: Promise.resolve({ locale, iso2 }),
      });
    const ok = await answer("en", "pl");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toMatch(/^public,/u);
    expect(ok.headers.get("set-cookie")).toBeNull();
    const text = await ok.text();
    expect(brotliCompressSync(Buffer.from(text)).length).toBeLessThanOrEqual(
      8192,
    );
    const body = JSON.parse(text) as PricesDocumentBody;
    expect(body.iso2).toBe("pl");
    expect(body.line).toContain("Poland");
    expect(Object.values(body.cards)[0]?.price).toMatch(/^from /u);
    for (const [locale, iso2] of [
      ["en", "us"],
      ["en", "PL"],
      ["xx", "pl"],
      ["en-XA", "pl"],
    ] as const) {
      expect((await answer(locale, iso2)).status, `${locale}/${iso2}`).toBe(
        404,
      );
    }
  });
});
