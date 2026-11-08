/**
 * Spec 023 TASK-492, the browser half of the GA4 client, run against a small fake DOM (the repo
 * has no DOM environment; the served half is the `consent-active` e2e suite, a carry-forward):
 *
 *  - the loader (T-01 / AC-1, T-02 / AC-2): no id or no valid grant, nothing is imported; a grant
 *    imports the deferred chunk only after `load` and idle;
 *  - the deferred chunk: the one `config` with §5.2's exact options and the manual `page_view`
 *    (AC-2, AC-7), `select_item` deep-equal to the list's third item (AC-10), the tier and date
 *    events (AC-12), `add_to_cart` (AC-13), `add_payment_info` with the step 4 quote (AC-14),
 *    one `web_vital` per metric (AC-18), and the withdrawal (AC-3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_BOOTSTRAP_ID,
  GA4_ID_ATTRIBUTE,
} from "../../src/lib/consent-bootstrap";

const ID = "G-FIXTURE00";
const ORIGIN = "https://staging.flowersoverseas.com";

/* ------------------------------ the fake DOM ------------------------------ */

class FakeElement {
  parent: FakeElement | null = null;
  readonly attributes: Record<string, string>;
  constructor(attributes: Record<string, string> = {}) {
    this.attributes = attributes;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }
  closest(selector: string): FakeElement | null {
    const name = /^\[([^\]]+)\]$/u.exec(selector)?.[1] ?? "";
    if (this.hasAttribute(name)) return this;
    return this.parent === null ? null : this.parent.closest(selector);
  }
}
class FakeInput extends FakeElement {
  readonly name: string;
  readonly value: string;
  readonly checked = true;
  constructor(name: string, value: string) {
    super({});
    this.name = name;
    this.value = value;
  }
}
class FakeForm extends FakeElement {
  readonly tier: string;
  constructor(attributes: Record<string, string>, tier: string) {
    super(attributes);
    this.tier = tier;
  }
  get elements() {
    return {
      namedItem: (name: string) =>
        name === "tier" ? { value: this.tier } : null,
    };
  }
}

type Listener = (event: { target: unknown }) => void;

interface Fake {
  readonly dataLayer: unknown[][];
  readonly appended: { src?: string }[];
  readonly listeners: Map<string, Set<Listener>>;
  readonly windowListeners: Map<string, Listener[]>;
  readonly jar: Map<string, string>;
  readonly cookieWrites: string[];
  payload: string | null;
  idle: (() => void)[];
  readyState: string;
  href: string;
}

function installDom(): Fake {
  const fake: Fake = {
    dataLayer: [],
    appended: [],
    listeners: new Map(),
    windowListeners: new Map(),
    jar: new Map(),
    cookieWrites: [],
    payload: null,
    idle: [],
    readyState: "complete",
    href: `${ORIGIN}/en-gb/poland/roses`,
  };
  const bootstrap = new FakeElement({ [GA4_ID_ATTRIBUTE]: ID });
  const document = {
    referrer: "",
    title: "Roses to Poland",
    get readyState() {
      return fake.readyState;
    },
    documentElement: { lang: "en-GB" },
    head: {
      append: (element: { src?: string }) => fake.appended.push(element),
    },
    createElement: () => ({}),
    getElementById: (id: string) =>
      id === CONSENT_BOOTSTRAP_ID ? bootstrap : null,
    querySelectorAll: () =>
      fake.payload === null
        ? []
        : [new FakeElement({ "data-fo-analytics": fake.payload })],
    addEventListener: (type: string, listener: Listener) => {
      if (!fake.listeners.has(type)) fake.listeners.set(type, new Set());
      fake.listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      fake.listeners.get(type)?.delete(listener);
    },
    get cookie() {
      return [...fake.jar]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
    set cookie(text: string) {
      fake.cookieWrites.push(text);
      const [pair = ""] = text.split("; ");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      if (/Max-Age=0/u.test(text)) fake.jar.delete(name);
      else fake.jar.set(name, pair.slice(separator + 1));
    },
  };
  const location = {
    get href() {
      return fake.href;
    },
    get pathname() {
      return new URL(fake.href).pathname;
    },
    get search() {
      return new URL(fake.href).search;
    },
    origin: ORIGIN,
    hostname: "staging.flowersoverseas.com",
  };
  const history = {
    pushState: (_state: unknown, _unused: string, url: string) => {
      fake.href = new URL(url, ORIGIN).toString();
    },
    replaceState: (_state: unknown, _unused: string, url: string) => {
      fake.href = new URL(url, ORIGIN).toString();
    },
  };
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", document);
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", history);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeInput);
  vi.stubGlobal("HTMLFormElement", FakeForm);
  vi.stubGlobal("dataLayer", fake.dataLayer);
  vi.stubGlobal("gtag", (...args: unknown[]) => fake.dataLayer.push(args));
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
    fake.idle.push(callback);
    return 1;
  });
  vi.stubGlobal("addEventListener", (type: string, listener: Listener) => {
    fake.windowListeners.set(type, [
      ...(fake.windowListeners.get(type) ?? []),
      listener,
    ]);
  });
  return fake;
}

function fire(fake: Fake, type: string, target: unknown): void {
  for (const listener of fake.listeners.get(type) ?? []) listener({ target });
}

const events = (fake: Fake, name?: string) =>
  fake.dataLayer.filter(
    (entry) =>
      entry[0] === "event" && (name === undefined || entry[1] === name),
  );

const GRANT = encodeURIComponent(
  JSON.stringify({
    v: 1,
    a: true,
    m: false,
    ts: "2026-11-08T10:00:00.000Z",
    cid: "6f1c2b9e-3a5d-4c7e-9b1a-2d3e4f5a6b7c",
  }),
);

/* -------------------------------- the loader ------------------------------ */

const startDeferred = vi.fn();
vi.mock("../../src/modules/analytics/client/deferred", () => ({
  startDeferred,
}));

describe("the first-load loader (AC-1, AC-2)", () => {
  let fake: Fake;
  beforeEach(() => {
    fake = installDom();
    startDeferred.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = async () => import("../../src/modules/analytics/client/loader");
  const settle = async () => {
    for (const callback of fake.idle.splice(0)) callback();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it("pins the bootstrap's element id and attribute it restates", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/modules/analytics/client/loader.ts", "utf8"),
    );
    expect(source).toContain(`"${CONSENT_BOOTSTRAP_ID}"`);
    expect(source).toContain(`"${GA4_ID_ATTRIBUTE}"`);
  });

  it.each([
    ["no fo_consent", null],
    [
      "analytics off",
      encodeURIComponent(
        JSON.stringify({ v: 1, a: false, m: false, ts: "x", cid: "y" }),
      ),
    ],
    ["forged", "%7Bnot-json"],
    [
      "an old policy version",
      encodeURIComponent(
        JSON.stringify({ v: 0, a: true, m: true, ts: "x", cid: "y" }),
      ),
    ],
  ])("imports nothing with %s", async (_label, value) => {
    if (value !== null) fake.jar.set("fo_consent", value);
    const { startAnalyticsIfGranted } = await load();
    startAnalyticsIfGranted("fo_consent", 1);
    await settle();
    expect(startDeferred).not.toHaveBeenCalled();
    expect(fake.idle).toHaveLength(0);
  });

  it("imports nothing without a measurement id, even with a grant", async () => {
    fake.jar.set("fo_consent", GRANT);
    vi.stubGlobal("document", {
      ...document,
      cookie: `fo_consent=${GRANT}`,
      getElementById: () => new FakeElement({}),
    });
    const { startAnalyticsIfGranted } = await load();
    startAnalyticsIfGranted("fo_consent", 1);
    await settle();
    expect(startDeferred).not.toHaveBeenCalled();
  });

  it("with a grant, waits for `load`, then idle, then starts the chunk with the id", async () => {
    fake.jar.set("fo_consent", GRANT);
    fake.readyState = "loading";
    const { startAnalyticsIfGranted } = await load();
    startAnalyticsIfGranted("fo_consent", 1);
    await settle();
    expect(startDeferred).not.toHaveBeenCalled();
    for (const listener of fake.windowListeners.get("load") ?? []) {
      listener({ target: null });
    }
    expect(startDeferred).not.toHaveBeenCalled();
    await settle();
    expect(startDeferred).toHaveBeenCalledWith(ID);
  });
});

/* ---------------------------- the deferred chunk -------------------------- */

const vitals: Record<string, (metric: unknown) => void> = {};
vi.mock("web-vitals", () => ({
  onLCP: (callback: (metric: unknown) => void) => (vitals["LCP"] = callback),
  onCLS: (callback: (metric: unknown) => void) => (vitals["CLS"] = callback),
  onINP: (callback: (metric: unknown) => void) => (vitals["INP"] = callback),
}));

const COMMON = {
  locale: "en-gb",
  page_type: "country_category",
  destination_country: "PL",
  country_status: "live",
  display_currency: "GBP",
};
const item = (index: number) => ({
  item_id: `FO-BQ-00${String(index)}`,
  item_name: `Bouquet ${String(index)}`,
  item_category: "roses",
  price: 45 + index,
  quantity: 1,
  item_destination_country: "PL",
  index,
});
const LIST_PAYLOAD = {
  common: COMMON,
  events: [
    {
      name: "view_item_list",
      params: {
        item_list_id: "PL:category:roses",
        item_list_name: "PL:category:roses",
        items: [item(0), item(1), item(2), item(3)],
      },
    },
  ],
};
const TIER = (key: string, price: number) => ({
  item_id: "FO-BQ-023",
  item_name: "Red roses",
  item_category: "roses",
  item_variant: key,
  price,
  quantity: 1,
  item_destination_country: "PL",
});
const PRODUCT_PAYLOAD = {
  common: { ...COMMON, page_type: "product" },
  tiers: { s12: TIER("s12", 45), s24: TIER("s24", 79) },
  today: "2026-11-08",
};

describe("the deferred chunk", () => {
  let fake: Fake;
  beforeEach(() => {
    vi.resetModules();
    fake = installDom();
    fake.payload = JSON.stringify(LIST_PAYLOAD);
    fake.jar.set("_ga", "GA1.1.123456789.1700000000");
    fake.jar.set("_ga_FIXTURE00", "GS2.1.s1700000000$o1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chunk = async () => {
    const { startDeferred: start } = await vi.importActual<
      typeof import("../../src/modules/analytics/client/deferred")
    >("../../src/modules/analytics/client/deferred");
    start(ID);
    return globalThis as unknown as {
      __foAnalytics: {
        track(name: string, params?: object): void;
        stop(): void;
      };
    } & Record<string, unknown>;
  };
  const tick = async () => new Promise((resolve) => setTimeout(resolve, 0));

  it("injects gtag.js once and queues `js` and exactly §5.2's `config` (AC-2)", async () => {
    await chunk();
    expect(fake.appended.map((script) => script.src)).toEqual([
      `https://www.googletagmanager.com/gtag/js?id=${ID}`,
    ]);
    const configs = fake.dataLayer.filter((entry) => entry[0] === "config");
    expect(configs).toEqual([
      [
        "config",
        ID,
        {
          send_page_view: false,
          page_location: `${ORIGIN}/en-gb/poland/roses`,
          page_referrer: "",
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          cookie_expires: 31536000,
          cookie_update: false,
          cookie_flags: "SameSite=Lax;Secure",
          debug_mode: true,
        },
      ],
    ]);
    expect(fake.dataLayer.findIndex((entry) => entry[0] === "js")).toBeLessThan(
      fake.dataLayer.findIndex((entry) => entry[0] === "config"),
    );
  });

  it("sends one page_view and the payload's view_item_list, with the common set (AC-7, AC-8, AC-9)", async () => {
    await chunk();
    expect(events(fake, "page_view")).toEqual([
      [
        "event",
        "page_view",
        {
          page_location: `${ORIGIN}/en-gb/poland/roses`,
          page_referrer: "",
          page_title: "Roses to Poland",
          ...COMMON,
        },
      ],
    ]);
    const list = events(fake, "view_item_list");
    expect(list).toHaveLength(1);
    expect(list[0]?.[2]).toMatchObject(COMMON);
  });

  it("one page_view per client navigation, none on a same-route re-render (AC-7)", async () => {
    await chunk();
    history.replaceState(null, "", "/en-gb/poland/roses");
    await tick();
    expect(events(fake, "page_view")).toHaveLength(1);
    fake.payload = JSON.stringify({
      common: { locale: "en-gb", page_type: "tracking" },
    });
    history.pushState(
      null,
      "",
      "/en-gb/track/SECRETTOKEN123?email=a@b.c&step=x",
    );
    await tick();
    const views = events(fake, "page_view");
    expect(views).toHaveLength(2);
    expect(views[1]?.[2]).toEqual({
      page_location: `${ORIGIN}/en-gb/track/:token?step=x`,
      page_referrer: `${ORIGIN}/en-gb/poland/roses`,
      page_title: "tracking",
      locale: "en-gb",
      page_type: "tracking",
    });
    expect(JSON.stringify(fake.dataLayer)).not.toContain("SECRETTOKEN123");
    expect(JSON.stringify(fake.dataLayer)).not.toContain("a@b.c");
  });

  it("the third card's `select_item` deep-equals the list's third item (AC-10)", async () => {
    await chunk();
    const li = new FakeElement({ "data-fo-item": "2" });
    const inner = new FakeElement({});
    inner.parent = li;
    fire(fake, "click", inner);
    const selected = events(fake, "select_item");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.[2]).toEqual({
      item_list_id: "PL:category:roses",
      item_list_name: "PL:category:roses",
      items: [LIST_PAYLOAD.events[0]?.params.items[2]],
      ...COMMON,
    });
  });

  it("tier and date chip events carry the shown price and no date (AC-12)", async () => {
    fake.payload = JSON.stringify(PRODUCT_PAYLOAD);
    await chunk();
    fire(fake, "change", new FakeInput("tier", "s24"));
    const chip = new FakeElement({
      "data-fo-date": "2026-11-10",
      "data-fo-date-state": "surcharge",
    });
    const radio = new FakeInput("date", "2026-11-10");
    radio.parent = chip;
    fire(fake, "change", radio);
    await tick();
    expect(events(fake, "select_item_variant")[0]?.[2]).toMatchObject({
      currency: "GBP",
      value: 79,
      items: [TIER("s24", 79)],
    });
    const date = events(fake, "select_delivery_date")[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(date).toMatchObject({
      days_ahead: 2,
      is_same_day: false,
      has_surcharge: true,
    });
    for (const value of Object.values(date)) {
      expect(String(value)).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    }
  });

  it("the primary form's submit sends one `add_to_cart` for the chosen tier (AC-13)", async () => {
    fake.payload = JSON.stringify(PRODUCT_PAYLOAD);
    await chunk();
    fire(fake, "submit", new FakeForm({ "data-fo-pdp-form": "" }, "s12"));
    fire(fake, "submit", new FakeForm({}, "s12"));
    const added = events(fake, "add_to_cart");
    expect(added).toHaveLength(1);
    expect(added[0]?.[2]).toMatchObject({
      currency: "GBP",
      value: 45,
      items: [TIER("s12", 45)],
    });
  });

  it("`add_payment_info` at Pay extends the step 4 quote with the payment type (AC-14)", async () => {
    fake.payload = JSON.stringify({
      common: { ...COMMON, page_type: "checkout" },
      checkout: { currency: "GBP", value: 53, items: [TIER("s12", 53)] },
    });
    const win = await chunk();
    win.__foAnalytics.track("add_payment_info", { payment_type: "card" });
    expect(events(fake, "add_payment_info")[0]?.[2]).toMatchObject({
      currency: "GBP",
      value: 53,
      payment_type: "card",
      page_type: "checkout",
    });
  });

  it("reports at most one `web_vital` per metric, CLS times 1000 (AC-18)", async () => {
    await chunk();
    vitals["LCP"]?.({ name: "LCP", value: 1234.4, rating: "good" });
    vitals["CLS"]?.({
      name: "CLS",
      value: 0.1234,
      rating: "needs-improvement",
    });
    vitals["INP"]?.({ name: "INP", value: 88, rating: "good" });
    const sent = events(fake, "web_vital").map((entry) => entry[2]);
    expect(sent).toEqual([
      {
        metric_name: "LCP",
        metric_value: 1234,
        metric_rating: "good",
        ...COMMON,
      },
      {
        metric_name: "CLS",
        metric_value: 123,
        metric_rating: "needs-improvement",
        ...COMMON,
      },
      {
        metric_name: "INP",
        metric_value: 88,
        metric_rating: "good",
        ...COMMON,
      },
    ]);
  });

  it("a withdrawal disables the tag, deletes `_ga*` and sends nothing more (AC-3)", async () => {
    const win = await chunk();
    const before = fake.dataLayer.length;
    win.__foAnalytics.stop();
    expect(win[`ga-disable-${ID}`]).toBe(true);
    expect(fake.jar.has("_ga")).toBe(false);
    expect(fake.jar.has("_ga_FIXTURE00")).toBe(false);
    expect(fake.cookieWrites).toContain(
      "_ga=; Max-Age=0; Path=/; Domain=flowersoverseas.com",
    );
    expect(fake.listeners.get("click")?.size ?? 0).toBe(0);
    win.__foAnalytics.track("add_payment_info", { payment_type: "card" });
    vitals["LCP"]?.({ name: "LCP", value: 1, rating: "good" });
    history.pushState(null, "", "/en-gb/elsewhere");
    await tick();
    expect(fake.dataLayer.length).toBe(before);
    expect(fake.appended).toHaveLength(1);
  });
});
