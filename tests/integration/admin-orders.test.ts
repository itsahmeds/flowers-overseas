/**
 * The read-only order queue over real rows (spec 012 §2.6, AC-13, AC-18, AC-19; T-21's service
 * half, T-22's data and page halves; TASK-222), on a scratch database of a disposable local
 * Postgres 16 — never the shared Phase 0 database. Orders are placed through spec 010's `place()`
 * (T-21 allows `place` directly until the checkout merges) and routed by `demoRoute`; the reads
 * run through the real `src/lib/db.ts` under `app.role = 'admin'`.
 *
 *  - T-21: the queue's head moves the moment an order commits, and the order is the first row of
 *    `listOrdersForAdmin`, so a poll every 3 s shows it within AC-18's 5 s;
 *  - the filters: delivery and placed ranges (placed days in the viewer's zone), the count that
 *    sizes the pager, the status and destination choices;
 *  - `orderDetail` selects the recipient only when asked; neither form carries the
 *    `public_token`, the buyer's name or email; lines, VAT, events, assignments read back;
 *  - T-22 over real rows: the list page's HTML has no recipient name, phone or street and no
 *    `public_token`, and a demo marker exactly for `demo` and `test`; the detail page hides the
 *    recipient from finance and shows it to ops, carries no `public_token`, and every open writes
 *    one `order.viewed` row naming the viewer (AC-13).
 */
import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  country,
  customer,
  partner,
  recipient,
  unique,
} from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";
import { placeInput, type PlaceParents } from "../fixtures/order-engine.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const target = vi.hoisted(() => ({ url: "" }));
// `db.ts` reads the pool's URL through `@/lib/env`; point it at the scratch database.
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
}));

const viewer = vi.hoisted(() => ({
  userId: "",
  roles: ["admin"] as ("admin" | "ops" | "finance" | "content")[],
}));
vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve({
      userId: viewer.userId,
      displayName: "Viewer Test",
      roles: viewer.roles,
      timeZone: "Europe/Tallinn",
    });
  return {
    ...actual,
    requireAdminPage: (
      permission?: Parameters<typeof actual.requireAdminPage>[0],
    ) => actual.requireAdminPage(permission, { session }),
    adminRequestId: () => Promise.resolve(randomUUID()),
  };
});

const orders = await import("@/modules/orders");
const server = await probeLocalServer();

const RECIPIENT = {
  fullName: "Zofia Fikcyjna",
  phoneE164: "+48500111222",
  addressLines: ["ul. Fikcyjna 7/3"],
  postcode: "00-950",
  city: "Warszawa",
  placeKind: "home" as const,
  deliveryNote: "Ring twice",
  cardMessage: "Fixture card text",
};

interface World extends PlaceParents {
  readonly iso2: string;
  readonly addonId: string;
  readonly partnerA: string;
}

let isoCounter = Math.floor(Math.random() * 300);
function nextIso(): string {
  isoCounter += 1;
  const n = (isoCounter % 600) + 40;
  return String.fromCharCode(65 + Math.floor(n / 26), 65 + (n % 26));
}

async function world(tx: Tx): Promise<World> {
  const iso2 = nextIso();
  const countryId = await country(tx, iso2);
  await tx`INSERT INTO country_translation (country_id, locale_code, name, slug)
           VALUES (${countryId}, 'en', ${`Testland ${iso2}`}, ${unique("testland-")})`;
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  const cityId = city?.id ?? "";
  await tx`INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
           VALUES (${cityId}, ${countryId}, 'en', 'Warsaw', ${unique("warsaw-")})`;
  const partnerA = await partner(tx, countryId, "demo");
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Amber Hour', ${unique("amber-hour-")})`;
  const [addon] = await tx<{ id: string }[]>`
    INSERT INTO addon (key, kind)
    VALUES (${`vase_${randomUUID().replaceAll("-", "").slice(0, 8)}`}, 'vessel')
    RETURNING id`;
  const addonId = addon?.id ?? "";
  await tx`INSERT INTO addon_translation (addon_id, locale_code, name)
           VALUES (${addonId}, 'en', 'Glass vase')`;
  const customerId = await customer(tx);
  const recipientId = await recipient(tx, customerId);
  return {
    iso2,
    countryId,
    cityId,
    customerId,
    recipientId,
    productId,
    addonId,
    partnerA,
  };
}

interface Placed {
  readonly orderId: string;
  readonly token: string;
}

/** Places (and, for demo and test, routes) one order in its own committed transaction. */
async function placeOrder(
  scratch: ScratchDatabase,
  w: World,
  mode: "demo" | "test" | "live",
  overrides: { deliveryDate?: string } = {},
): Promise<Placed> {
  return scratch.sql.begin(async (tx) => {
    const db = { db: runnerOf(tx) };
    const { orderId } = await orders.place(
      placeInput(w, {
        mode,
        ...(mode === "live" ? { termsVersion: "2026-10" } : {}),
        deliveryDate: overrides.deliveryDate ?? "2027-02-14",
        buyerTotalMinor: 22_400,
        baseTotalMinor: 22_400,
        vatBreakdown: [
          {
            rateBp: 800,
            netMinor: 17_500,
            vatMinor: 1_400,
            grossMinor: 18_900,
          },
          { rateBp: 2_300, netMinor: 2_846, vatMinor: 654, grossMinor: 3_500 },
        ],
        recipientSnapshot: RECIPIENT,
        lines: [
          {
            kind: "product",
            productId: w.productId,
            tierKey: "stems_18",
            qty: 1,
            unitRetailMinor: 18_900,
            vatRateBp: 800,
          },
          {
            kind: "addon",
            addonId: w.addonId,
            qty: 1,
            unitRetailMinor: 3_500,
            vatRateBp: 2_300,
          },
        ],
      }),
      db,
    );
    if (mode !== "live") {
      await orders.transition(
        orderId,
        "order.authorised",
        "system:demo_guard",
        { mode },
        db,
      );
      await orders.demoRoute(orderId, { ...db, partnerId: w.partnerA });
    }
    const [row] = await tx<{ public_token: string }[]>`
      SELECT public_token FROM "order" WHERE id = ${orderId}`;
    return { orderId, token: row?.public_token ?? "missing" };
  });
}

async function viewRows(
  scratch: ScratchDatabase,
  orderId: string,
): Promise<
  {
    actor_user_id: string | null;
    action: string;
    before: unknown;
    after: unknown;
  }[]
> {
  return scratch.sql`
    SELECT actor_user_id, action, before, after FROM audit_log
    WHERE entity_table = 'order' AND entity_id = ${orderId} ORDER BY at`;
}

async function user(scratch: ScratchDatabase, name: string): Promise<string> {
  const id = randomUUID();
  await scratch.sql`INSERT INTO users (id, email) VALUES (${id}, ${`${unique(name.toLowerCase())}@example.test`})`;
  await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${id}, ${name})`;
  return id;
}

async function renderList(params: Record<string, string>): Promise<string> {
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

describe.skipIf(server.url === undefined)(
  `the admin order queue on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let w: World;
    let demo: Placed;
    let test: Placed;
    let live: Placed;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "adminorders");
      target.url = scratch.url;
      viewer.userId = await user(scratch, "Viewer");
      w = await scratch.sql.begin((tx) => world(tx));
      live = await placeOrder(scratch, w, "live", {
        deliveryDate: "2027-02-12",
      });
      test = await placeOrder(scratch, w, "test", {
        deliveryDate: "2027-02-13",
      });
      demo = await placeOrder(scratch, w, "demo", {
        deliveryDate: "2027-02-14",
      });
    }, 600_000);

    afterAll(async () => {
      await scratch?.drop();
    });

    it("T-21: the head moves when an order commits, and the order is the queue's first row at once", async () => {
      const before = await orders.orderQueueHead();
      const committed = Date.now();
      const placed = await placeOrder(scratch, w, "demo");
      const after = await orders.orderQueueHead();
      const list = await orders.listOrdersForAdmin({ countryIso2: w.iso2 });
      const seenWithin = Date.now() - committed;
      expect(after.count).toBe(before.count + 1);
      expect(after.latestCreatedAt).not.toBe(before.latestCreatedAt);
      expect(list[0]?.orderId).toBe(placed.orderId);
      expect(after.latestCreatedAt).toBe(list[0]?.placedAt);
      // One poll interval (3 s) plus this read stays under AC-18's 5 s.
      expect(seenWithin + 3_000).toBeLessThan(5_000);
      const again = await orders.orderQueueHead();
      expect(again).toEqual(after);
    });

    it("filters by delivery range and by placed days in the viewer's zone, and counts what it filters", async () => {
      const mine = { countryIso2: w.iso2 };
      const ids = async (
        filter: Parameters<typeof orders.listOrdersForAdmin>[0],
      ) =>
        (await orders.listOrdersForAdmin(filter)).map((item) => item.orderId);
      expect(
        await ids({
          ...mine,
          deliveryFrom: "2027-02-13",
          deliveryTo: "2027-02-13",
        }),
      ).toEqual([test.orderId]);
      expect(await ids({ ...mine, deliveryTo: "2027-02-12" })).toEqual([
        live.orderId,
      ]);
      expect(await ids({ ...mine, deliveryFrom: "2027-02-14" })).toContain(
        demo.orderId,
      );
      expect(await ids({ ...mine, deliveryFrom: "2027-02-14" })).not.toContain(
        test.orderId,
      );
      const [today] = await scratch.sql<{ d: string; tomorrow: string }[]>`
        SELECT (now() AT TIME ZONE 'Pacific/Kiritimati')::date::text AS d,
               ((now() AT TIME ZONE 'Pacific/Kiritimati')::date + 1)::text AS tomorrow`;
      // The same instant is "today" in Kiritimati (UTC+14) and placed before Kiritimati's
      // tomorrow: the bounds are read in the zone given, not in UTC.
      expect(
        await ids({
          ...mine,
          createdFrom: today?.d ?? "",
          createdTo: today?.d ?? "",
          timeZone: "Pacific/Kiritimati",
        }),
      ).toContain(demo.orderId);
      expect(
        await ids({
          ...mine,
          createdFrom: today?.tomorrow ?? "",
          timeZone: "Pacific/Kiritimati",
        }),
      ).toEqual([]);
      expect(await ids({ ...mine, createdTo: "2020-01-01" })).toEqual([]);
      const all = await orders.listOrdersForAdmin(mine);
      expect(await orders.countOrdersForAdmin(mine)).toBe(all.length);
      expect(
        await orders.countOrdersForAdmin({ ...mine, status: "placed" }),
      ).toBe(1);
      const options = await orders.orderQueueFilterOptions();
      expect(options.statuses).toEqual(
        expect.arrayContaining(["placed", "routed", "no_partner_available"]),
      );
      expect(options.countries).toContainEqual({
        iso2: w.iso2,
        name: `Testland ${w.iso2}`,
      });
    });

    it("orderDetail selects the recipient only when asked, and never the public token or the buyer", async () => {
      const hidden = await orders.orderDetail(demo.orderId, {
        includeRecipient: false,
      });
      const shown = await orders.orderDetail(demo.orderId, {
        includeRecipient: true,
      });
      expect(hidden?.recipient).toBeNull();
      expect(shown?.recipient).toEqual(RECIPIENT);
      const hiddenJson = JSON.stringify(hidden);
      for (const value of [
        RECIPIENT.fullName,
        RECIPIENT.phoneE164,
        RECIPIENT.addressLines[0] ?? "",
        RECIPIENT.cardMessage,
        RECIPIENT.deliveryNote,
      ]) {
        expect(hiddenJson).not.toContain(value);
      }
      for (const json of [hiddenJson, JSON.stringify(shown)]) {
        expect(json).not.toContain(demo.token);
        expect(json).not.toContain("Test Buyer");
        expect(json).not.toContain("buyer@example.test");
      }
      expect(shown).toMatchObject({
        orderId: demo.orderId,
        mode: "demo",
        status: "routed",
        buyerStatus: "confirmed",
        deliveryDate: "2027-02-14",
        destination: {
          iso2: w.iso2,
          name: `Testland ${w.iso2}`,
          timeZone: "Europe/Warsaw",
        },
        cityName: "Warsaw",
        totalMinor: 22_400,
        currency: "PLN",
        payments: [],
      });
      expect(
        shown?.lines.map((line) => [
          line.kind,
          line.name,
          line.tierKey,
          line.amountMinor,
        ]),
      ).toEqual([
        ["product", "Amber Hour", "stems_18", 18_900],
        ["addon", "Glass vase", null, 3_500],
      ]);
      expect(
        shown?.vatBreakdown.map((split) => [split.rateBp, split.vatMinor]),
      ).toEqual([
        [800, 1_400],
        [2_300, 654],
      ]);
      expect(shown?.events.map((event) => event.type)).toEqual([
        "order.placed",
        "order.authorised",
        "order.routed",
        "assignment.offered",
      ]);
      expect(shown?.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
      expect(shown?.events[2]).toMatchObject({
        fromStatus: "authorised",
        toStatus: "routed",
        payload: { mode: "demo", partnerId: w.partnerA },
      });
      expect(shown?.assignments).toHaveLength(1);
      expect(shown?.assignments[0]).toMatchObject({
        partnerId: w.partnerA,
        attempt: 1,
        response: null,
        respondedAt: null,
      });
      expect(
        await orders.orderDetail(randomUUID(), { includeRecipient: true }),
      ).toBeNull();
    });

    it("T-22: the list page shows no recipient field and no public token, and marks demo and test only", async () => {
      viewer.roles = ["admin"];
      const html = await renderList({ country: w.iso2 });
      for (const placed of [demo, test, live]) {
        expect(html).toContain(`/admin/orders/${placed.orderId}`);
        expect(html).not.toContain(placed.token);
      }
      for (const value of [
        RECIPIENT.fullName,
        RECIPIENT.phoneE164,
        RECIPIENT.addressLines[0] ?? "",
        "Test Buyer",
      ]) {
        expect(html).not.toContain(value);
      }
      const rowOf = (orderId: string): string => {
        const start = html.indexOf(`/admin/orders/${orderId}`);
        return html.slice(start, html.indexOf("</tr>", start));
      };
      expect(rowOf(demo.orderId)).toMatch(/border-dashed[^"]*">Demo</u);
      expect(rowOf(test.orderId)).toMatch(/border-dashed[^"]*">Test</u);
      expect(rowOf(live.orderId)).not.toContain("border-dashed");
    });

    it("T-22 + AC-13: the detail hides the recipient from finance, shows it to ops, never the token, and logs every open", async () => {
      const finance = await user(scratch, "Finance");
      const ops = await user(scratch, "Ops");
      const before = (await viewRows(scratch, demo.orderId)).length;

      viewer.userId = finance;
      viewer.roles = ["finance"];
      const hidden = await renderDetail(demo.orderId);
      for (const value of [
        RECIPIENT.fullName,
        RECIPIENT.phoneE164,
        RECIPIENT.addressLines[0] ?? "",
        RECIPIENT.cardMessage,
      ]) {
        expect(hidden).not.toContain(value);
      }
      expect(hidden).toContain("Hidden for your role.");
      expect(hidden).not.toContain(demo.token);

      viewer.userId = ops;
      viewer.roles = ["ops"];
      const shown = await renderDetail(demo.orderId);
      expect(shown).toContain(RECIPIENT.fullName);
      expect(shown).toContain(RECIPIENT.phoneE164);
      expect(shown).toContain(RECIPIENT.addressLines[0]);
      expect(shown).not.toContain(demo.token);

      const rows = (await viewRows(scratch, demo.orderId)).slice(before);
      expect(rows).toEqual([
        {
          actor_user_id: finance,
          action: "order.viewed",
          before: null,
          after: null,
        },
        {
          actor_user_id: ops,
          action: "order.viewed",
          before: null,
          after: null,
        },
      ]);
    });
  },
);
