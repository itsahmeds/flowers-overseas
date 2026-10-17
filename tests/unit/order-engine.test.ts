/**
 * The order engine without a database (spec 010 §10 T-22 unit half, T-24, T-41 and T-42 unit
 * halves; AC-22, AC-24, AC-41, AC-42, AC-43; §14 A1.1, A1.2, A1.3, A2.1; TASK-202).
 *
 * A recording executor stands in for Postgres: it answers the engine's reads from a script and
 * keeps every statement in order, so the statement sequence A1.2 prescribes (switch on, event
 * set, exactly one status update, both reset, every setting transaction-local) is asserted for
 * every row of the machine, self-loops included. `0008`'s trigger also clears both settings,
 * which hides a missing engine reset at the integration layer; this is the layer that sees it.
 *
 * The connected half is `tests/integration/order-engine.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  ACTOR_CLASSES,
  actorClass,
  ActorSchema,
  eventSchema,
  isOrderEngineError,
  ORDER_EVENT_TYPES,
  ORDER_REFERENCE_PATTERN,
  orderReference,
  outboxTargets,
  registeredEventTypes,
  resolveOutboxTargets,
  STATUS_PRESERVING_EVENTS as SRC_STATUS_PRESERVING,
  TRANSITION_EVENTS as SRC_TRANSITION_EVENTS,
  type OrderExecutor,
  type OutboxRoutes,
} from "@/modules/orders";
import { appendEventWith } from "@/modules/orders/service/append-event";
import { writeOutbox } from "@/modules/orders/service/outbox";
import { placeWith } from "@/modules/orders/service/place";
import { transitionWith } from "@/modules/orders/service/transition";

import {
  ACTOR_OF,
  payloadFor,
  placeInput,
  registerFixtureEventSchemas,
} from "../fixtures/order-engine.ts";
import {
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";

registerFixtureEventSchemas();

const dialect = new PgDialect();
const ORDER_ID = "3f0a6f8e-2c1b-4d5e-9f7a-8b6c5d4e3f21";
const EVENT_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface Script {
  readonly status?: string;
  readonly mode?: "demo" | "test" | "live";
  readonly row?: { to_status: string; allowed_actors: string[] } | null;
  readonly guarded?: boolean;
  readonly offerExists?: boolean;
  /** Throw (without running it) when a statement matches. */
  readonly throwOn?: RegExp;
}

function recorder(script: Script = {}): {
  log: Recorded[];
  executor: OrderExecutor;
} {
  const log: Recorded[] = [];
  const executor: OrderExecutor = {
    async execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      log.push({ sql, params });
      await Promise.resolve();
      if (script.throwOn?.test(sql) === true) throw new Error("injected");
      if (/FROM order_assignment/.test(sql)) {
        return script.offerExists === false ? [] : [{ found: 1 }];
      }
      if (/FROM "order" WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return [
          {
            id: ORDER_ID,
            status: script.status ?? "placed",
            mode: script.mode ?? "demo",
          },
        ];
      }
      if (/FROM order_transition\s+WHERE from_status/.test(sql)) {
        return script.row === null || script.row === undefined
          ? []
          : [script.row];
      }
      if (/FROM order_transition WHERE event/.test(sql)) {
        return script.guarded === true ? [{ guarded: 1 }] : [];
      }
      if (/coalesce\(max\(seq\), 0\) \+ 1/.test(sql)) return [{ seq: 5 }];
      if (/INSERT INTO order_event/.test(sql)) return [{ id: EVENT_ID }];
      if (/SELECT supply_model FROM country/.test(sql))
        return [{ supply_model: null }];
      if (/INSERT INTO "order"/.test(sql)) return [{ id: params[0] }];
      return [];
    },
  };
  return { log, executor };
}

/** The setting and status statements, in order, named. */
function settingSequence(log: readonly Recorded[]): string[] {
  const names: string[] = [];
  for (const entry of log) {
    const text = entry.sql.replace(/\s+/g, " ").trim();
    if (text.includes("set_config('app.allow_status_write', 'on', true)"))
      names.push("switch on");
    else if (text.includes("set_config('app.allow_status_write', '', true)"))
      names.push("switch reset");
    else if (text.includes("set_config('app.transition_event', '', true)"))
      names.push("event reset");
    else if (text.includes("set_config('app.transition_event', $1, true)"))
      names.push(`event set ${String(entry.params[0])}`);
    else if (text.includes("set_config")) names.push(`other setting: ${text}`);
    else if (/^UPDATE "order" SET status/.test(text))
      names.push("status update");
    else if (/^INSERT INTO "order"/.test(text)) names.push("order insert");
  }
  return names;
}

async function refusalCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("events and actors (AC-22 unit half; A1.1)", () => {
  it("the engine's transition and status-preserving lists equal the fixture's, in both directions", () => {
    expect([...SRC_TRANSITION_EVENTS].sort()).toEqual(
      [...TRANSITION_EVENTS].sort(),
    );
    expect([...SRC_STATUS_PRESERVING].sort()).toEqual(
      [...STATUS_PRESERVING_EVENTS].sort(),
    );
    expect(SRC_TRANSITION_EVENTS).toHaveLength(28);
    expect(SRC_STATUS_PRESERVING).toHaveLength(8);
    expect(ORDER_EVENT_TYPES).toHaveLength(36);
    for (const label of ["accept", "capture", "pay", "route", "deliver"]) {
      expect(ORDER_EVENT_TYPES).not.toContain(label);
    }
  });

  it("spec 010's four events carry versioned strict schemas with `mode` and no personal key", () => {
    for (const type of [
      "order.placed",
      "order.authorised",
      "order.routed",
      "assignment.offered",
    ]) {
      expect(registeredEventTypes()).toContain(type);
      const registered = eventSchema(type);
      expect(registered?.version).toBe(1);
      const shape = (
        registered?.schema as unknown as { shape: Record<string, unknown> }
      ).shape;
      expect(Object.keys(shape)).toContain("mode");
      for (const key of Object.keys(shape)) {
        expect(key).not.toMatch(
          /name|phone|email|address|street|postcode|postal|card|message|signas/i,
        );
      }
      expect(
        registered?.schema.safeParse({ mode: "demo", fullName: "x" }).success,
      ).toBe(false);
    }
  });

  it("ActorSchema takes the four classes and refuses a hyphenated system name", () => {
    for (const ok of [
      "buyer",
      ACTOR_OF.partner,
      ACTOR_OF.admin,
      "system:demo_guard",
      "system:demo_router",
      "system:retention.sweep",
    ]) {
      expect(ActorSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of [
      "system:demo-guard",
      "system:",
      "partner:not-a-uuid",
      "Buyer",
      "buyer:x",
      "",
      `admin:${ACTOR_OF.admin.slice(6).toUpperCase()}`,
    ]) {
      expect(ActorSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(actorClass(ActorSchema.parse(ACTOR_OF.partner))).toBe("partner");
    expect(actorClass(ActorSchema.parse("buyer"))).toBe("buyer");
  });
});

describe("transition's statement sequence (T-41 unit half, AC-41; A1.2)", () => {
  it.each(
    TRANSITIONS.map((row) => [row.from, row.event, row.to, row] as const),
  )(
    "%s --%s--> %s: switch on, event set, one status update, both reset",
    async (_from, _event, _to, row) => {
      const klass = row.allowedActors[0] ?? "system";
      const { log, executor } = recorder({
        status: row.from,
        row: { to_status: row.to, allowed_actors: [...row.allowedActors] },
      });
      const result = await transitionWith(
        executor,
        ORDER_ID,
        row.event,
        ACTOR_OF[klass],
        payloadFor(row.event, "demo"),
      );
      expect(result.toStatus).toBe(row.to);
      expect(settingSequence(log)).toEqual([
        "switch on",
        `event set ${row.event}`,
        "status update",
        "switch reset",
        "event reset",
      ]);
      const update = log.find((entry) =>
        /UPDATE "order" SET status/.test(entry.sql),
      );
      expect(update?.params).toEqual([row.to, ORDER_ID]);
      for (const entry of log.filter((e) => e.sql.includes("set_config"))) {
        expect(entry.sql).toMatch(
          /set_config\('app\.[a-z_]+', (?:'[^']*'|\$1), true\)/,
        );
      }
    },
  );

  it("every refusal comes before either setting is touched (A1.2, A1.5)", async () => {
    const cases: [string, Script, string, unknown, string][] = [
      [
        "actor",
        { row: { to_status: "authorised", allowed_actors: ["system"] } },
        "system:demo-guard",
        { mode: "demo" },
        "ORDER_ACTOR_INVALID",
      ],
      [
        "payload",
        { row: { to_status: "authorised", allowed_actors: ["system"] } },
        "system:demo_guard",
        { mode: "demo", extra: 1 },
        "ORDER_PAYLOAD_INVALID",
      ],
      [
        "illegal",
        { row: null },
        "system:demo_guard",
        { mode: "demo" },
        "ORDER_TRANSITION_ILLEGAL",
      ],
      [
        "class",
        { row: { to_status: "authorised", allowed_actors: ["admin"] } },
        "system:demo_guard",
        { mode: "demo" },
        "ORDER_ACTOR_NOT_ALLOWED",
      ],
      [
        "mode",
        { row: { to_status: "authorised", allowed_actors: ["system"] } },
        "system:demo_guard",
        { mode: "live" },
        "ORDER_PAYLOAD_INVALID",
      ],
    ];
    for (const [label, script, actor, payload, code] of cases) {
      const { log, executor } = recorder(script);
      expect(
        await refusalCode(
          transitionWith(
            executor,
            ORDER_ID,
            "order.authorised",
            actor,
            payload,
          ),
        ),
        label,
      ).toBe(code);
      expect(settingSequence(log), label).toEqual([]);
      expect(
        log.some((e) => /^\s*(INSERT|UPDATE)/.test(e.sql)),
        label,
      ).toBe(false);
    }
  });

  it("the class, not the whole actor string, is compared with allowed_actors (A1.5)", async () => {
    for (const klass of ACTOR_CLASSES) {
      const { executor } = recorder({
        status: "routed",
        row: {
          to_status: "cancelled",
          allowed_actors: ["buyer", "admin", "system"],
        },
      });
      const outcome = transitionWith(
        executor,
        ORDER_ID,
        "order.cancelled",
        ACTOR_OF[klass],
        { mode: "demo" },
      );
      if (klass === "partner")
        expect(await refusalCode(outcome)).toBe("ORDER_ACTOR_NOT_ALLOWED");
      else expect((await outcome).toStatus).toBe("cancelled");
    }
  });
});

describe("place's statements (T-42 unit half, AC-42; A1.3)", () => {
  it("sets only the switch, around the one insert, and never the event", async () => {
    const { log, executor } = recorder();
    const { orderId } = await placeWith(
      executor,
      placeInput({
        countryId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
        customerId: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e",
        recipientId: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f",
        productId: "4e5f6071-8293-4dae-9f20-3b4c5d6e7f80",
      }),
    );
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(settingSequence(log)).toEqual([
      "switch on",
      "order insert",
      "switch reset",
    ]);
    expect(
      log.some((entry) => entry.sql.includes("app.transition_event")),
    ).toBe(false);
    const insert = log.findIndex((entry) =>
      /INSERT INTO "order"/.test(entry.sql),
    );
    expect(log[insert + 1]?.sql).toContain(
      "set_config('app.allow_status_write', '', true)",
    );
    const event = log.find((entry) =>
      /INSERT INTO order_event/.test(entry.sql),
    );
    expect(event?.params).toContain("order.placed");
  });

  it("refuses an input that would break price shown = price charged or the terms rule, before any statement", async () => {
    const parents = {
      countryId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
      customerId: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e",
      recipientId: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f",
      productId: "4e5f6071-8293-4dae-9f20-3b4c5d6e7f80",
    };
    for (const overrides of [
      { buyerTotalMinor: 19_901 },
      { termsVersion: "2026-10" },
      { mode: "live" as const },
      { baseCurrency: "EUR" },
    ]) {
      const { log, executor } = recorder();
      expect(
        await refusalCode(placeWith(executor, placeInput(parents, overrides))),
      ).toBe("ORDER_INPUT_INVALID");
      expect(log).toEqual([]);
    }
  });
});

describe("appendEvent (AC-43 unit half; A1.4)", () => {
  it("refuses an event with an order_transition row before any write and any setting", async () => {
    const { log, executor } = recorder({ guarded: true, status: "routed" });
    expect(
      await refusalCode(
        appendEventWith(executor, ORDER_ID, "order.cancelled", "system:x", {
          mode: "demo",
        }),
      ),
    ).toBe("ORDER_EVENT_NEEDS_TRANSITION");
    expect(log).toHaveLength(1);
    expect(log[0]?.sql).toMatch(/FROM order_transition WHERE event/);
  });

  it("appends a status-preserving event with from = to and touches no setting", async () => {
    const { log, executor } = recorder({ status: "routed" });
    await appendEventWith(
      executor,
      ORDER_ID,
      "assignment.offered",
      "system:demo_router",
      {
        mode: "demo",
        assignmentId: EVENT_ID,
        partnerId: EVENT_ID,
        attempt: 1,
        answerWindowMinutes: 60,
      },
    );
    expect(settingSequence(log)).toEqual([]);
    const insert = log.find((entry) =>
      /INSERT INTO order_event/.test(entry.sql),
    );
    expect(insert?.params.slice(0, 5)).toEqual([
      ORDER_ID,
      5,
      "assignment.offered",
      "routed",
      "routed",
    ]);
  });
});

describe("outboxTargets (T-24, AC-24)", () => {
  const four = [
    "order.placed",
    "order.authorised",
    "order.routed",
    "assignment.offered",
  ] as const;

  it("returns no target that messages a buyer or a recipient for demo and test orders", () => {
    for (const event of four) {
      for (const mode of ["demo", "test"] as const) {
        const audiences = outboxTargets(event, mode).map(
          (target) => target.audience,
        );
        expect(audiences).not.toContain("buyer");
        expect(audiences).not.toContain("recipient");
      }
    }
  });

  it("filters people out of any route table for demo and test, and keeps them for live", () => {
    const everyone = [
      { name: "notify.buyer_email", audience: "buyer" },
      { name: "notify.recipient_sms", audience: "recipient" },
      { name: "notify.partner", audience: "partner" },
      { name: "ops.alert", audience: "staff" },
    ] as const;
    const routes: OutboxRoutes = Object.fromEntries(
      four.map((event) => [event, everyone]),
    );
    for (const event of four) {
      for (const mode of ["demo", "test"] as const) {
        expect(
          resolveOutboxTargets(routes, event, mode).map((t) => t.name),
        ).toEqual(["notify.partner", "ops.alert"]);
      }
      expect(resolveOutboxTargets(routes, event, "live")).toHaveLength(4);
    }
  });
});

describe("orderReference (A2.1, pure half)", () => {
  it("is FO-XXXX-XXXX in Crockford base32 of the id's first 40 bits", () => {
    expect(orderReference("00000000-0000-4000-8000-000000000000")).toBe(
      "FO-0000-0000",
    );
    expect(orderReference("00000000-0100-4000-8000-000000000000")).toBe(
      "FO-0000-0001",
    );
    expect(orderReference("00000000-2000-4000-8000-000000000000")).toBe(
      "FO-0000-0010",
    );
    expect(orderReference("ffffffff-ff00-4000-8000-000000000000")).toBe(
      "FO-ZZZZ-ZZZZ",
    );
    for (let index = 0; index < 1000; index += 1) {
      const reference = orderReference(crypto.randomUUID());
      expect(reference).toMatch(ORDER_REFERENCE_PATTERN);
      expect(reference.slice(3)).not.toMatch(/[ILOU]/);
    }
    expect(() => orderReference("not-a-uuid")).toThrow(TypeError);
  });
});

describe("source scan (T-41, AC-41)", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("no session-level SET app., no set_config(…, false), and every set_config is transaction-local under src/modules/orders", () => {
    const sources = files(join(process.cwd(), "src/modules/orders")).filter(
      (f) => f.endsWith(".ts"),
    );
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\bSET\s+(?:SESSION\s+)?app\./i);
      expect(text, file).not.toMatch(/set_config\([^)]*,\s*false\s*\)/i);
      for (const call of text.match(/set_config\([^)]*\)/g) ?? []) {
        expect(call, file).toMatch(/,\s*true\s*\)$/);
      }
    }
  });
});

describe("read projections run under the right context (AC-25; R3, R4)", () => {
  it("listOrdersForPartner enters role partner with only that florist; listOrdersForAdmin enters admin", async () => {
    const contexts: unknown[] = [];
    const queries: SQL[] = [];
    const fakeDb = {
      execute: vi.fn(async (query: SQL) => {
        queries.push(query);
        return [];
      }),
    };
    vi.doMock("@/lib/db", () => ({
      withDbContext: vi.fn(
        async (context: unknown, fn: (db: unknown) => Promise<unknown>) => {
          contexts.push(context);
          return fn(fakeDb);
        },
      ),
      withAdminContext: vi.fn(
        async (actor: unknown, fn: (db: unknown) => Promise<unknown>) => {
          contexts.push({ admin: actor });
          return fn(fakeDb);
        },
      ),
    }));
    vi.resetModules();
    const { listOrdersForAdmin, listOrdersForPartner } =
      await import("@/modules/orders/queries");
    const partnerId = "5f607182-93a4-4ebf-8031-4c5d6e7f8091";
    expect(
      await listOrdersForPartner(partnerId, { requestId: "req-1" }),
    ).toEqual([]);
    expect(
      await listOrdersForAdmin({ status: "routed" }, { requestId: "req-2" }),
    ).toEqual([]);
    expect(contexts).toEqual([
      { role: "partner", partnerIds: [partnerId], requestId: "req-1" },
      { admin: { requestId: "req-2" } },
    ]);
    const partnerSql = dialect.sqlToQuery(queries[0] as SQL).sql;
    expect(partnerSql).toMatch(/FROM partner_order o/);
    expect(partnerSql).toMatch(/partner_order_line/);
    expect(partnerSql).not.toMatch(/FROM "order"|snapshot|order_line ol/);
    await expect(listOrdersForPartner("not-a-uuid")).rejects.toThrow();
    vi.doUnmock("@/lib/db");
  });
});

const PARENTS = {
  countryId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  customerId: "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e",
  recipientId: "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f",
  productId: "4e5f6071-8293-4dae-9f20-3b4c5d6e7f80",
};
const OFFER = {
  mode: "demo",
  assignmentId: EVENT_ID,
  partnerId: ORDER_ID,
  attempt: 1,
  answerWindowMinutes: 60,
};

describe("breaker round 1 on PR 243 (holes 1, 2, 3, 8)", () => {
  it("hole 1: appendEvent refuses order.placed, a buyer's offer, and an offer that does not exist", async () => {
    const placed = recorder({ status: "routed" });
    expect(
      await refusalCode(
        appendEventWith(placed.executor, ORDER_ID, "order.placed", "buyer", {
          mode: "demo",
          buyerCurrency: "PLN",
          buyerTotalMinor: 1,
          deliveryDate: "2027-01-01",
          lineCount: 1,
        }),
      ),
    ).toBe("ORDER_EVENT_PLACE_ONLY");
    const buyer = recorder({ status: "placed" });
    expect(
      await refusalCode(
        appendEventWith(
          buyer.executor,
          ORDER_ID,
          "assignment.offered",
          "buyer",
          OFFER,
        ),
      ),
    ).toBe("ORDER_ACTOR_NOT_ALLOWED");
    const ghost = recorder({ status: "routed", offerExists: false });
    expect(
      await refusalCode(
        appendEventWith(
          ghost.executor,
          ORDER_ID,
          "assignment.offered",
          "system:demo_router",
          OFFER,
        ),
      ),
    ).toBe("ORDER_PAYLOAD_INVALID");
    for (const { log } of [placed, buyer, ghost]) {
      expect(log.some((e) => /^\s*INSERT/.test(e.sql))).toBe(false);
    }
  });

  it("hole 2: an injected resolver cannot route a demo or test event to a buyer or a recipient", async () => {
    const people = () =>
      [
        { name: "notify.buyer_email", audience: "buyer" },
        { name: "notify.recipient_sms", audience: "recipient" },
      ] as const;
    for (const mode of ["demo", "test"] as const) {
      const { log, executor } = recorder();
      const id = await writeOutbox(
        executor,
        {
          eventId: EVENT_ID,
          orderId: ORDER_ID,
          type: "order.routed",
          seq: 3,
          mode,
          payload: { mode },
          payloadVersion: 1,
        },
        people,
      );
      expect(id).toBeNull();
      expect(log).toEqual([]);
    }
    const live = recorder();
    await expect(
      writeOutbox(
        live.executor,
        {
          eventId: EVENT_ID,
          orderId: ORDER_ID,
          type: "order.routed",
          seq: 3,
          mode: "live",
          payload: { mode: "live" },
          payloadVersion: 1,
        },
        people,
      ),
    ).rejects.toThrow();
    expect(live.log.map((e) => e.sql)).toEqual([
      expect.stringMatching(/INSERT INTO outbox/),
    ]);
  });

  it("hole 3: place refuses a VAT breakdown that does not add up and a base total or rate that does not match", async () => {
    const eur = {
      buyerCurrency: "EUR",
      buyerTotalMinor: 4_500,
      baseCurrency: "PLN",
      baseTotalMinor: 19_900,
      fxRatePpm: 226_000,
      vatBreakdown: [
        { rateBp: 800, netMinor: 4_167, vatMinor: 333, grossMinor: 4_500 },
      ],
      lines: [
        {
          kind: "product" as const,
          productId: PARENTS.productId,
          tierKey: "classic",
          qty: 1,
          unitRetailMinor: 4_500,
          vatRateBp: 800,
        },
      ],
    };
    const accepted = recorder();
    await placeWith(accepted.executor, placeInput(PARENTS, eur));
    expect(accepted.log.length).toBeGreaterThan(0);
    for (const overrides of [
      {
        vatBreakdown: [
          { rateBp: 800, netMinor: 1, vatMinor: 1, grossMinor: 2 },
        ],
      },
      { vatBreakdown: [] },
      { baseTotalMinor: 1, fxRatePpm: 1 },
      { baseTotalMinor: 1 },
      { fxRatePpm: 1_000_001 },
      { ...eur, fxRatePpm: 1 },
      { ...eur, baseTotalMinor: 1 },
      { ...eur, fxRatePpm: undefined },
    ]) {
      const { log, executor } = recorder();
      expect(
        await refusalCode(placeWith(executor, placeInput(PARENTS, overrides))),
        JSON.stringify(overrides),
      ).toBe("ORDER_INPUT_INVALID");
      expect(log).toEqual([]);
    }
  });

  it("hole 8: a throw between the switch and the reset still resets both settings, and the first error is rethrown", async () => {
    const t = recorder({
      row: { to_status: "authorised", allowed_actors: ["system"] },
      throwOn: /UPDATE "order" SET status/,
    });
    await expect(
      transitionWith(
        t.executor,
        ORDER_ID,
        "order.authorised",
        "system:demo_guard",
        { mode: "demo" },
      ),
    ).rejects.toThrow("injected");
    expect(settingSequence(t.log)).toEqual([
      "switch on",
      "event set order.authorised",
      "status update",
      "switch reset",
      "event reset",
    ]);
    const p = recorder({ throwOn: /INSERT INTO "order"/ });
    await expect(placeWith(p.executor, placeInput(PARENTS))).rejects.toThrow(
      "injected",
    );
    expect(settingSequence(p.log)).toEqual([
      "switch on",
      "order insert",
      "switch reset",
    ]);
  });
});
