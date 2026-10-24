/**
 * `/admin/orders`, `/admin/orders/[id]`, the head endpoint and the queue's URL (spec 012 §2.6,
 * §5.3, AC-18, AC-19; T-22's unit and source-scan halves; TASK-222).
 *
 *  - the queue's query string parses what it can and drops the rest; it maps onto spec 010's
 *    filter with the placed dates in the viewer's zone; hrefs keep the view;
 *  - the list page asks for the head **before** the list, renders the rows spec 010's
 *    `listOrdersForAdmin` returns, a demo marker exactly for `demo` and `test` and none for
 *    `live`, "New" and the polite announcement for rows placed after `since`, the empty and the
 *    filtered-empty states, and no action control;
 *  - the detail asks for the recipient only for `orders.view_pii`, renders it for ops and hides
 *    it for finance with the sentence, logs one view for every role after the order is found, and
 *    renders no action control; an unknown or malformed id is a 404 with nothing logged;
 *  - the head endpoint answers the head with `no-store` and `noindex`, and 403 for `content`;
 *  - the source scan: nothing under `src/modules/admin` or `src/app/admin` writes `order` or
 *    `order_event` or calls `transition`; a fixture that does fails the scan.
 *
 * The data layer is replaced here (no database in the unit project);
 * `tests/integration/admin-orders.test.ts` renders the same pages over real rows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminOrderDetail,
  AdminOrderListItem,
  OrderQueueFilter,
} from "../../src/modules/orders/queries.ts";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { OrderExecutor } from "../../src/modules/orders/service/executor.ts";
import { selectOrderDetail } from "../../src/modules/orders/queries.ts";
import {
  activeOrderFilters,
  isNewSince,
  orderDetailHref,
  orderQueueFilter,
  orderQueueHref,
  orderStatusTone,
  parseOrderQueueQuery,
} from "../../src/modules/admin/orders.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const USER = "11111111-1111-4111-8111-111111111111";
const DEMO_ID = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const TEST_ID = "1c8f2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e";
const LIVE_ID = "2d9a3e4f-5a6b-4c7d-8e8f-9a0b1c2d3e4f";

const data = vi.hoisted(() => ({
  roles: ["admin"] as ("admin" | "ops" | "finance" | "content")[],
  signedIn: true,
  items: [] as AdminOrderListItem[],
  total: 0,
  calls: [] as string[],
  listFilters: [] as OrderQueueFilter[],
  detail: null as AdminOrderDetail | null,
  detailCalls: [] as { id: string; includeRecipient: boolean }[],
  views: [] as { entity: string; id: string }[],
  viewLogFails: false,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve(
      data.signedIn
        ? {
            userId: USER,
            displayName: "Founder Test",
            roles: data.roles,
            timeZone: "Europe/Tallinn",
          }
        : null,
    );
  return {
    ...actual,
    requireAdminPage: (
      permission?: Parameters<typeof actual.requireAdminPage>[0],
    ) => actual.requireAdminPage(permission, { session }),
    requirePermission: (
      permission: Parameters<typeof actual.requirePermission>[0],
    ) => actual.requirePermission(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
    logAdminRead: (_actor: unknown, entity: string, id: string) => {
      if (data.viewLogFails) {
        return Promise.reject(new Error("audit_log write failed"));
      }
      data.views.push({ entity, id });
      return Promise.resolve();
    },
  };
});

vi.mock("@/modules/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/orders")>();
  const delay = () => new Promise((resolve) => setTimeout(resolve, 5));
  return {
    ...actual,
    orderQueueHead: async () => {
      data.calls.push("head:start");
      await delay();
      data.calls.push("head:end");
      return {
        latestCreatedAt: data.items[0]?.placedAt ?? null,
        count: data.total,
      };
    },
    listOrdersForAdmin: (filter: OrderQueueFilter) => {
      data.calls.push("list:start");
      data.listFilters.push(filter);
      return Promise.resolve(data.items);
    },
    countOrdersForAdmin: () => Promise.resolve(data.total),
    orderQueueFilterOptions: () =>
      Promise.resolve({
        statuses: ["placed", "routed"],
        countries: [{ iso2: "PL", name: "Poland" }],
      }),
    orderDetail: (id: string, options: { includeRecipient: boolean }) => {
      data.detailCalls.push({ id, includeRecipient: options.includeRecipient });
      const detail = data.detail;
      if (detail === null || detail.orderId !== id)
        return Promise.resolve(null);
      return Promise.resolve(
        options.includeRecipient ? detail : { ...detail, recipient: null },
      );
    },
  };
});

function item(
  orderId: string,
  mode: "demo" | "test" | "live",
  placedAt: string,
  reference: string,
): AdminOrderListItem {
  return {
    orderId,
    purchaseId: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    reference,
    mode,
    buyerStatus: "confirmed",
    deliveryDate: "2026-10-08",
    cityName: "Warszawa",
    productName: "Amber Hour",
    tierKey: "stems_12",
    placedAt,
    status: "routed",
    totalMinor: 19_900,
    currency: "PLN",
    assignedPartner: {
      partnerId: "3f2a9c1e-5b7d-4e2a-9c1e-5b7d4e2a9c1e",
      code: "pl-waw-demo-1",
    },
  };
}

const RECIPIENT_NAME = "Anna Kowalska";
const RECIPIENT_PHONE = "+48221234567";
const RECIPIENT_STREET = "ul. Marszałkowska 10/5";

function detail(mode: "demo" | "live" = "demo"): AdminOrderDetail {
  return {
    orderId: DEMO_ID,
    reference: "FO-3HNP-A4TV",
    mode,
    status: "in_production",
    buyerStatus: "being_made",
    placedAt: "2026-10-05T08:05:02.000Z",
    deliveryDate: "2026-10-07",
    deliveryWindow: null,
    destination: { iso2: "PL", name: "Poland", timeZone: "Europe/Warsaw" },
    cityName: "Warszawa",
    totalMinor: 26_400,
    currency: "PLN",
    vatBreakdown: [
      { rateBp: 800, netMinor: 21_204, vatMinor: 1_696, grossMinor: 22_900 },
      { rateBp: 2_300, netMinor: 2_846, vatMinor: 654, grossMinor: 3_500 },
    ],
    lines: [
      {
        lineId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "product",
        name: "Amber Hour",
        tierKey: "stems_18",
        qty: 1,
        unitRetailMinor: 22_900,
        amountMinor: 22_900,
        vatRateBp: 800,
      },
      {
        lineId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "addon",
        name: "Vase",
        tierKey: null,
        qty: 1,
        unitRetailMinor: 3_500,
        amountMinor: 3_500,
        vatRateBp: 2_300,
      },
    ],
    recipient: {
      fullName: RECIPIENT_NAME,
      phoneE164: RECIPIENT_PHONE,
      addressLines: [RECIPIENT_STREET],
      postcode: "00-001",
      city: "Warszawa",
      placeKind: "home",
      deliveryNote: "Please call when you are downstairs.",
      cardMessage: "Happy birthday, Mama!",
    },
    events: [
      {
        seq: 1,
        type: "order.placed",
        fromStatus: null,
        toStatus: null,
        actor: "system:demo",
        occurredAt: "2026-10-05T08:05:02.000Z",
        payload: { mode: "demo", lineCount: 2 },
      },
      {
        seq: 2,
        type: "order.authorised",
        fromStatus: "placed",
        toStatus: "authorised",
        actor: "system:demo_guard",
        occurredAt: "2026-10-05T08:05:02.400Z",
        payload: { mode: "demo" },
      },
      {
        seq: 3,
        type: "assignment.offered",
        fromStatus: "routed",
        toStatus: "routed",
        actor: "system:demo_router",
        occurredAt: "2026-10-05T08:05:03.000Z",
        payload: { mode: "demo" },
      },
    ],
    assignments: [
      {
        assignmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        partnerId: "3f2a9c1e-5b7d-4e2a-9c1e-5b7d4e2a9c1e",
        partnerCode: "pl-waw-demo-2",
        attempt: 1,
        offeredAt: "2026-10-05T08:05:03.000Z",
        answerBy: "2026-10-05T09:05:03.000Z",
        respondedAt: "2026-10-05T08:09:41.000Z",
        response: "accept",
        reason: null,
      },
    ],
    payments: [],
  };
}

async function renderList(
  params: Record<string, string> = {},
): Promise<string> {
  const { default: Page } =
    await import("../../src/app/admin/(signed-in)/orders/page.tsx");
  return renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve(params) }),
  );
}

async function renderDetail(id: string): Promise<string> {
  const { default: Page } =
    await import("../../src/app/admin/(signed-in)/orders/[id]/page.tsx");
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id }) }));
}

async function thrown(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return new Error("did not throw");
}

const digestOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not a Next interrupt: ${String(error)}`;

/**
 * Every control in the page's `<main>` that could act: a form that is not a GET, a button outside
 * a GET form, a `formAction`. The shell around `<main>` (navigation, sign-out) is TASK-217's.
 */
function actionControls(page: string): string[] {
  const start = page.indexOf("<main");
  const html =
    start < 0 ? page : page.slice(start, page.lastIndexOf("</main>"));
  const found: string[] = [];
  for (const form of html.matchAll(/<form\b[^>]*>/gu)) {
    if (!/\bmethod="get"/u.test(form[0])) found.push(form[0]);
  }
  const outsideForms = html.replace(/<form\b[\s\S]*?<\/form>/gu, "");
  for (const button of outsideForms.matchAll(/<button\b[^>]*>/gu)) {
    found.push(button[0]);
  }
  for (const action of html.matchAll(/\bformAction=|\bformaction=/gu)) {
    found.push(action[0]);
  }
  return found;
}

beforeEach(() => {
  data.roles = ["admin"];
  data.signedIn = true;
  data.items = [
    item(DEMO_ID, "demo", "2026-10-05T11:32:00.000Z", "FO-7K2M-Q9XD"),
    item(TEST_ID, "test", "2026-10-05T08:05:00.000Z", "FO-3HNP-A4TV"),
    item(LIVE_ID, "live", "2026-10-04T15:40:00.000Z", "FO-Q8WD-2M7C"),
  ];
  data.total = 3;
  data.calls.length = 0;
  data.listFilters.length = 0;
  data.detail = detail();
  data.detailCalls.length = 0;
  data.views.length = 0;
  data.viewLogFails = false;
});

describe("the queue's query string", () => {
  it("keeps what parses and drops the rest", () => {
    expect(
      parseOrderQueueQuery({
        status: "routed",
        country: "PL",
        deliveryFrom: "2026-10-01",
        deliveryTo: "2026-10-31",
        placedFrom: "2026-10-01",
        placedTo: ["2026-10-05", "2026-10-06"],
        page: "2",
        since: "2026-10-05T11:32:00.000Z",
        token: "abc",
      }),
    ).toEqual({
      status: "routed",
      country: "PL",
      deliveryFrom: "2026-10-01",
      deliveryTo: "2026-10-31",
      placedFrom: "2026-10-01",
      placedTo: "2026-10-05",
      page: 2,
      since: "2026-10-05T11:32:00.000Z",
    });
    expect(
      parseOrderQueueQuery({
        status: "Routed; drop",
        country: "pl",
        deliveryFrom: "tomorrow",
        page: "1",
        since: "yesterday",
      }),
    ).toEqual({});
    expect(parseOrderQueueQuery(undefined)).toEqual({});
  });

  it("maps onto spec 010's filter, the placed days in the viewer's zone", () => {
    expect(
      orderQueueFilter(
        parseOrderQueueQuery({
          status: "routed",
          country: "PL",
          deliveryFrom: "2026-10-01",
          deliveryTo: "2026-10-31",
          placedFrom: "2026-10-02",
          placedTo: "2026-10-05",
          page: "3",
          since: "2026-10-05T11:32:00.000Z",
        }),
        "Europe/Tallinn",
      ),
    ).toEqual({
      status: "routed",
      countryIso2: "PL",
      deliveryFrom: "2026-10-01",
      deliveryTo: "2026-10-31",
      createdFrom: "2026-10-02",
      createdTo: "2026-10-05",
      timeZone: "Europe/Tallinn",
      page: 3,
    });
    expect(orderQueueFilter({}, "UTC")).toEqual({ timeZone: "UTC", page: 1 });
  });

  it("builds hrefs of ids, codes and dates, page 1 without a key", () => {
    const query = parseOrderQueueQuery({ country: "PL", page: "2" });
    expect(orderQueueHref(query)).toBe("/admin/orders?country=PL&page=2");
    expect(orderQueueHref(query, { page: 1 })).toBe("/admin/orders?country=PL");
    expect(orderQueueHref(query, { since: "2026-10-05T11:32:00.000Z" })).toBe(
      "/admin/orders?country=PL&page=2&since=2026-10-05T11%3A32%3A00.000Z",
    );
    expect(orderQueueHref({})).toBe("/admin/orders");
    expect(orderDetailHref(DEMO_ID)).toBe(`/admin/orders/${DEMO_ID}`);
    expect(() => orderDetailHref("FO-7K2M-Q9XD")).toThrow();
    expect(
      activeOrderFilters({ placedFrom: "2026-10-01", placedTo: "2026-10-02" }),
    ).toBe(1);
    expect(
      activeOrderFilters({ since: "2026-10-05T11:32:00.000Z", page: 2 }),
    ).toBe(0);
  });

  it("marks as new only what was placed after since", () => {
    expect(
      isNewSince("2026-10-05T11:32:00.001Z", "2026-10-05T11:32:00.000Z"),
    ).toBe(true);
    expect(
      isNewSince("2026-10-05T11:32:00.000Z", "2026-10-05T11:32:00.000Z"),
    ).toBe(false);
    expect(isNewSince("2026-10-05T11:32:00.001Z", undefined)).toBe(false);
  });

  it("tones a status by whether it moves, is done, needs a person or ended", () => {
    expect(orderStatusTone("routed")).toBe("moving");
    expect(orderStatusTone("in_production")).toBe("moving");
    expect(orderStatusTone("photo_uploaded")).toBe("done");
    expect(orderStatusTone("no_partner_available")).toBe("attention");
    expect(orderStatusTone("cancelled")).toBe("ended");
  });
});

describe("/admin/orders (AC-18, AC-19)", () => {
  it("reads the head before the list, and the list through listOrdersForAdmin with the view's filter", async () => {
    await renderList({ country: "PL", placedFrom: "2026-10-01" });
    expect(data.calls.indexOf("head:end")).toBeGreaterThanOrEqual(0);
    expect(data.calls.indexOf("head:end")).toBeLessThan(
      data.calls.indexOf("list:start"),
    );
    expect(data.listFilters).toEqual([
      {
        countryIso2: "PL",
        createdFrom: "2026-10-01",
        timeZone: "Europe/Tallinn",
        page: 1,
      },
    ]);
  });

  it("renders a demo marker exactly for demo and test orders", async () => {
    const html = await renderList();
    const marker = /border-dashed[^"]*">(Demo|Test|Live)</gu;
    // The table and the 390 cards each draw every row once.
    expect([...html.matchAll(marker)].map((m) => m[1])).toEqual([
      "Demo",
      "Test",
      "Demo",
      "Test",
    ]);
    const liveRow = html.slice(html.indexOf("FO-Q8WD-2M7C"));
    expect(liveRow.slice(0, liveRow.indexOf("</tr>"))).not.toContain(
      "border-dashed",
    );
  });

  it("shows the row's facts: reference link, placed time in the viewer's zone, delivery day, city, status, buyer projection, florist, total", async () => {
    const html = await renderList();
    expect(html).toContain(`href="/admin/orders/${DEMO_ID}"`);
    expect(html).toContain("FO-7K2M-Q9XD");
    expect(html).toContain("Placed (Tallinn)");
    expect(html).toContain("5 Oct, 14:32");
    expect(html).toContain("Thu, 8 Oct");
    expect(html).toContain("Warszawa");
    expect(html).toContain("<code");
    expect(html).toContain(">routed</code>");
    expect(html).toContain("buyer sees: confirmed");
    expect(html).toContain("pl-waw-demo-1");
    expect(html).toContain("199.00\u00a0PLN");
    expect(html).toContain("1 to 3 of 3 · newest first · 50 a page");
    expect(html).toContain('aria-label="Filter orders"');
    expect(html).toContain("Checking for new orders every 3 seconds");
    expect(html).not.toContain("Older");
  });

  it("marks rows placed after since as New and announces how many", async () => {
    const html = await renderList({ since: "2026-10-05T08:05:00.000Z" });
    expect(html.match(/>New</gu)).toHaveLength(2);
    expect(html).toContain('<span class="sr-only">1 new order</span>');
    const none = await renderList();
    expect(none).not.toContain(">New<");
    expect(none).toContain('<span class="sr-only"></span>');
  });

  it("carries since into the arrival href: the head the tab opened on", async () => {
    // Rendered props are not in the markup; the href is checked through the helper the page uses.
    expect(
      orderQueueHref(parseOrderQueueQuery({ country: "PL" }), {
        since: "2026-10-05T11:32:00.000Z",
      }),
    ).toContain("since=");
  });

  it("offers the older page when there is one", async () => {
    data.total = 120;
    const html = await renderList();
    expect(html).toContain("1 to 3 of 120");
    expect(html).toContain('href="/admin/orders?page=2"');
  });

  it("renders the empty and the filtered-empty states", async () => {
    data.items = [];
    data.total = 0;
    const empty = await renderList();
    expect(empty).toContain("No orders yet");
    expect(empty).toContain(
      "Orders appear here within 5 seconds of being placed.",
    );
    const filtered = await renderList({ country: "PL" });
    expect(filtered).toContain("No orders match these filters");
    expect(filtered).toContain("Clear filters");
  });

  it("renders no action control: the only forms are the filters' GET", async () => {
    const html = await renderList();
    expect(actionControls(html)).toEqual([]);
    const main = html.slice(html.indexOf("<main"));
    expect(main.match(/<form\b/gu)).toHaveLength(2);
    // The scan bites: a POST form and a loose button inside <main> are found.
    const tampered = html.replace(
      "</main>",
      '<form method="post"></form><button>Cancel</button></main>',
    );
    expect(actionControls(tampered)).toHaveLength(2);
  });

  it("is refused to a role without orders.view", async () => {
    data.roles = ["content"];
    expect(digestOf(await thrown(() => renderList()))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;403",
    );
    expect(data.calls).toEqual([]);
  });
});

describe("/admin/orders/[id] (AC-13, AC-19)", () => {
  it("asks for and shows the recipient for ops, and logs the view once", async () => {
    data.roles = ["ops"];
    const html = await renderDetail(DEMO_ID);
    expect(data.detailCalls).toEqual([{ id: DEMO_ID, includeRecipient: true }]);
    expect(html).toContain(RECIPIENT_NAME);
    expect(html).toContain(RECIPIENT_PHONE);
    expect(html).toContain(RECIPIENT_STREET);
    expect(html).toContain("00-001 Warszawa");
    expect(html).toContain("Opening this order is recorded in the audit log.");
    expect(data.views).toEqual([{ entity: "order", id: DEMO_ID }]);
  });

  it("never asks for the recipient for finance, shows the sentence, and still logs the view", async () => {
    data.roles = ["finance"];
    const html = await renderDetail(DEMO_ID);
    expect(data.detailCalls).toEqual([
      { id: DEMO_ID, includeRecipient: false },
    ]);
    expect(html).toContain(
      "Hidden for your role. Admin and ops can see the recipient&#x27;s details.",
    );
    for (const value of [
      RECIPIENT_NAME,
      RECIPIENT_PHONE,
      RECIPIENT_STREET,
      "Happy birthday",
    ]) {
      expect(html).not.toContain(value);
    }
    expect(data.views).toEqual([{ entity: "order", id: DEMO_ID }]);
  });

  it("renders lines, VAT, totals, the timeline with payloads, assignments and payments, and no action control", async () => {
    const html = await renderDetail(DEMO_ID);
    expect(html).toContain("FO-3HNP-A4TV");
    expect(html).toContain("Placed 5 Oct 2026, 11:05 (Tallinn)");
    expect(html).toContain("Amber Hour · stems_18");
    expect(html).toContain("229.00\u00a0PLN");
    expect(html).toContain("23%");
    expect(html).toContain("included");
    expect(html).toContain("Total, VAT and delivery included");
    expect(html).toContain("264.00\u00a0PLN");
    expect(html).toContain("of which VAT 8%");
    expect(html).toContain("16.96\u00a0PLN");
    expect(html).toContain("6.54\u00a0PLN");
    expect(html).toContain("Poland · Europe/Warsaw");
    expect(html).toContain("Wed, 7 Oct (local)");
    expect(html).toContain(">order.placed</code>");
    expect(html).toContain("5 Oct, 11:05:02");
    expect(html).toContain("→ placed · <code>system:demo</code>");
    expect(html).toContain("placed → authorised");
    expect(html).toContain("routed, unchanged");
    expect(html).toContain("&quot;lineCount&quot;: 2");
    expect(html).toContain("Show the payload");
    expect(html).toContain("Accepted 11:09");
    expect(html).toContain("pl-waw-demo-2");
    expect(html).toContain("No payment. Demo orders are never charged.");
    expect(html).toContain("Changes to orders are not available in admin yet.");
    expect(actionControls(html)).toEqual([]);
    expect(html.slice(html.indexOf("<main"))).not.toContain("<form");
  });

  it("fails closed when the view cannot be logged: the page rejects and nothing renders (AC-13, hole 2)", async () => {
    data.roles = ["ops"];
    data.viewLogFails = true;
    let html: string | undefined;
    const error = await thrown(async () => {
      html = await renderDetail(DEMO_ID);
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("audit_log write failed");
    expect(html).toBeUndefined();
    expect(data.detailCalls).toEqual([{ id: DEMO_ID, includeRecipient: true }]);
  });

  it("is a 404 with nothing read or logged for a malformed id, and with nothing logged for an unknown one", async () => {
    expect(digestOf(await thrown(() => renderDetail("FO-3HNP-A4TV")))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(data.detailCalls).toEqual([]);
    expect(digestOf(await thrown(() => renderDetail(LIVE_ID)))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(data.detailCalls).toHaveLength(1);
    expect(data.views).toEqual([]);
  });

  it("says a live order without a payment has none yet, with no demo marker", async () => {
    data.detail = detail("live");
    const html = await renderDetail(DEMO_ID);
    expect(html).toContain("No payment yet.");
    expect(html).not.toContain("border-dashed");
  });
});

describe("GET /admin/api/orders/head", () => {
  it("answers the head, never cached and never indexed", async () => {
    data.roles = ["finance"];
    const { GET } =
      await import("../../src/app/admin/api/orders/head/route.ts");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // The poll reads only this tag; equal heads give equal tags.
    expect(response.headers.get("etag")).toBe('"3.2026-10-05T11:32:00.000Z"');
    expect(await response.json()).toEqual({
      latestCreatedAt: "2026-10-05T11:32:00.000Z",
      count: 3,
    });
  });

  it("is 403 for a role without orders.view, reading nothing", async () => {
    data.roles = ["content"];
    const { GET } =
      await import("../../src/app/admin/api/orders/head/route.ts");
    expect(digestOf(await thrown(() => GET()))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;403",
    );
    expect(data.calls).toEqual([]);
  });
});

/* -------------------------------------------------------------- the detail query (AC-19) */

describe("selectOrderDetail: the recipient snapshot is selected only when asked (AC-19)", () => {
  const dialect = new PgDialect();
  const SNAPSHOT = detail().recipient;

  /** A fake executor answering each of the detail's five statements, recording their text. */
  function executor(statements: string[]): OrderExecutor {
    return {
      execute(query: SQL) {
        const text = dialect.sqlToQuery(query).sql;
        statements.push(text);
        if (text.includes('FROM "order" o')) {
          return Promise.resolve([
            {
              id: DEMO_ID,
              mode: "demo",
              status: "routed",
              buyer_status: "confirmed",
              placed_at: "2026-10-05T08:05:02.000Z",
              delivery_date: "2026-10-07",
              delivery_window: null,
              iso2: "PL",
              country_name: "Poland",
              iana_zone: "Europe/Warsaw",
              city_name: "Warszawa",
              total_minor: "26400",
              currency: "PLN",
              vat_breakdown: detail().vatBreakdown,
              // What a database would answer if the column were selected regardless.
              recipient_snapshot: SNAPSHOT,
            },
          ]);
        }
        return Promise.resolve([]);
      },
    };
  }

  it("leaves recipient_snapshot out of the SQL, and the result, without orders.view_pii", async () => {
    const statements: string[] = [];
    const result = await selectOrderDetail(executor(statements), DEMO_ID, {
      includeRecipient: false,
    });
    expect(statements).toHaveLength(5);
    expect(statements[0]).toContain("NULL::jsonb AS recipient_snapshot");
    expect(statements[0]).not.toMatch(/o\.recipient_snapshot/u);
    // Even a row that carried the snapshot yields none.
    expect(result?.recipient).toBeNull();
  });

  it("selects it with orders.view_pii, and never the public token or the buyer snapshot", async () => {
    const statements: string[] = [];
    const result = await selectOrderDetail(executor(statements), DEMO_ID, {
      includeRecipient: true,
    });
    expect(statements[0]).toMatch(
      /o\.recipient_snapshot AS recipient_snapshot/u,
    );
    expect(result?.recipient).toEqual(SNAPSHOT);
    const all = statements.join("\n");
    expect(all).not.toContain("public_token");
    expect(all).not.toContain("buyer_snapshot");
  });
});

/* -------------------------------------------------------------- source scan (T-22) */

const repoRoot = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap((entry) => {
    const path = join(repoRoot, dir, entry);
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

/** What would write an order or its events, or move its status. */
const ORDER_WRITES: readonly RegExp[] = [
  /\b(?:insert\s+into|update|delete\s+from)\s+"?order(?:_event)?"?\b/iu,
  /\.(?:insert|update|delete)\(\s*(?:order|orderEvent)\s*\)/u,
  /\btransition\s*\(/u,
  /\borderService\s*\.\s*(?:transition|place|appendEvent|demoRoute)\b/u,
  /\b(?:appendEvent|demoRoute)\s*\(/u,
  /\bimport\s*\{[^}]*\b(?:transition|appendEvent|demoRoute|orderService)\b[^}]*\}\s*from\s*["']@\/modules\/orders/u,
];

function orderWrites(source: string): string[] {
  return ORDER_WRITES.filter((pattern) => pattern.test(source)).map(String);
}

describe("T-22 source scan — admin writes no order and calls no transition (AC-19)", () => {
  const files = [...walk("src/modules/admin"), ...walk("src/app/admin")].filter(
    (file) => /\.(?:ts|tsx)$/u.test(file),
  );

  it("finds the order pages and the admin module", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/app/admin/(signed-in)/orders/page.tsx",
        "src/app/admin/(signed-in)/orders/[id]/page.tsx",
        "src/app/admin/api/orders/head/route.ts",
        "src/modules/admin/orders.ts",
      ]),
    );
  });

  it.each(files)(
    "%s writes no order or order_event and calls no transition",
    (file) => {
      expect(orderWrites(readFileSync(join(repoRoot, file), "utf8"))).toEqual(
        [],
      );
    },
  );

  it("goes red on each shape a write can take (the scan bites)", () => {
    for (const fixture of [
      'await db.execute(sql`UPDATE "order" SET status = ${s}`);',
      "await db.execute(sql`INSERT INTO order_event (seq) VALUES (1)`);",
      "await db.insert(orderEvent).values(row);",
      "await db.update(order).set({ status });",
      'await transition(id, "order.cancelled", actor, payload);',
      "await orderService.transition(id, event);",
      'import { transition } from "@/modules/orders";',
      "await appendEvent(id, event);",
    ]) {
      expect(orderWrites(fixture), fixture).not.toEqual([]);
    }
  });
});
