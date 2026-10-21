/**
 * T-19, unit half (spec 013 AC-19; spec 002 §14 A7.2; TASK-254): the event schemas spec 013
 * registers in spec 010's registry.
 *
 *  - every event spec 013 writes has a versioned schema in the registry, and the registry holds
 *    exactly the schema this module exports;
 *  - each schema parses a valid payload and refuses an invalid one, and the engine refuses a
 *    failing payload **before any write** (a recording executor sees no `INSERT` or `UPDATE`);
 *  - no schema declares a key the logger would redact;
 *  - `order.refund_requested` and `order.payment_attempt_failed` take `appendEvent`, every other
 *    event `transition`, and the engine holds each to its path;
 *  - a source scan finds none of §5.2's arrow labels used as an event type under `src/`.
 *
 * The connected half (each event written through the engine on a migrated database) is
 * `tests/integration/payments-a7.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { isRedactedLogKey } from "@/lib/logger";
import {
  eventSchema,
  isOrderEngineError,
  OrderAuthorisedV1,
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
  type OrderExecutor,
} from "@/modules/orders";
import { appendEventWith } from "@/modules/orders/service/append-event";
import { transitionWith } from "@/modules/orders/service/transition";
import {
  ORDER_CAPTURED_PAYMENT_FIELDS,
  PAYMENT_EVENT_SCHEMAS,
  REFUND_REASONS,
  type PaymentEventType,
} from "@/modules/payments/events";

const ORDER_ID = "3f0a6f8e-2c1b-4d5e-9f7a-8b6c5d4e3f21";
const PAYMENT_ID = "6a1d0c2e-4b5f-4e7a-9c8d-0f1e2d3c4b5a";
const REFUND_ID = "7b2e1d3f-5c6a-4f8b-8d9e-1a2b3c4d5e6f";
const DISPUTE_ID = "8c3f2e4a-6d7b-4a9c-9e0f-2b3c4d5e6f7a";

/** One valid payload per event spec 013 registers. */
const VALID: Readonly<Record<PaymentEventType, Record<string, unknown>>> = {
  "order.payment_failed": { mode: "live", payment_id: PAYMENT_ID, attempts: 2 },
  "order.abandoned": { mode: "test", payment_id: null },
  "order.cancelled": { mode: "live", reason: "buyer_cancel" },
  "order.refunded_partial": {
    mode: "live",
    refund_id: REFUND_ID,
    amount_minor: 1_500,
    currency_code: "PLN",
    reason: "quality",
  },
  "order.refunded_full": {
    mode: "live",
    refund_id: REFUND_ID,
    amount_minor: 18_900,
    currency_code: "EUR",
    reason: "no_partner",
  },
  "order.chargeback_opened": {
    mode: "live",
    dispute_id: DISPUTE_ID,
    amount_minor: 18_900,
    currency_code: "GBP",
  },
  "order.chargeback_won": { mode: "live", dispute_id: DISPUTE_ID },
  "order.chargeback_lost": { mode: "test", dispute_id: DISPUTE_ID },
  "order.refund_requested": {
    mode: "live",
    refund_id: REFUND_ID,
    amount_minor: 500,
    currency_code: "PLN",
    reason: "goodwill",
  },
  "order.payment_attempt_failed": {
    mode: "test",
    payment_id: PAYMENT_ID,
    attempt: 1,
    decline_code: "insufficient_funds",
  },
};

/** Per event, payloads its schema must refuse, each named. */
function invalid(
  type: PaymentEventType,
): Record<string, Record<string, unknown>> {
  const valid = VALID[type];
  const out: Record<string, Record<string, unknown>> = {
    "no mode": Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== "mode"),
    ),
    "unknown mode": { ...valid, mode: "staging" },
    "an extra key": { ...valid, note: "x" },
    "a personal key": { ...valid, email: "buyer@example.test" },
  };
  for (const key of Object.keys(valid)) {
    if (key === "mode") continue;
    out[`no ${key}`] = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== key),
    );
  }
  if ("amount_minor" in valid) {
    out["a float amount"] = { ...valid, amount_minor: 15.5 };
    out["a zero amount"] = { ...valid, amount_minor: 0 };
    out["a negative amount"] = { ...valid, amount_minor: -100 };
  }
  if ("currency_code" in valid) {
    out["a lower-case currency"] = { ...valid, currency_code: "pln" };
  }
  if ("reason" in valid)
    out["an unknown reason"] = { ...valid, reason: "fraud" };
  for (const key of ["payment_id", "refund_id", "dispute_id"]) {
    if (key in valid && valid[key] !== null) {
      out[`a non-uuid ${key}`] = { ...valid, [key]: "pi_123" };
    }
  }
  if ("decline_code" in valid) {
    out["the bank's text as a code"] = {
      ...valid,
      decline_code: "Your card has insufficient funds.",
    };
  }
  return out;
}

const TYPES = Object.keys(PAYMENT_EVENT_SCHEMAS) as PaymentEventType[];

describe("the registry holds spec 013's schemas (AC-19)", () => {
  it("names exactly the ten events §5.2 lists, eight transition and two status-preserving", () => {
    expect([...TYPES].sort()).toEqual(
      [
        "order.abandoned",
        "order.cancelled",
        "order.chargeback_lost",
        "order.chargeback_opened",
        "order.chargeback_won",
        "order.payment_attempt_failed",
        "order.payment_failed",
        "order.refund_requested",
        "order.refunded_full",
        "order.refunded_partial",
      ].sort(),
    );
  });

  it("registers each, at version 1, as the very schema this module exports", () => {
    for (const type of TYPES) {
      const registered = eventSchema(type);
      expect(registered?.version, type).toBe(1);
      expect(registered?.schema, type).toBe(PAYMENT_EVENT_SCHEMAS[type].schema);
    }
  });

  it("parses each valid payload and refuses every invalid one", () => {
    for (const type of TYPES) {
      const schema = PAYMENT_EVENT_SCHEMAS[type].schema;
      expect(schema.safeParse(VALID[type]).success, type).toBe(true);
      for (const [name, payload] of Object.entries(invalid(type))) {
        expect(schema.safeParse(payload).success, `${type}: ${name}`).toBe(
          false,
        );
      }
    }
  });

  it("accepts every A7.4 reason for a cancellation and for each refund event", () => {
    expect(REFUND_REASONS).toHaveLength(11);
    for (const reason of REFUND_REASONS) {
      for (const type of [
        "order.cancelled",
        "order.refund_requested",
        "order.refunded_partial",
        "order.refunded_full",
      ] as const) {
        expect(
          PAYMENT_EVENT_SCHEMAS[type].schema.safeParse({
            ...VALID[type],
            reason,
          }).success,
          `${type}: ${reason}`,
        ).toBe(true);
      }
    }
  });

  it("gives the three refund events exactly the five fields spec 018 §12 asks for, and a cancellation exactly reason and mode", () => {
    for (const type of [
      "order.refund_requested",
      "order.refunded_partial",
      "order.refunded_full",
    ] as const) {
      expect(
        Object.keys(shapeOf(PAYMENT_EVENT_SCHEMAS[type].schema)).sort(),
        type,
      ).toEqual([
        "amount_minor",
        "currency_code",
        "mode",
        "reason",
        "refund_id",
      ]);
    }
    expect(
      Object.keys(
        shapeOf(PAYMENT_EVENT_SCHEMAS["order.cancelled"].schema),
      ).sort(),
    ).toEqual(["mode", "reason"]);
  });

  it("adds payment_id and capture_method to spec 010's OrderAuthorisedV1 as optional fields only", () => {
    expect(OrderAuthorisedV1.safeParse({ mode: "demo" }).success).toBe(true);
    expect(
      OrderAuthorisedV1.safeParse({
        mode: "live",
        payment_id: PAYMENT_ID,
        capture_method: "automatic",
      }).success,
    ).toBe(true);
    expect(
      OrderAuthorisedV1.safeParse({ mode: "live", capture_method: "hold" })
        .success,
    ).toBe(false);
    expect(
      OrderAuthorisedV1.safeParse({ mode: "live", payment_id: "pi_1" }).success,
    ).toBe(false);
    expect(Object.keys(ORDER_CAPTURED_PAYMENT_FIELDS).sort()).toEqual([
      "payment_id",
      "provider_call",
    ]);
    for (const field of Object.values(ORDER_CAPTURED_PAYMENT_FIELDS)) {
      expect(field.safeParse(undefined).success).toBe(true);
    }
  });
});

/** The object shape of a strict object schema. */
function shapeOf(schema: z.ZodType): Record<string, z.ZodType> {
  return (schema as unknown as { shape: Record<string, z.ZodType> }).shape;
}

describe("no schema declares a key the logger would redact (AC-19)", () => {
  it("walks every key of every schema spec 013 registers or extends", () => {
    const keys = [
      ...TYPES.flatMap((type) =>
        Object.keys(shapeOf(PAYMENT_EVENT_SCHEMAS[type].schema)),
      ),
      ...Object.keys(shapeOf(OrderAuthorisedV1)),
      ...Object.keys(ORDER_CAPTURED_PAYMENT_FIELDS),
    ];
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((key) => isRedactedLogKey(key))).toEqual([]);
  });

  it("the walk would catch one (the predicate is not vacuous)", () => {
    for (const key of [
      "card_last4",
      "email",
      "recipient_name",
      "address_line1",
    ]) {
      expect(isRedactedLogKey(key), key).toBe(true);
    }
  });
});

describe("each event takes its one engine path (AC-19)", () => {
  it("the transition events are A6.6 transition events, the two others status-preserving", () => {
    const transition = (TRANSITION_EVENTS as readonly string[]).slice();
    const preserving = (STATUS_PRESERVING_EVENTS as readonly string[]).slice();
    for (const type of TYPES) {
      const writer = PAYMENT_EVENT_SCHEMAS[type].writer;
      if (writer === "transition") expect(transition, type).toContain(type);
      else expect(preserving, type).toContain(type);
    }
    expect(
      TYPES.filter(
        (type) => PAYMENT_EVENT_SCHEMAS[type].writer === "appendEvent",
      ).sort(),
    ).toEqual(["order.payment_attempt_failed", "order.refund_requested"]);
  });
});

const dialect = new PgDialect();

/** An executor that answers the engine's reads and keeps every statement it was sent. */
function recorder(mode: "test" | "live"): {
  log: string[];
  executor: OrderExecutor;
} {
  const log: string[] = [];
  const executor: OrderExecutor = {
    async execute(query: SQL) {
      const text = dialect.sqlToQuery(query).sql;
      log.push(text);
      await Promise.resolve();
      if (/FROM "order" WHERE id = \$1 FOR UPDATE/.test(text)) {
        return [{ id: ORDER_ID, status: "placed", mode }];
      }
      return [];
    },
  };
  return { log, executor };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("a payload that fails its schema is refused before any write (AC-19)", () => {
  it("through transition and through appendEvent, with no INSERT or UPDATE sent", async () => {
    for (const type of TYPES) {
      const { log, executor } = recorder("live");
      const bad = { ...VALID[type], note: "x" };
      const code =
        PAYMENT_EVENT_SCHEMAS[type].writer === "transition"
          ? await refusal(
              transitionWith(executor, ORDER_ID, type, "system:payments", bad),
            )
          : await refusal(
              appendEventWith(executor, ORDER_ID, type, "system:payments", bad),
            );
      expect(code, type).toBe("ORDER_PAYLOAD_INVALID");
      expect(
        log.filter((text) => /^\s*(INSERT|UPDATE)\b/i.test(text)),
        type,
      ).toEqual([]);
    }
  });
});

const ARROW_LABELS = [
  "pay",
  "capture",
  "capture_failed",
  "buyer_cancel",
  "expire",
  "refund_partial",
  "refund_full",
  "chargeback",
] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every use of an arrow label as an event type in `text`: a namespaced name, or an engine call. */
function arrowLabelUses(text: string): string[] {
  const labels = ARROW_LABELS.join("|");
  const namespaced = new RegExp(
    `["'\`](?:order|assignment)\\.(${labels})["'\`]`,
    "g",
  );
  const engineCall = new RegExp(
    `\\b(?:transition|appendEvent)(?:With)?\\(\\s*[^,()]+,\\s*(?:[^,()]+,\\s*)?["'\`](${labels})["'\`]`,
    "g",
  );
  return [
    ...[...text.matchAll(namespaced)].map((match) => match[0]),
    ...[...text.matchAll(engineCall)].map((match) => match[0]),
  ];
}

describe("no arrow label is an event type (AC-19, ruling R8)", () => {
  it("the scan finds a planted label (the scan is not vacuous)", () => {
    expect(
      arrowLabelUses(`await transition(orderId, "order.capture", actor, {})`),
    ).toHaveLength(1);
    expect(arrowLabelUses(`const type = 'order.refund_full';`)).toHaveLength(1);
    expect(
      arrowLabelUses(`transition(orderId, "capture", actor, {})`),
    ).toHaveLength(1);
    expect(
      arrowLabelUses(`appendEventWith(executor, orderId, "pay", actor, {})`),
    ).toHaveLength(1);
    expect(
      arrowLabelUses(`transition(orderId, "order.captured", actor, {})`),
    ).toEqual([]);
  });

  it("finds none under src/", () => {
    const root = resolve(import.meta.dirname, "../../src");
    const found = sourceFiles(root).flatMap((file) =>
      arrowLabelUses(readFileSync(file, "utf8")).map(
        (use) => `${file.slice(root.length + 1)}: ${use}`,
      ),
    );
    expect(found).toEqual([]);
  });
});
