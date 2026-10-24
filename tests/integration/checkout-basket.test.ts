/**
 * The basket against a migrated PG16 (spec 010 §14 A-founder-2026-10-22; T-06 rewritten, T-54,
 * T-55, T-56, T-59 server half, T-60 server half, T-61, T-62, T-76, T-78; AC-6, AC-54, AC-55,
 * AC-56, AC-59, AC-60, AC-61, AC-62, AC-76, AC-78; TASK-348).
 *
 * Every case runs on a scratch database of a disposable local Postgres 16 (`support/scratch-db.ts`),
 * entered as `app_web` with `app.role = 'system'` exactly as `withSystemContext('checkout', …)`
 * enters it, inside a transaction that is rolled back; the concurrency cases commit, on their own
 * connections, and clean up after themselves. Flags are injected (`checkout.open` on,
 * `checkout.demo_guard` on, so the mode is `demo`); the clock is injected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { BASKET_MAX_LINES } from "@/config/checkout";
import { logger } from "@/lib/logger";
import {
  listProducts,
  listTiers,
  priceProjection,
  quote,
} from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type Draft,
  type DraftConnection,
  type StepOutcome,
  assessBasket,
  createDraft,
  deriveQuote,
  draftTokenFromCookieHeader,
  linePriceChange,
  loadDraft,
  nextDeliveryDate,
  runRecipientStep,
  runRemoveLine,
  runUpdateSelection,
  runUseNextDate,
  startCheckout,
} from "@/modules/checkout";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";

import { country } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;

const PRODUCTS = await listProducts({ countryIso: "PL" });
const [PRODUCT, SECOND] = PRODUCTS;
if (PRODUCT === undefined || SECOND === undefined) {
  throw new Error("the dataset needs two products priced for PL");
}
const SKU = PRODUCT.sku;
const [TIER] = await listTiers(SKU);
const [SECOND_TIER] = await listTiers(SECOND.sku);
if (TIER === undefined || SECOND_TIER === undefined) {
  throw new Error("each product needs a tier");
}

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const CLOSED: CheckoutFlagReader = (key) =>
  Promise.resolve(key !== "checkout.open");

/** The keys AC-78 allows on a basket log line, and no other. */
const AC78_KEYS = new Set([
  "draft_id",
  "purchase_id",
  "position",
  "order_count",
  "country_iso",
  "mode",
  "code",
  "duration_ms",
]);

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_basket");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

/** PL (and DE, which has no calendar), both products, then the system context. */
async function seeded(tx: Tx): Promise<DraftConnection> {
  await country(tx, "PL");
  await country(tx, "DE");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  for (const sku of [SKU, SECOND?.sku ?? ""]) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      ON CONFLICT DO NOTHING`;
  }
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

async function shown(
  locale: "pl" | "en-gb",
  sku = SKU,
  tierKey = TIER?.tierKey ?? "",
  now = T0,
): Promise<{ amountMinor: number; currency: string }> {
  const projection = await priceProjection(locale, {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now,
  });
  return {
    amountMinor: projection.displayPrice.amountMinor,
    currency: projection.displayPrice.currency,
  };
}

function startRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://flowersoverseas.test/api/checkout/start", {
    method: "POST",
    headers: {
      host: "flowersoverseas.test",
      origin: "http://flowersoverseas.test",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function fields(
  options: {
    locale?: "pl" | "en-gb";
    sku?: string;
    tierKey?: string;
    countryIso?: string;
    then?: "basket" | "checkout";
    now?: Date;
  } = {},
): Promise<Record<string, string>> {
  const locale = options.locale ?? "pl";
  const sku = options.sku ?? SKU;
  const tierKey = options.tierKey ?? TIER?.tierKey ?? "";
  const display = await shown(locale, sku, tierKey, options.now ?? T0);
  return {
    locale,
    countryIso: options.countryIso ?? "PL",
    sku,
    tierKey,
    expectedTotalMinor: String(display.amountMinor),
    expectedCurrency: display.currency,
    then: options.then ?? "basket",
  };
}

interface Started {
  readonly response: Response;
  readonly cookies: readonly string[];
}

async function post(
  connection: DraftConnection,
  body: Record<string, string>,
  options: {
    token?: string | null;
    now?: Date;
    flags?: CheckoutFlagReader;
    headers?: Record<string, string>;
  } = {},
): Promise<Started> {
  const response = await startCheckout(
    startRequest(body, {
      ...(options.token === undefined || options.token === null
        ? {}
        : { cookie: `fo_checkout=${options.token}` }),
      ...options.headers,
    }),
    {
      now: () => options.now ?? T0,
      connection,
      flags: options.flags ?? OPEN,
    },
  );
  return { response, cookies: response.headers.getSetCookie() };
}

function tokenOf(started: Started): string {
  const token = draftTokenFromCookieHeader(
    started.cookies.find((cookie) => cookie.startsWith("fo_checkout=")),
  );
  if (token === null) {
    throw new Error(`no basket started: ${String(started.response.status)}`);
  }
  return token;
}

function basketCookie(started: Started): string | undefined {
  return started.cookies.find((cookie) => cookie.startsWith("fo_basket="));
}

async function basket(
  connection: DraftConnection,
  token: string,
  now = at(1),
): Promise<Draft> {
  const lookup = await loadDraft(token, now, connection);
  if (lookup.status !== "active") throw new Error(`basket is ${lookup.status}`);
  return lookup.draft;
}

async function lineCount(tx: Tx): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM checkout_draft_line`;
  return row?.n ?? -1;
}

function form(values: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of typeof value === "string" ? [value] : value) {
      data.append(key, item);
    }
  }
  return data;
}

function ctx(
  connection: DraftConnection,
  token: string,
  now: Date,
  flags: CheckoutFlagReader = OPEN,
) {
  return { locale: "pl", token, connection, flags, now: () => now };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(
      `expected a redirect, got ${JSON.stringify(outcome.state)}`,
    );
  }
  return outcome.location;
}

/** A correctly signed quote for line `sku`/`tier` at the provider's amount plus `delta`. */
async function signedAt(
  sku: string,
  tierKey: string,
  now: Date,
  delta: number,
) {
  const projection = await priceProjection("pl", {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now,
  });
  return quote(
    [
      {
        productId: sku,
        tierKey,
        projection: {
          ...projection,
          displayPrice: {
            ...projection.displayPrice,
            amountMinor: toMinor(projection.displayPrice.amountMinor + delta),
          },
        },
      },
    ],
    now,
  );
}

describe.skipIf(server.url === undefined)(
  `the basket on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      if (db === undefined) throw new Error("no scratch database");
      return rolledBack(db.sql, fn);
    };

    describe("T-06 (rewritten): the start route appends", () => {
      it("no cookie: one basket, one line, fo_checkout (30 days) and fo_basket=1; then=basket goes to the basket with the added notice", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const started = await post(connection, await fields());
          expect(started.response.status).toBe(303);
          expect(started.response.headers.get("location")).toBe("/pl/basket");
          expect(started.response.headers.get("cache-control")).toBe(
            "no-store",
          );
          const [checkout = "", count = ""] = started.cookies;
          expect(checkout).toMatch(
            /^fo_checkout=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/u,
          );
          expect(count).toBe(
            "fo_basket=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax",
          );
          const draft = await basket(connection, tokenOf(started));
          expect(draft.lines.map((line) => line.position)).toEqual([1]);
          expect(draft.pendingNotice).toBe("added");
          expect(draft.currency).toBe("PLN");
        });
      });

      it("a valid cookie for an unplaced basket: the same basket, line 2, no new fo_checkout, fo_basket=2; then=checkout goes to the checkout", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          const second = await post(
            connection,
            await fields({
              sku: SECOND?.sku ?? "",
              tierKey: SECOND_TIER?.tierKey ?? "",
              then: "checkout",
            }),
            { token, now: at(1) },
          );
          expect(second.response.status).toBe(303);
          expect(second.response.headers.get("location")).toBe("/pl/checkout");
          expect(
            second.cookies.some((cookie) => cookie.startsWith("fo_checkout=")),
          ).toBe(false);
          expect(basketCookie(second)).toBe(
            "fo_basket=2; Path=/; Max-Age=2592000; Secure; SameSite=Lax",
          );
          const draft = await basket(connection, token, at(2));
          expect(draft.lines.map((line) => [line.position, line.sku])).toEqual([
            [1, SKU],
            [2, SECOND?.sku],
          ]);
          const [{ n: drafts } = { n: -1 }] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM checkout_draft`;
          expect(drafts).toBe(1);
        });
      });

      it("a mismatched expected total and currency: the line's notice names both amounts", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const body = await fields();
          const token = tokenOf(
            await post(connection, {
              ...body,
              expectedTotalMinor: String(
                Number(body["expectedTotalMinor"]) - 300,
              ),
              expectedCurrency: "EUR",
            }),
          );
          const [line] = (await basket(connection, token)).lines;
          expect(
            linePriceChange({
              quote: line?.quote ?? null,
              lastSeen: line?.lastSeen ?? null,
            }),
          ).toEqual({
            previous: {
              amountMinor: Number(body["expectedTotalMinor"]) - 300,
              currency: "EUR",
            },
            current: {
              amountMinor: Number(body["expectedTotalMinor"]),
              currency: "PLN",
            },
          });
        });
      });
    });

    describe("T-54: appends serialise; a placed basket is never appended to", () => {
      it("two parallel appends get the next two positions, no gap, no duplicate", async () => {
        if (db === undefined) throw new Error("no scratch database");
        const sql = db.sql;
        // Committed setup: the products and a one-line basket.
        const token = await sql.begin(async (tx) => {
          const connection = await seeded(tx);
          return tokenOf(await post(connection, await fields()));
        });
        const append = (sku: string, tierKey: string) =>
          sql.begin(async (tx) => {
            await asApp(tx, { role: "system" });
            return post(
              { executor: runnerOf(tx) },
              await fields({ sku, tierKey }),
              { token, now: at(1) },
            );
          });
        const results = await Promise.all([
          append(SKU, TIER?.tierKey ?? ""),
          append(SECOND?.sku ?? "", SECOND_TIER?.tierKey ?? ""),
        ]);
        const positions = await sql<{ position: number }[]>`
          SELECT l.position FROM checkout_draft_line l
          JOIN checkout_draft d ON d.id = l.draft_id
          WHERE d.token_sha256 = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')
          ORDER BY l.position`;
        expect(positions.map((row) => row.position)).toEqual([1, 2, 3]);
        expect(results.map((r) => r.response.status)).toEqual([303, 303]);
        expect(
          results.map((r) => basketCookie(r)?.split(";")[0]).sort(),
        ).toEqual(["fo_basket=2", "fo_basket=3"]);
        await sql`DELETE FROM checkout_draft
                  WHERE token_sha256 = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')`;
      });

      it("a basket emptied by Remove takes two parallel appends at positions 1 and 2", async () => {
        if (db === undefined) throw new Error("no scratch database");
        const sql = db.sql;
        const token = await sql.begin(async (tx) => {
          const connection = await seeded(tx);
          const started = tokenOf(await post(connection, await fields()));
          const removed = await runRemoveLine(
            ctx(connection, started, at(1)),
            form({ line: "1" }),
          );
          expect(removed).toEqual({
            kind: "redirect",
            location: "/pl/basket",
            basketCount: 0,
          });
          return started;
        });
        const append = () =>
          sql.begin(async (tx) => {
            await asApp(tx, { role: "system" });
            return post({ executor: runnerOf(tx) }, await fields(), {
              token,
              now: at(2),
            });
          });
        await Promise.all([append(), append()]);
        const positions = await sql<{ position: number }[]>`
          SELECT l.position FROM checkout_draft_line l
          JOIN checkout_draft d ON d.id = l.draft_id
          WHERE d.token_sha256 = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')
          ORDER BY l.position`;
        expect(positions.map((row) => row.position)).toEqual([1, 2]);
        await sql`DELETE FROM checkout_draft
                  WHERE token_sha256 = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')`;
      });

      it("an add with a placed basket's cookie starts a new basket and token; the placed one is byte-equal", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          const draft = await basket(connection, token);
          const [purchase] = await tx<{ id: string }[]>`
            INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code)
            VALUES ('demo', 'PLN', 1, 'pl') RETURNING id`;
          await tx`UPDATE checkout_draft SET purchase_id = ${purchase?.id ?? ""}
                   WHERE id = ${draft.id}`;
          const snapshot = () => tx<{ row: string }[]>`
            SELECT (SELECT row_to_json(d)::text FROM checkout_draft d WHERE d.id = ${draft.id})
                   || (SELECT json_agg(l ORDER BY l.position)::text
                         FROM checkout_draft_line l WHERE l.draft_id = ${draft.id}) AS row`;
          const before = await snapshot();
          const next = await post(connection, await fields(), {
            token,
            now: at(5),
          });
          const fresh = tokenOf(next);
          expect(fresh).not.toBe(token);
          expect(basketCookie(next)?.split(";")[0]).toBe("fo_basket=1");
          expect(await snapshot()).toEqual(before);
          expect((await basket(connection, fresh, at(6))).lines).toHaveLength(
            1,
          );
        });
      });
    });

    describe("T-55: at most BASKET_MAX_LINES lines", () => {
      it("the sixth add writes no line and leaves the full notice; a raw insert at position 6 is a check violation", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          for (let n = 2; n <= BASKET_MAX_LINES; n += 1) {
            await post(connection, await fields(), { token, now: at(n) });
          }
          await tx`UPDATE checkout_draft SET pending_notice = NULL`;
          expect(await lineCount(tx)).toBe(BASKET_MAX_LINES);
          const sixth = await post(connection, await fields(), {
            token,
            now: at(10),
          });
          expect(sixth.response.status).toBe(303);
          expect(sixth.response.headers.get("location")).toBe("/pl/basket");
          expect(sixth.cookies).toEqual([]);
          expect(await lineCount(tx)).toBe(BASKET_MAX_LINES);
          const draft = await basket(connection, token, at(11));
          expect(draft.pendingNotice).toBe("full");
          const raw = await pgFailure(
            tx,
            (sp) => sp`
              INSERT INTO checkout_draft_line (draft_id, position, destination_country_id,
                                               product_id, tier_key)
              SELECT ${draft.id}, ${BASKET_MAX_LINES + 1}, c.id, p.id, 't'
                FROM country c, product p WHERE c.iso2 = 'PL' LIMIT 1`,
          );
          expect(raw).toMatchObject({
            code: "23514",
            constraint: "checkout_draft_line_position_check",
          });
        });
      });
    });

    describe("T-56: one mode and one currency per basket; a closed destination is never stored", () => {
      it("an add whose destination's mode differs from the basket's writes no line and leaves the mode notice", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          // A basket in `test` (the mode a spec 013 test step would give), then a `demo` add.
          const signed = await deriveQuote(
            {
              locale: "pl",
              countryIso: "PL",
              sku: SKU,
              tierKey: TIER?.tierKey ?? "",
              deliveryDate: null,
              addonKeys: [],
            },
            T0,
          );
          const created = await createDraft(
            {
              locale: "pl",
              mode: "test",
              line: {
                countryIso: "PL",
                sku: SKU,
                tierKey: TIER?.tierKey ?? "",
                deliveryDate: null,
                quote: signed,
                lastSeen: { amountMinor: signed.totalMinor, currency: "PLN" },
              },
              expected: { amountMinor: signed.totalMinor, currency: "PLN" },
              now: T0,
            },
            connection,
          );
          const token = created?.token ?? "";
          const refused = await post(connection, await fields(), {
            token,
            now: at(1),
          });
          expect(refused.response.headers.get("location")).toBe("/pl/basket");
          expect(refused.cookies).toEqual([]);
          expect(await lineCount(tx)).toBe(1);
          expect((await basket(connection, token, at(2))).pendingNotice).toBe(
            "other_mode",
          );
        });
      });

      it("a `pl` product page in PLN added to a GBP basket is stored in GBP, and the notice names both amounts", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(
            await post(connection, await fields({ locale: "en-gb" })),
          );
          expect((await basket(connection, token)).currency).toBe("GBP");
          const pl = await fields({ locale: "pl" });
          expect(pl["expectedCurrency"]).toBe("PLN");
          await post(connection, pl, { token, now: at(1) });
          const [, second] = (await basket(connection, token, at(2))).lines;
          const gbp = await shown("en-gb");
          expect(second?.quote?.currency).toBe("GBP");
          expect(second?.quote?.totalMinor).toBe(gbp.amountMinor);
          expect(
            linePriceChange({
              quote: second?.quote ?? null,
              lastSeen: second?.lastSeen ?? null,
            }),
          ).toEqual({
            previous: {
              amountMinor: Number(pl["expectedTotalMinor"]),
              currency: "PLN",
            },
            current: { amountMinor: gbp.amountMinor, currency: "GBP" },
          });
        });
      });

      it("a line the provider cannot price in the basket's currency (stale FX) writes nothing and leaves the currency notice", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(
            await post(connection, await fields({ locale: "en-gb" })),
          );
          const stale = at(10 * DAY);
          // Ten days on, the GBP rate is stale: the product page shows the destination's PLN.
          const body = await fields({ locale: "en-gb", now: stale });
          expect(body["expectedCurrency"]).toBe("PLN");
          const refused = await post(connection, body, { token, now: stale });
          expect(refused.response.headers.get("location")).toBe(
            "/en-gb/basket",
          );
          expect(refused.cookies).toEqual([]);
          expect(await lineCount(tx)).toBe(1);
          const draft = await basket(connection, token, at(10 * DAY + 1));
          expect(draft.pendingNotice).toBe("other_currency");
          expect(draft.currency).toBe("GBP");
        });
      });

      it("a closed destination is never stored: into a basket (back to it) and with no basket (back to the product page)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const fresh = await post(connection, await fields(), {
            flags: CLOSED,
          });
          expect(fresh.response.headers.get("location")).not.toBe("/pl/basket");
          expect(fresh.cookies).toEqual([]);
          expect(await lineCount(tx)).toBe(0);
          const token = tokenOf(await post(connection, await fields()));
          const into = await post(connection, await fields(), {
            token,
            now: at(1),
            flags: CLOSED,
          });
          expect(into.response.headers.get("location")).toBe("/pl/basket");
          expect(into.cookies).toEqual([]);
          expect(await lineCount(tx)).toBe(1);
        });
      });
    });

    describe("T-59 (server half): a line that becomes unavailable is marked and excluded", () => {
      it("an unpriced tier, a closed destination and a mode change each mark the line, exclude it and block step 3; after Remove the total is the rest", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          await post(
            connection,
            await fields({
              sku: SECOND?.sku ?? "",
              tierKey: SECOND_TIER?.tierKey ?? "",
            }),
            { token, now: at(1) },
          );
          // Every line through its two screens, so step 3 would be reachable.
          await tx`UPDATE checkout_draft_line SET steps_completed = 2`;
          await tx`UPDATE checkout_draft SET buyer_saved = true`;
          const first = await shown("pl");
          const second = await shown(
            "pl",
            SECOND?.sku ?? "",
            SECOND_TIER?.tierKey ?? "",
          );
          const assess = async (flags: CheckoutFlagReader = OPEN) =>
            assessBasket(await basket(connection, token, at(2)), {
              locale: "pl",
              now: at(2),
              flags,
            });
          const healthy = await assess();
          expect(healthy.total?.amountMinor).toBe(
            first.amountMinor + second.amountMinor,
          );
          expect(healthy.reviewReachable).toBe(true);
          expect(healthy.placeable).toBe(true);

          // The tier is no longer priced (the line names a tier the catalogue does not offer).
          await tx`UPDATE checkout_draft_line SET tier_key = 'stems_999' WHERE position = 2`;
          const unpriced = await assess();
          expect(unpriced.lines.map((l) => l.availability)).toEqual([
            { status: "ok" },
            { status: "unavailable", reason: "tier" },
          ]);
          expect(unpriced.total?.amountMinor).toBe(first.amountMinor);
          expect(unpriced.reviewReachable).toBe(false);
          expect(unpriced.placeable).toBe(false);

          // The destination closes: both lines.
          const closed = await assess(CLOSED);
          expect(closed.lines.map((l) => l.availability)).toEqual([
            { status: "unavailable", reason: "closed" },
            { status: "unavailable", reason: "tier" },
          ]);
          expect(closed.total?.amountMinor).toBe(0);

          // The destination's mode changes under the basket.
          await tx`UPDATE checkout_draft SET mode = 'test'`;
          const moved = await assess();
          expect(moved.lines[0]?.availability).toEqual({
            status: "unavailable",
            reason: "mode",
          });
          await tx`UPDATE checkout_draft SET mode = 'demo'`;

          // Remove line 2: the total is line 1's, and step 3 is reachable again.
          const removed = await runRemoveLine(
            ctx(connection, token, at(3)),
            form({ line: "2" }),
          );
          expect(removed).toEqual({
            kind: "redirect",
            location: "/pl/basket",
            basketCount: 1,
          });
          const after = await assess();
          expect(after.lines).toHaveLength(1);
          expect(after.total?.amountMinor).toBe(first.amountMinor);
          expect(after.reviewReachable).toBe(true);
        });
      });

      it("a retired product (no longer active in the catalogue) is unavailable", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          await tx`
            INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                                 price_tier, substitution_class, freshness_days)
            VALUES ('FO-ZZ-901', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)`;
          await tx`UPDATE checkout_draft_line
                      SET product_id = (SELECT id FROM product WHERE sku = 'FO-ZZ-901')`;
          const assessed = await assessBasket(
            await basket(connection, token, at(2)),
            { locale: "pl", now: at(2), flags: OPEN },
          );
          expect(assessed.lines[0]?.availability).toEqual({
            status: "unavailable",
            reason: "product",
          });
          expect(assessed.total?.amountMinor).toBe(0);
        });
      });
    });

    describe("T-60 (server half): a line's date passes its cutoff, across the Warsaw DST night", () => {
      // Saturday 2026-10-24 is still CEST (UTC+2): the 14:00 cutoff is 12:00 UTC. Monday
      // 2026-10-26 is CET (UTC+1) after the night of the 25th: its 14:00 cutoff is 13:00 UTC.
      const SATURDAY = "2026-10-24";
      const MONDAY = "2026-10-26";
      const TUESDAY = "2026-10-27";
      /** Line 1's date: inside every grid below and deliverable throughout. */
      const FRIDAY = "2026-10-30";
      /** The baskets of this block start the morning of the Saturday. */
      const MORNING = new Date("2026-10-24T06:00:00Z");

      it("line 2 only goes from ok to gone at each local cutoff, never an hour early or late, with the next date", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(
            await post(connection, await fields({ now: MORNING }), {
              now: MORNING,
            }),
          );
          await post(connection, await fields({ now: MORNING }), {
            token,
            now: MORNING,
          });
          await tx`UPDATE checkout_draft_line SET delivery_date = ${FRIDAY}::date WHERE position = 1`;
          const statusAt = async (date: string, iso: string) => {
            await tx`UPDATE checkout_draft_line SET delivery_date = ${date}::date WHERE position = 2`;
            const draft = await basket(connection, token, new Date(iso));
            const assessed = await assessBasket(draft, {
              locale: "pl",
              now: new Date(iso),
              flags: OPEN,
            });
            return assessed.lines.map((line) => line.date);
          };
          const ok = { status: "ok" };
          expect(await statusAt(SATURDAY, "2026-10-24T11:59:59Z")).toEqual([
            ok,
            ok,
          ]);
          expect(await statusAt(SATURDAY, "2026-10-24T12:00:00Z")).toEqual([
            ok,
            { status: "gone", next: MONDAY },
          ]);
          expect(await statusAt(MONDAY, "2026-10-26T12:59:59Z")).toEqual([
            ok,
            ok,
          ]);
          expect(await statusAt(MONDAY, "2026-10-26T13:00:00Z")).toEqual([
            ok,
            { status: "gone", next: TUESDAY },
          ]);
          expect(nextDeliveryDate("PL", new Date("2026-10-25T01:30:00Z"))).toBe(
            MONDAY,
          );
        });
      });

      it("Use {next} sets exactly that date on exactly that line; a stale posted date writes nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(
            await post(connection, await fields({ now: MORNING }), {
              now: MORNING,
            }),
          );
          await post(connection, await fields({ now: MORNING }), {
            token,
            now: MORNING,
          });
          await tx`UPDATE checkout_draft_line SET delivery_date = ${SATURDAY}::date`;
          const now = new Date("2026-10-24T12:30:00Z");
          const before = await basket(connection, token, now);
          const stale = await runUseNextDate(
            ctx(connection, token, now),
            form({ line: "2", deliveryDate: SATURDAY, returnTo: "basket" }),
          );
          expect(location(stale)).toBe("/pl/basket");
          const unchanged = await basket(connection, token, now);
          expect(unchanged.lines.map((l) => l.deliveryDate)).toEqual([
            SATURDAY,
            SATURDAY,
          ]);
          expect(unchanged.lastActivityAt).toEqual(before.lastActivityAt);
          const used = await runUseNextDate(
            ctx(connection, token, now),
            form({ line: "2", deliveryDate: MONDAY, returnTo: "basket" }),
          );
          expect(used).toEqual({
            kind: "redirect",
            location: "/pl/basket",
            basketCount: 2,
          });
          const after = await basket(connection, token, now);
          expect(after.lines.map((l) => l.deliveryDate)).toEqual([
            SATURDAY,
            MONDAY,
          ]);
          // The new date's price is what the buyer sees next: no notice for it.
          expect(
            linePriceChange({
              quote: after.lines[1]?.quote ?? null,
              lastSeen: after.lines[1]?.lastSeen ?? null,
            }),
          ).toBeNull();
        });
      });

      it("line=0, line=6 and line=x land on the first incomplete screen and write nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          const before = await basket(connection, token);
          for (const line of ["0", "6", "x", ""]) {
            const outcome = await runRecipientStep(
              ctx(connection, token, at(2)),
              form({ line, deliveryDate: "2027-03-10" }),
            );
            expect(location(outcome), line).toBe("/pl/checkout");
          }
          expect((await basket(connection, token, at(3))).lines).toEqual(
            before.lines,
          );
        });
      });
    });

    describe("T-61: a price change on either line opens the notice with the sums, until confirmPrice", () => {
      it("line 1, then line 2: notice each time with old and new totals; confirmPrice stores the confirmed sum", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = tokenOf(await post(connection, await fields()));
          await post(
            connection,
            await fields({
              sku: SECOND?.sku ?? "",
              tierKey: SECOND_TIER?.tierKey ?? "",
            }),
            { token, now: at(1) },
          );
          await tx`UPDATE checkout_draft_line SET steps_completed = 2`;
          await tx`UPDATE checkout_draft SET buyer_saved = true`;
          const first = await shown("pl");
          const second = await shown(
            "pl",
            SECOND?.sku ?? "",
            SECOND_TIER?.tierKey ?? "",
          );
          // The buyer saw line 1 at 500 less than the provider gives now.
          const old = await signedAt(SKU, TIER?.tierKey ?? "", at(1), -500);
          await tx`UPDATE checkout_draft_line
                      SET quote = (${JSON.stringify(old)}::text)::jsonb,
                          last_seen_total_minor = ${old.totalMinor}
                    WHERE position = 1`;
          const one = await assessBasket(
            await basket(connection, token, at(2)),
            {
              locale: "pl",
              now: at(2),
              flags: OPEN,
            },
          );
          expect(one.notice).toEqual({
            previous: {
              amountMinor: first.amountMinor - 500 + second.amountMinor,
              currency: "PLN",
            },
            current: {
              amountMinor: first.amountMinor + second.amountMinor,
              currency: "PLN",
            },
          });
          expect(one.placeable).toBe(false);
          expect(one.reviewReachable).toBe(true);

          // A confirmation of an amount the buyer did not see leaves it open.
          const wrong = await runUpdateSelection(
            ctx(connection, token, at(3)),
            form({
              intent: "confirmPrice",
              seenTotalMinor: String(
                first.amountMinor + second.amountMinor - 1,
              ),
              seenCurrency: "PLN",
              returnStep: "review",
            }),
          );
          expect(location(wrong)).toBe("/pl/checkout");
          const confirm = await runUpdateSelection(
            ctx(connection, token, at(3)),
            form({
              intent: "confirmPrice",
              seenTotalMinor: String(first.amountMinor + second.amountMinor),
              seenCurrency: "PLN",
              returnStep: "review",
            }),
          );
          expect(location(confirm)).toBe("/pl/checkout?step=review");
          const settled = await basket(connection, token, at(4));
          expect(settled.confirmed).toEqual({
            amountMinor: first.amountMinor + second.amountMinor,
            currency: "PLN",
          });
          expect(
            (
              await assessBasket(settled, {
                locale: "pl",
                now: at(4),
                flags: OPEN,
              })
            ).placeable,
          ).toBe(true);

          // Now line 2 moves: the notice opens again, naming line 2's change in the sums.
          const old2 = await signedAt(
            SECOND?.sku ?? "",
            SECOND_TIER?.tierKey ?? "",
            at(5),
            +300,
          );
          await tx`UPDATE checkout_draft_line
                      SET quote = (${JSON.stringify(old2)}::text)::jsonb,
                          last_seen_total_minor = ${old2.totalMinor}
                    WHERE position = 2`;
          const two = await assessBasket(
            await basket(connection, token, at(6)),
            {
              locale: "pl",
              now: at(6),
              flags: OPEN,
            },
          );
          expect(two.notice).toEqual({
            previous: {
              amountMinor: first.amountMinor + second.amountMinor + 300,
              currency: "PLN",
            },
            current: {
              amountMinor: first.amountMinor + second.amountMinor,
              currency: "PLN",
            },
          });
          expect(two.placeable).toBe(false);
        });
      });
    });

    describe("T-62: fo_basket follows the number of lines", () => {
      it("after each add and each Remove, down to its deletion at zero; never HttpOnly; the same Max-Age as fo_checkout", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const first = await post(connection, await fields());
          const token = tokenOf(first);
          const counts: (number | undefined)[] = [
            Number(basketCookie(first)?.split(";")[0]?.split("=")[1]),
          ];
          const second = await post(connection, await fields(), {
            token,
            now: at(1),
          });
          counts.push(
            Number(basketCookie(second)?.split(";")[0]?.split("=")[1]),
          );
          for (const minutes of [2, 3]) {
            const outcome = await runRemoveLine(
              ctx(connection, token, at(minutes)),
              form({ line: "1" }),
            );
            counts.push(
              outcome.kind === "redirect" ? outcome.basketCount : undefined,
            );
          }
          expect(counts).toEqual([1, 2, 1, 0]);
          const checkoutAge = /Max-Age=(\d+)/u.exec(
            first.cookies[0] ?? "",
          )?.[1];
          for (const cookie of [basketCookie(first), basketCookie(second)]) {
            expect(cookie).toMatch(/^fo_basket=[0-9]{1,2};/u);
            expect(cookie).not.toMatch(/HttpOnly/iu);
            expect(/Max-Age=(\d+)/u.exec(cookie ?? "")?.[1]).toBe(checkoutAge);
          }
        });
      });
    });

    describe("T-76: a line's amount is the same for every residence, language and IP", () => {
      it("identical integers under three Accept-Language values, three IP and geo header sets, and three residences", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const totals = new Set<number>();
          for (const headers of [
            {
              "accept-language": "pl-PL,pl;q=0.9",
              "cf-ipcountry": "PL",
              "x-forwarded-for": "83.0.0.1",
            },
            {
              "accept-language": "de-DE,de;q=0.9",
              "cf-ipcountry": "DE",
              "x-forwarded-for": "85.0.0.1",
            },
            {
              "accept-language": "en-GB,en;q=0.9",
              "x-vercel-ip-country": "GB",
              "x-forwarded-for": "81.0.0.1",
            },
          ]) {
            const token = tokenOf(
              await post(connection, await fields(), { headers }),
            );
            const draft = await basket(connection, token);
            for (const residence of ["GB", "PL", "DE"]) {
              const assessed = await assessBasket(
                {
                  ...draft,
                  buyer: {
                    email: CHECKOUT_SAMPLES.PL.buyer.email,
                    buyerName: CHECKOUT_SAMPLES.PL.buyer.buyerName,
                    buyerPhone: null,
                    residenceCountry: residence,
                  },
                },
                { locale: "pl", now: at(1), flags: OPEN },
              );
              totals.add(assessed.lines[0]?.amount?.amountMinor ?? -1);
            }
            totals.add(draft.lines[0]?.quote?.totalMinor ?? -2);
          }
          expect([...totals]).toEqual([(await shown("pl")).amountMinor]);
        });
      });
    });

    describe("T-78: the basket's logs carry only AC-78's keys", () => {
      it("add, refuse, remove: every emitted key is in the set, and no value is a token, a date or a product", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const lines: { message: string; fields: Record<string, unknown> }[] =
            [];
          const capture =
            (level: "info" | "warn") =>
            (fieldsOrMessage: unknown, message?: unknown) => {
              if (
                typeof fieldsOrMessage === "object" &&
                fieldsOrMessage !== null
              ) {
                lines.push({
                  message: `${level}:${String(message)}`,
                  fields: fieldsOrMessage as Record<string, unknown>,
                });
              }
            };
          const info = vi
            .spyOn(logger, "info")
            .mockImplementation(capture("info"));
          const warn = vi
            .spyOn(logger, "warn")
            .mockImplementation(capture("warn"));
          try {
            const started = await post(connection, await fields());
            const token = tokenOf(started);
            await post(connection, await fields(), { token, now: at(1) });
            await post(connection, await fields(), {
              token,
              now: at(2),
              flags: CLOSED,
            });
            await runRemoveLine(
              ctx(connection, token, at(3)),
              form({ line: "2" }),
            );
            const basketLines = lines.filter((line) =>
              /checkout\.basket_/u.test(line.message),
            );
            expect(basketLines.map((line) => line.message)).toEqual([
              "info:checkout.basket_line_added",
              "info:checkout.basket_line_added",
              "info:checkout.basket_refused",
              "info:checkout.basket_line_removed",
            ]);
            for (const line of basketLines) {
              for (const key of Object.keys(line.fields)) {
                expect(AC78_KEYS.has(key), `${line.message} ${key}`).toBe(true);
              }
              const text = JSON.stringify(line.fields);
              expect(text).not.toContain(token);
              expect(text).not.toContain(SKU);
              expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
            }
          } finally {
            info.mockRestore();
            warn.mockRestore();
          }
        });
      });
    });
  },
);
