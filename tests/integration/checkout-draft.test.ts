/**
 * Drafts, the start route and the step actions against a migrated PG16 (spec 010 §5.1 B, §5.2,
 * §8; T-06, T-10 integration half, T-11, T-13, T-17 integration half; AC-6, AC-10, AC-11, AC-13,
 * AC-17; TASK-203).
 *
 * Every case runs on a scratch database of a disposable local Postgres 16
 * (`support/scratch-db.ts`), inside a transaction that is rolled back, entered as `app_web` with
 * `app.role = 'system'` exactly as `withSystemContext('checkout', …)` enters it. The draft service
 * runs on that transaction through the raw executor seam. Flags are injected (`checkout.open` on
 * for PL, `checkout.demo_guard` on), so the mode is `demo`; the clock is injected.
 */
import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import {
  addonPriceProjection,
  listAddons,
  listProducts,
  listTiers,
  priceProjection,
  productAlternatePaths,
} from "@/modules/catalog";
import {
  type BasketLine,
  type CheckoutFlagReader,
  type Draft,
  type DraftConnection,
  type StepOutcome,
  draftTokenFromCookieHeader,
  expireDrafts,
  linePriceChange,
  lineTotals,
  loadDraft,
  runCardAndBuyerStep,
  runRecipientStep,
  runUpdateSelection,
  saveLine,
  startCheckout,
  verifyLineQuote,
} from "@/modules/checkout";

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
import { runnerOf, sqlText } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * A one-line basket read the way TASK-203's draft was: the draft's fields, then its only line's
 * (spec 010 §14 A-founder-2026-10-22: the per-line columns moved to `checkout_draft_line`).
 */
type Flat = Draft & BasketLine & { readonly line: BasketLine };

function flat(draft: Draft): Flat {
  const line = draft.lines[0];
  if (line === undefined) throw new Error("the basket has no line");
  return { ...draft, ...line, id: draft.id, line };
}

const priceChange = (view: Flat) =>
  linePriceChange({ quote: view.quote, lastSeen: view.lastSeen });
const verifyDraftQuote = (view: Flat, now: Date) =>
  verifyLineQuote(view.line, "PLN", "pl", now);
const draftTotals = (view: Flat, now: Date) => lineTotals(view.line, "pl", now);

const [PRODUCT] = await listProducts({ countryIso: "PL" });
if (PRODUCT === undefined) throw new Error("the dataset prices nothing for PL");
const SKU = PRODUCT.sku;
const TIERS = await listTiers(SKU);
const [TIER, OTHER_TIER] = TIERS;
if (TIER === undefined || OTHER_TIER === undefined) {
  throw new Error(`${SKU} needs two tiers for this suite`);
}
const OFFERED = (await listAddons("PL")).map((addon) => addon.key);
const PAID_ADDON = OFFERED.find((key) => key !== "card") ?? "";
const PDP =
  (await productAlternatePaths({ sku: SKU, countryIso: "PL" }))["pl"] ?? "";

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const CLOSED: CheckoutFlagReader = (key) =>
  Promise.resolve(key !== "checkout.open");

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_draft");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

/** The PL country and the product row a draft needs, then the system context. */
async function seeded(tx: Tx, withProduct = true): Promise<DraftConnection> {
  await country(tx, "PL");
  if (withProduct) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${SKU}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)`;
  }
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

async function shownTotal(tierKey = TIER?.tierKey ?? ""): Promise<number> {
  const projection = await priceProjection("pl", {
    productId: SKU,
    tierKey,
    countryIso: "PL",
    now: T0,
  });
  return projection.displayPrice.amountMinor;
}

function startRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
  method = "POST",
): Request {
  return new Request("http://flowersoverseas.test/api/checkout/start", {
    method,
    headers: {
      host: "flowersoverseas.test",
      origin: "http://flowersoverseas.test",
      ...(method === "POST"
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
      ...headers,
    },
    ...(method === "POST"
      ? { body: new URLSearchParams(fields).toString() }
      : {}),
  });
}

async function validStart(): Promise<Record<string, string>> {
  return {
    locale: "pl",
    countryIso: "PL",
    sku: SKU,
    tierKey: TIER?.tierKey ?? "",
    expectedTotalMinor: String(await shownTotal()),
    expectedCurrency: "PLN",
  };
}

/**
 * A connection that runs `before` (another tab's request) just ahead of this request's first
 * write: the interleaving of two posts on one draft (`/review 275`, `/break 275` hole 1).
 */
function interleaved(
  base: DraftConnection,
  before: () => Promise<unknown>,
): DraftConnection {
  let fired = false;
  const executor = base.executor;
  if (executor === undefined) throw new Error("needs an executor");
  return {
    executor: {
      async execute(query) {
        if (!fired && /^\s*UPDATE checkout_draft/u.test(sqlText(query))) {
          fired = true;
          await before();
        }
        return executor.execute(query);
      },
    },
  };
}

async function draftCount(tx: Tx): Promise<number> {
  const [row] = await tx<
    { n: string }[]
  >`SELECT count(*)::text AS n FROM checkout_draft`;
  return Number(row?.n ?? "-1");
}

/** Starts a draft through the route and returns its token. */
async function started(
  connection: DraftConnection,
  fields?: Record<string, string>,
): Promise<string> {
  const response = await startCheckout(
    startRequest(fields ?? (await validStart())),
    {
      now: () => T0,
      connection,
      flags: OPEN,
    },
  );
  const token = draftTokenFromCookieHeader(response.headers.get("set-cookie"));
  if (token === null)
    throw new Error(`no draft started: ${String(response.status)}`);
  return token;
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

const SAMPLE = CHECKOUT_SAMPLES.PL;
const DELIVERY_DATE = new Date(T0.getTime() + 3 * 24 * 3_600_000)
  .toISOString()
  .slice(0, 10);

function recipientForm(overrides: Record<string, string> = {}): FormData {
  return form({
    line: "1",
    ...SAMPLE.recipient.fields,
    placeKind: SAMPLE.recipient.placeKind,
    deliveryNote: "Ring twice",
    deliveryDate: DELIVERY_DATE,
    ...overrides,
  });
}

function cardForm(
  overrides: Record<string, string | readonly string[]> = {},
): FormData {
  return form({
    line: "1",
    cardMessage: "Happy birthday",
    signAs: "Sam",
    email: SAMPLE.buyer.email,
    buyerName: SAMPLE.buyer.buyerName,
    buyerPhone: "",
    residenceCountry: SAMPLE.buyer.residenceCountry,
    ...overrides,
  });
}

function ctx(connection: DraftConnection, token: string, minutes = 1) {
  return {
    locale: "pl",
    token,
    connection,
    flags: OPEN,
    now: () => at(minutes),
  };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(
      `expected a redirect, got ${JSON.stringify(outcome.state)}`,
    );
  }
  return outcome.location;
}

async function active(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<Flat> {
  const lookup = await loadDraft(token, at(minutes), connection);
  if (lookup.status !== "active") throw new Error(`draft is ${lookup.status}`);
  return flat(lookup.draft);
}

describe.skipIf(server.url === undefined)(
  `checkout drafts on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      if (db === undefined) throw new Error("no scratch database");
      return rolledBack(db.sql, fn);
    };

    describe("POST /api/checkout/start (AC-6, T-06)", () => {
      it("answers GET with 405 and Allow: POST", async () => {
        const response = await startCheckout(startRequest({}, {}, "GET"));
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("POST");
        expect(response.headers.get("cache-control")).toBe("no-store");
      });

      it("answers a foreign or missing Origin with 403 and writes nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          for (const headers of [
            { origin: "https://evil.example" },
            { origin: "null" },
            { origin: "http://flowersoverseas.test.evil.example" },
          ]) {
            const response = await startCheckout(
              startRequest(await validStart(), headers),
              { now: () => T0, connection, flags: OPEN },
            );
            expect(response.status, headers.origin).toBe(403);
            expect(response.headers.get("set-cookie")).toBeNull();
          }
          const noOrigin = new Request(
            "http://flowersoverseas.test/api/checkout/start",
            {
              method: "POST",
              headers: {
                host: "flowersoverseas.test",
                "content-type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams(await validStart()).toString(),
            },
          );
          expect(
            (await startCheckout(noOrigin, { connection, flags: OPEN })).status,
          ).toBe(403);
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("sends an unknown product, tier or country back with 303 and no query string, writing nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const base = await validStart();
          const cases: [Record<string, string>, string][] = [
            [{ ...base, sku: "FO-ZZ-999" }, "/pl"],
            [{ ...base, tierKey: "stems_999" }, PDP],
            [{ ...base, countryIso: "ZZ" }, "/pl"],
            [{ ...base, expectedTotalMinor: "-1" }, PDP],
            [{ ...base, extra: "1" }, PDP],
          ];
          for (const [fields, expected] of cases) {
            const response = await startCheckout(startRequest(fields), {
              now: () => T0,
              connection,
              flags: OPEN,
            });
            expect(response.status, JSON.stringify(fields)).toBe(303);
            const target = response.headers.get("location") ?? "";
            expect(target).toBe(expected);
            expect(target).not.toContain("?");
            expect(response.headers.get("set-cookie")).toBeNull();
          }
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("sends a product the database does not hold back to the product page (fail closed)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx, false);
          const response = await startCheckout(
            startRequest(await validStart()),
            {
              now: () => T0,
              connection,
              flags: OPEN,
            },
          );
          expect(response.status).toBe(303);
          expect(response.headers.get("location")).toBe(PDP);
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("writes nothing for a closed destination", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const response = await startCheckout(
            startRequest(await validStart()),
            {
              now: () => T0,
              connection,
              flags: CLOSED,
            },
          );
          expect(response.status).toBe(303);
          expect(response.headers.get("set-cookie")).toBeNull();
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("creates one draft, sets fo_checkout with every attribute and answers 303 to /{locale}/checkout", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const response = await startCheckout(
            startRequest(await validStart()),
            {
              now: () => T0,
              connection,
              flags: OPEN,
            },
          );
          expect(response.status).toBe(303);
          expect(response.headers.get("location")).toBe("/pl/checkout");
          expect(response.headers.get("cache-control")).toBe("no-store");
          const [cookie = "", basket = ""] = response.headers.getSetCookie();
          expect(basket).toBe(
            "fo_basket=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax",
          );
          const [pair, ...attributes] = cookie.split("; ");
          expect(pair).toMatch(/^fo_checkout=[A-Za-z0-9_-]{43}$/u);
          expect(new Set(attributes)).toEqual(
            new Set([
              "HttpOnly",
              "Secure",
              "SameSite=Lax",
              "Path=/",
              "Max-Age=2592000",
            ]),
          );
          expect(await draftCount(tx)).toBe(1);
          const token = draftTokenFromCookieHeader(cookie) ?? "";
          const rows = await tx<
            { token_sha256: string; mode: string; row: string }[]
          >`
            SELECT token_sha256, mode, row_to_json(d)::text AS row FROM checkout_draft d`;
          expect(rows[0]?.token_sha256).toBe(
            createHash("sha256").update(token).digest("hex"),
          );
          expect(rows[0]?.mode).toBe("demo");
          expect(rows[0]?.row).not.toContain(token);
          const [lines] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM checkout_draft_line WHERE position = 1`;
          expect(lines?.n).toBe(1);
          const draft = await active(connection, token);
          expect(draft.quote?.totalMinor).toBe(await shownTotal());
          expect(draft.addonKeys).toEqual([]);
          expect(draft.deliveryDate).toBeNull();
          expect(priceChange(draft)).toBeNull();
        });
      });

      it("opens step 1 with the notice naming both amounts when the posted total differs", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const shown = await shownTotal();
          const token = await started(connection, {
            ...(await validStart()),
            expectedTotalMinor: String(shown - 700),
          });
          const draft = await active(connection, token);
          expect(priceChange(draft)).toEqual({
            previous: { amountMinor: shown - 700, currency: "PLN" },
            current: { amountMinor: shown, currency: "PLN" },
          });
        });
      });
    });

    describe("the steps keep what was typed (AC-13, T-13; 30 days since the basket)", () => {
      it("saves step 1, shows every value on a refresh and on a return within 24 hours", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runRecipientStep(
            ctx(connection, token),
            recipientForm(),
          );
          expect(location(outcome)).toBe("/pl/checkout?step=card");
          for (const minutes of [2, 24 * HOUR]) {
            const draft = await active(connection, token, minutes);
            expect(draft.recipient).toEqual({
              fullName: SAMPLE.recipient.fields.fullName,
              phone: expect.objectContaining({
                e164: expect.stringMatching(/^\+48/u),
              }),
              address: {
                street: SAMPLE.recipient.fields.street,
                postcode: SAMPLE.recipient.fields.postcode,
                city: SAMPLE.recipient.fields.city,
              },
              placeKind: SAMPLE.recipient.placeKind,
              deliveryNote: "Ring twice",
            });
            expect(draft.deliveryDate).toBe(DELIVERY_DATE);
            expect(draft.stepsCompleted).toBe(1);
          }
        });
      });

      it("expires 30 days after the last change: the expired state, the row and its lines deleted", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token, HOUR), recipientForm());
          // The save at +1 h moved the window: +30 days 30 min is still inside it.
          await active(connection, token, 30 * DAY + 30);
          expect(
            await loadDraft(token, at(30 * DAY + HOUR), connection),
          ).toEqual({
            status: "expired",
          });
          const [lines] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM checkout_draft_line`;
          expect(lines?.n).toBe(0);
          expect(await draftCount(tx)).toBe(0);
          expect(
            await loadDraft(token, at(30 * DAY + HOUR), connection),
          ).toEqual({
            status: "missing",
          });
        });
      });

      it("renders the expired state for a step posted after expiry, and writes nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runRecipientStep(
            ctx(connection, token, 30 * DAY),
            recipientForm(),
          );
          expect(outcome).toEqual({
            kind: "render",
            state: { status: "expired" },
          });
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("expireDrafts deletes exactly the drafts past their expiry", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const first = await started(connection);
          await started(connection);
          await runRecipientStep(
            ctx(connection, first, 2 * HOUR),
            recipientForm(),
          );
          expect(await expireDrafts(at(30 * DAY + 1), connection)).toBe(1);
          await active(connection, first, 30 * DAY + 1);
          expect(await draftCount(tx)).toBe(1);
        });
      });

      it("keeps a draft from any role but system (RLS: one policy)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          await started(connection);
          for (const role of ["public", "customer", "partner", "admin"]) {
            await tx`SELECT set_config('app.role', ${role}, true)`;
            expect(await draftCount(tx), role).toBe(0);
            const [lines] = await tx<{ n: number }[]>`
              SELECT count(*)::int AS n FROM checkout_draft_line`;
            expect(lines?.n, role).toBe(0);
            const failure = await pgFailure(
              tx,
              (sp) =>
                sp`INSERT INTO checkout_draft (token_sha256, locale_code, mode, expires_at)
                 VALUES (${"a".repeat(64)}, 'pl', 'demo', now() + interval '1 day')`,
            );
            expect(failure.code, role).toBe("42501");
          }
        });
      });
    });

    describe("the card and the buyer (AC-10, T-10 integration half)", () => {
      const polish = "ł";
      const cyrillic = "Ж";
      const family = "👨‍👩‍👧‍👦";

      it("stores a 200-grapheme card and refuses 201 on the server, writing nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          const card200 = `${polish}${cyrillic}${family}${"a".repeat(197)}`;
          const refused = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm({ cardMessage: `${card200}b` }),
          );
          expect(refused.kind).toBe("render");
          expect(
            refused.kind === "render" && refused.state.status === "invalid"
              ? refused.state.errors["cardMessage"]
              : undefined,
          ).toEqual([{ key: "checkout.error.tooLong", params: { max: 200 } }]);
          expect((await active(connection, token)).card).toBeNull();

          const accepted = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm({ cardMessage: card200, signAs: "é".repeat(40) }),
          );
          expect(location(accepted)).toBe("/pl/checkout?step=review");
          const draft = await active(connection, token);
          expect(draft.card).toEqual({
            cardMessage: card200,
            signAs: "é".repeat(40),
          });
          expect(draft.card?.signAs.normalize("NFC")).toBe(draft.card?.signAs);
          expect(draft.buyer?.email).toBe(SAMPLE.buyer.email);
          expect(draft.stepsCompleted).toBe(2);
        });
      });

      it("keeps a blank card as no card", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm({ cardMessage: "   " }),
          );
          expect((await active(connection, token)).card?.cardMessage).toBe("");
        });
      });

      it("sends step 2 back to step 1 until step 1 is saved", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm(),
          );
          expect(location(outcome)).toBe("/pl/checkout");
          expect((await active(connection, token)).card).toBeNull();
        });
      });
    });

    describe("add-ons (AC-11, T-11)", () => {
      it("offers only priced add-ons for PL (no wine) and none is selected", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          expect(OFFERED).not.toContain("wine");
          expect(OFFERED.length).toBeGreaterThan(0);
          expect((await active(connection, token)).addonKeys).toEqual([]);
          await runRecipientStep(ctx(connection, token), recipientForm());
          const wine = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm({ addonKeys: ["wine"] }),
          );
          expect(
            wine.kind === "render" && wine.state.status === "invalid"
              ? wine.state.errors["addonKeys"]
              : undefined,
          ).toEqual([{ key: "checkout.error.addonUnavailable" }]);
        });
      });

      it("adding then removing an add-on changes the total by exactly its projected price", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const before =
            (await active(connection, token)).quote?.totalMinor ?? -1;
          const projected = await addonPriceProjection(PAID_ADDON, "PL", "pl", {
            now: at(1),
          });
          const added = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "addAddon",
              addonKey: PAID_ADDON,
              returnStep: "recipient",
            }),
          );
          expect(location(added)).toBe("/pl/checkout");
          const withAddon = await active(connection, token);
          expect(withAddon.addonKeys).toEqual([PAID_ADDON]);
          expect((withAddon.quote?.totalMinor ?? 0) - before).toBe(
            projected.displayPrice.amountMinor,
          );
          expect(priceChange(withAddon)).toBeNull();
          await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "removeAddon",
              addonKey: PAID_ADDON,
              returnStep: "recipient",
            }),
          );
          const removed = await active(connection, token);
          expect(removed.addonKeys).toEqual([]);
          expect(removed.quote?.totalMinor).toBe(before);
        });
      });

      it("adding through step 2 prices the add-on too", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const before =
            (await active(connection, token)).quote?.totalMinor ?? -1;
          const undated = await runRecipientStep(
            ctx(connection, token),
            recipientForm({ deliveryDate: "" }),
          );
          expect(undated.kind).toBe("render");
          await runRecipientStep(ctx(connection, token), recipientForm());
          const dated =
            (await active(connection, token)).quote?.totalMinor ?? -1;
          await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm({ addonKeys: [PAID_ADDON] }),
          );
          const draft = await active(connection, token);
          const projected = await addonPriceProjection(PAID_ADDON, "PL", "pl", {
            now: at(1),
          });
          expect(draft.addonKeys).toEqual([PAID_ADDON]);
          expect((draft.quote?.totalMinor ?? 0) - dated).toBe(
            projected.displayPrice.amountMinor,
          );
          expect(dated).toBeGreaterThanOrEqual(before);
        });
      });

      it("changes the tier through the summary panel, priced afresh", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "tier",
              tierKey: OTHER_TIER.tierKey,
              returnStep: "review",
            }),
          );
          const draft = await active(connection, token);
          expect(draft.tierKey).toBe(OTHER_TIER.tierKey);
          expect(draft.quote?.totalMinor).toBe(
            await shownTotal(OTHER_TIER.tierKey),
          );
          expect(priceChange(draft)).toBeNull();
        });
      });
    });

    describe("two requests on one draft (/review 275 change 1, /break 275 holes 1-14)", () => {
      it("a step-2 post that loaded before another tab removed an add-on writes nothing (no free add-on)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "addAddon",
              addonKey: PAID_ADDON,
              returnStep: "card",
            }),
          );
          const racing = interleaved(connection, () =>
            runUpdateSelection(
              ctx(connection, token, 2),
              form({
                line: "1",
                intent: "removeAddon",
                addonKey: PAID_ADDON,
                returnStep: "card",
              }),
            ),
          );
          const stale = await runCardAndBuyerStep(
            { ...ctx(connection, token, 3), connection: racing },
            cardForm({ addonKeys: [PAID_ADDON] }),
          );
          expect(location(stale)).toBe("/pl/checkout?step=card");
          const draft = await active(connection, token, 4);
          expect(draft.addonKeys).toEqual([]);
          expect(draft.card).toBeNull();
          const check = await verifyDraftQuote(draft, at(4));
          expect(check.verdict).toBe("ok");
          const totals = await draftTotals(draft, at(4));
          expect(totals?.total.amountMinor).toBe(draft.quote?.totalMinor);
          expect(totals?.lines.map((line) => line.kind)).toEqual(["product"]);
        });
      });

      it("a step-1 post that loaded before a size change writes nothing (no size at another size's price)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const racing = interleaved(connection, () =>
            runUpdateSelection(
              ctx(connection, token, 2),
              form({
                line: "1",
                intent: "tier",
                tierKey: OTHER_TIER.tierKey,
                returnStep: "recipient",
              }),
            ),
          );
          const stale = await runRecipientStep(
            { ...ctx(connection, token, 3), connection: racing },
            recipientForm(),
          );
          expect(location(stale)).toBe("/pl/checkout");
          const draft = await active(connection, token, 4);
          expect(draft.tierKey).toBe(OTHER_TIER.tierKey);
          expect(draft.quote?.lines.map((line) => line.tierKey)).toEqual([
            OTHER_TIER.tierKey,
          ]);
          expect(draft.quote?.totalMinor).toBe(
            await shownTotal(OTHER_TIER.tierKey),
          );
          expect(draft.recipient).toBeNull();
          expect((await verifyDraftQuote(draft, at(4))).verdict).toBe("ok");
        });
      });

      it("a stored quote for another size is not `ok`: the notice opens on the next step", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await tx`UPDATE checkout_draft_line SET tier_key = ${OTHER_TIER.tierKey}`;
          const draft = await active(connection, token);
          const check = await verifyDraftQuote(draft, at(2));
          expect(check.verdict).toBe("changed");
          await runRecipientStep(ctx(connection, token, 3), recipientForm());
          expect(
            priceChange(await active(connection, token, 4)),
          ).not.toBeNull();
        });
      });

      it("refuses wine through the summary panel too (PL, hole 2)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const before = (await active(connection, token)).quote?.totalMinor;
          const outcome = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "addAddon",
              addonKey: "wine",
              returnStep: "recipient",
            }),
          );
          expect(
            outcome.kind === "render" && outcome.state.status === "invalid"
              ? outcome.state.errors["addonKeys"]
              : undefined,
          ).toEqual([{ key: "checkout.error.addonUnavailable" }]);
          const draft = await active(connection, token);
          expect(draft.addonKeys).toEqual([]);
          expect(draft.quote?.totalMinor).toBe(before);
        });
      });

      it("re-renders an unknown size instead of failing (hole 11)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "tier",
              tierKey: "stems_999",
              returnStep: "recipient",
            }),
          );
          expect(outcome.kind).toBe("render");
          expect((await active(connection, token)).tierKey).toBe(TIER.tierKey);
        });
      });

      it("never sends the buyer past an incomplete step (hole 12)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "tier",
              tierKey: OTHER_TIER.tierKey,
              returnStep: "review",
            }),
          );
          expect(location(outcome)).toBe("/pl/checkout");
          await runRecipientStep(ctx(connection, token), recipientForm());
          const second = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "tier",
              tierKey: TIER.tierKey,
              returnStep: "review",
            }),
          );
          expect(location(second)).toBe("/pl/checkout?step=card");
        });
      });

      it("a confirmation after a tampered quote restarts at step 1 (hole 8)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          const total =
            (await active(connection, token)).quote?.totalMinor ?? -1;
          await tx`UPDATE checkout_draft_line
                      SET quote = jsonb_set(quote, '{digest}', to_jsonb(${"0".repeat(64)}::text))`;
          const outcome = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "confirmPrice",
              seenTotalMinor: String(total),
              seenCurrency: "PLN",
              returnStep: "card",
            }),
          );
          expect(location(outcome)).toBe("/pl/checkout");
          const draft = await active(connection, token);
          expect(draft.stepsCompleted).toBe(0);
          expect(draft.quote?.digest).not.toBe("0".repeat(64));
        });
      });

      it("a confirmation in another currency leaves the notice open (hole 9)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const shown = await shownTotal();
          const token = await started(connection, {
            ...(await validStart()),
            expectedTotalMinor: String(shown - 700),
          });
          const outcome = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "confirmPrice",
              seenTotalMinor: String(shown),
              seenCurrency: "EUR",
              returnStep: "recipient",
            }),
          );
          expect(location(outcome)).toBe("/pl/checkout");
          expect(priceChange(await active(connection, token))).not.toBeNull();
        });
      });

      it("expireDrafts deletes a draft at exactly its expiry (hole 13)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          await started(connection);
          expect(await expireDrafts(at(30 * DAY - 1), connection)).toBe(0);
          expect(await expireDrafts(at(30 * DAY), connection)).toBe(1);
        });
      });

      it("a demo start ignores a posted date (hole 14)", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection, {
            ...(await validStart()),
            date: DELIVERY_DATE,
          });
          expect((await active(connection, token)).deliveryDate).toBeNull();
        });
      });
    });

    describe("Origin variants (AC-6, holes 5-7)", () => {
      it("refuses another port and a host that only ends with ours", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          for (const origin of [
            "http://flowersoverseas.test:8443",
            "http://evilflowersoverseas.test",
            "http://flowersoverseas.test.evil.example",
          ]) {
            const response = await startCheckout(
              startRequest(await validStart(), { origin }),
              {
                now: () => T0,
                connection,
                flags: OPEN,
              },
            );
            expect(response.status, origin).toBe(403);
          }
          expect(await draftCount(tx)).toBe(0);
        });
      });

      it("reads the public host from x-forwarded-host behind the proxy, before Host", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const proxied = await startCheckout(
            startRequest(await validStart(), {
              host: "app.internal:8080",
              "x-forwarded-host": "flowersoverseas.test",
              origin: "http://flowersoverseas.test",
            }),
            { now: () => T0, connection, flags: OPEN },
          );
          expect(proxied.status).toBe(303);
          expect(proxied.headers.get("location")).toBe("/pl/checkout");
          const internal = await startCheckout(
            startRequest(await validStart(), {
              host: "app.internal:8080",
              "x-forwarded-host": "flowersoverseas.test",
              origin: "http://app.internal:8080",
            }),
            { now: () => T0, connection, flags: OPEN },
          );
          expect(internal.status).toBe(403);
          expect(await draftCount(tx)).toBe(1);
        });
      });
    });

    describe("the quote across steps (AC-17, T-17 integration half)", () => {
      it("blocks progress on the notice until the buyer confirms the amount they saw", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const shown = await shownTotal();
          const token = await started(connection, {
            ...(await validStart()),
            expectedTotalMinor: String(shown - 700),
          });
          // Step 1 saves (a date is the buyer's own change) and comes back to step 1: the notice
          // stays open until it is confirmed.
          const step1 = await runRecipientStep(
            ctx(connection, token),
            recipientForm(),
          );
          expect(location(step1)).toBe("/pl/checkout");
          const saved = await active(connection, token);
          expect(saved.recipient).not.toBeNull();
          const notice = priceChange(saved);
          expect(notice?.previous).toEqual({
            amountMinor: shown - 700,
            currency: "PLN",
          });
          const current = notice?.current.amountMinor ?? -1;
          expect(current).toBe(saved.quote?.totalMinor);

          const stale = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "confirmPrice",
              seenTotalMinor: String(shown - 700),
              seenCurrency: "PLN",
              returnStep: "card",
            }),
          );
          expect(location(stale)).toBe("/pl/checkout");
          expect(priceChange(await active(connection, token))).not.toBeNull();

          const confirmed = await runUpdateSelection(
            ctx(connection, token),
            form({
              line: "1",
              intent: "confirmPrice",
              seenTotalMinor: String(current),
              seenCurrency: "PLN",
              returnStep: "card",
            }),
          );
          expect(location(confirmed)).toBe("/pl/checkout?step=card");
          const draft = await active(connection, token);
          expect(priceChange(draft)).toBeNull();
          expect(draft.confirmed).toEqual({
            amountMinor: current,
            currency: "PLN",
          });
        });
      });

      it("sends every step to step 1 while the notice is open", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const shown = await shownTotal();
          const token = await started(connection, {
            ...(await validStart()),
            expectedTotalMinor: String(shown + 1),
          });
          await saveLine(
            (await active(connection, token)).id,
            1,
            { stepsCompleted: 1 },
            at(1),
            connection,
          );
          const outcome = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm(),
          );
          expect(location(outcome)).toBe("/pl/checkout");
        });
      });

      it("discards a tampered stored quote, re-derives it and restarts at step 1", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          await tx`UPDATE checkout_draft_line
                      SET quote = jsonb_set(quote, '{digest}', to_jsonb(${"0".repeat(64)}::text))`;
          const outcome = await runCardAndBuyerStep(
            ctx(connection, token),
            cardForm(),
          );
          expect(location(outcome)).toBe("/pl/checkout");
          const draft = await active(connection, token);
          expect(draft.stepsCompleted).toBe(0);
          expect(draft.quote?.digest).not.toBe("0".repeat(64));
          expect(draft.recipient?.fullName).toBe(
            SAMPLE.recipient.fields.fullName,
          );
        });
      });

      it("restarts at step 1 when the stored quote no longer parses, instead of reloading the step (hole 16)", async () => {
        for (const breakQuote of [
          (tx: Tx) =>
            tx`UPDATE checkout_draft_line SET quote = jsonb_set(quote, '{totalMinor}', to_jsonb('x'::text))`,
          (tx: Tx) =>
            tx`UPDATE checkout_draft_line SET quote = quote - 'lines'`,
        ]) {
          await run(async (tx) => {
            const connection = await seeded(tx);
            const token = await started(connection);
            await runRecipientStep(ctx(connection, token), recipientForm());
            await breakQuote(tx);
            const outcomes: string[] = [];
            for (const minutes of [2, 3, 4]) {
              outcomes.push(
                location(
                  await runCardAndBuyerStep(
                    ctx(connection, token, minutes),
                    cardForm(),
                  ),
                ),
              );
            }
            // The first post restarts the draft at step 1 with a fresh quote; the next two are
            // sent to step 1 by the step gate, because step 1 is now incomplete.
            expect(outcomes).toEqual([
              "/pl/checkout",
              "/pl/checkout",
              "/pl/checkout",
            ]);
            const restarted = await active(connection, token, 5);
            expect(restarted.stepsCompleted).toBe(0);
            expect(restarted.quote).not.toBeNull();
            expect(restarted.card).not.toBeNull();
            expect((await verifyDraftQuote(restarted, at(5))).verdict).toBe(
              "ok",
            );
            // And the buyer gets out: step 1, then step 2, move on again.
            expect(
              location(
                await runRecipientStep(
                  ctx(connection, token, 6),
                  recipientForm(),
                ),
              ),
            ).toBe("/pl/checkout?step=card");
            expect(
              location(
                await runCardAndBuyerStep(
                  ctx(connection, token, 7),
                  cardForm(),
                ),
              ),
            ).toBe("/pl/checkout?step=review");
          });
        }
      });

      it("reissues an expired, unchanged quote silently and keeps going", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          await runRecipientStep(ctx(connection, token), recipientForm());
          const issued = (await active(connection, token)).quote;
          const outcome = await runRecipientStep(
            ctx(connection, token, 45),
            recipientForm(),
          );
          expect(location(outcome)).toBe("/pl/checkout?step=card");
          const draft = await active(connection, token, 46);
          expect(draft.quote?.totalMinor).toBe(issued?.totalMinor);
          expect(draft.quote?.digest).not.toBe(issued?.digest);
          expect(priceChange(draft)).toBeNull();
        });
      });

      it("renders the closed state when the destination closes mid-checkout, writing nothing", async () => {
        await run(async (tx) => {
          const connection = await seeded(tx);
          const token = await started(connection);
          const outcome = await runRecipientStep(
            { ...ctx(connection, token), flags: CLOSED },
            recipientForm(),
          );
          expect(outcome).toEqual({
            kind: "render",
            state: { status: "closed" },
          });
          expect((await active(connection, token)).recipient).toBeNull();
        });
      });
    });
  },
);
