/**
 * Spec 021's gate and queue, the pure and source halves (TASK-494): T-07's dispatch rules
 * (AC-7: row 14, other events and `demo` reach the inner handler with no assessment), T-22
 * (AC-22: the three permissions cell by cell, and the action's guards), T-23's source scan
 * (AC-23), T-29's routing half (AC-29: no notification for the two events, `order.risk_released`
 * routes to `routing` only), T-30's cancellation half (AC-30: the reused B5 sentence accuses
 * nobody and names no relay in any locale), plus the decision schema and the queue's signal
 * order.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import { adminRoles } from "../../db/schema/auth.ts";
import { can } from "../../src/modules/admin/permissions.ts";
import { notificationsFor } from "@/modules/notifications";
import {
  type OutboxDeliveryEvent,
  type OutboxHandlerContext,
  type OrderExecutor,
  outboxTargets,
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
} from "@/modules/orders";
import {
  accusationMatches,
  REASONS_BY_DECISION,
  ReviewDecisionSchema,
  riskGatedRouting,
  topSignals,
} from "@/modules/risk";

const ROOT = resolve(import.meta.dirname, "../..");

/** A context whose executor fails the test if the gate touches the database. */
function untouchable(): OutboxHandlerContext {
  const executor = {
    execute: () => {
      throw new Error("the gate read the database");
    },
  } as unknown as OrderExecutor;
  return {
    deliveryId: "00000000-0000-4000-8000-000000000001",
    outboxId: "00000000-0000-4000-8000-000000000002",
    target: "routing",
    attempt: 1,
    executor,
  };
}

function event(overrides: Partial<OutboxDeliveryEvent>): OutboxDeliveryEvent {
  return {
    eventId: "00000000-0000-4000-8000-000000000003",
    orderId: "00000000-0000-4000-8000-000000000004",
    type: "order.captured",
    seq: 2,
    fromStatus: "placed",
    toStatus: "paid_unrouted",
    mode: "test",
    ...overrides,
  };
}

describe("T-07: the gate's dispatch (AC-7)", () => {
  const calls: string[] = [];
  const gated = riskGatedRouting(
    (delivered) => {
      calls.push(`${delivered.type}:${delivered.fromStatus ?? ""}`);
      return Promise.resolve();
    },
    {
      riskFactsFor: () => Promise.reject(new Error("not asked")),
      cancelOrder: () => Promise.reject(new Error("not asked")),
      alert: () => undefined,
      flag: () => Promise.resolve(true),
    },
  );

  it("passes row 14's order.captured to the inner handler with no assessment", async () => {
    calls.length = 0;
    await gated(
      event({ fromStatus: "accepted", toStatus: "paid" }),
      untouchable(),
    );
    expect(calls).toEqual(["order.captured:accepted"]);
  });

  it("never assesses a demo order", async () => {
    calls.length = 0;
    await gated(event({ mode: "demo" }), untouchable());
    expect(calls).toEqual(["order.captured:placed"]);
  });

  it("passes every other event, the release included, unchanged", async () => {
    calls.length = 0;
    for (const type of [
      "order.risk_released",
      "order.delivered",
      "order.cancelled",
    ] as const) {
      await gated(
        event({ type, fromStatus: "paid_unrouted", toStatus: "paid_unrouted" }),
        untouchable(),
      );
    }
    expect(calls).toEqual([
      "order.risk_released:paid_unrouted",
      "order.delivered:paid_unrouted",
      "order.cancelled:paid_unrouted",
    ]);
  });

  it("reads the database for row 2 of a test order (it assesses)", async () => {
    calls.length = 0;
    await expect(gated(event({}), untouchable())).rejects.toThrow(
      "the gate read the database",
    );
    expect(calls).toEqual([]);
  });
});

describe("T-22: the three permissions (AC-22)", () => {
  const MATRIX: Record<string, readonly string[]> = {
    "risk.review": ["admin", "ops"],
    "risk.blocklist": ["admin"],
    "risk.evidence": ["admin"],
  };
  for (const [permission, allowed] of Object.entries(MATRIX)) {
    for (const role of adminRoles) {
      it(`${role} ${allowed.includes(role) ? "holds" : "lacks"} ${permission}`, () => {
        expect(can([role], permission as Parameters<typeof can>[1])).toBe(
          allowed.includes(role),
        );
      });
    }
  }

  const action = readFileSync(
    join(ROOT, "src/app/admin/(signed-in)/risk/actions.ts"),
    "utf8",
  );
  it("guards the action first with risk.review, and a block with risk.blocklist", () => {
    const body = action.slice(
      action.indexOf("export async function decideReviewAction"),
    );
    const statements = body
      .slice(body.indexOf("{") + 1)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
    expect(statements[0]).toBe(
      'const session = await requirePermission("risk.review");',
    );
    expect(body).toMatch(
      /if \(input\.decision === "cancel_block"\) \{\s*await requirePermission\("risk\.blocklist"\);\s*\}\s*const result = await decideReview/u,
    );
  });

  it("both pages need risk.review", () => {
    for (const page of [
      "src/app/admin/(signed-in)/risk/page.tsx",
      "src/app/admin/(signed-in)/risk/[reviewId]/page.tsx",
    ]) {
      expect(readFileSync(join(ROOT, page), "utf8")).toContain(
        'await requireAdminPage("risk.review")',
      );
    }
  });
});

function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/u.test(name)
      ? [{ path, text: readFileSync(path, "utf8") }]
      : [];
  });
}

describe("T-23: no status write in the risk module or its pages (AC-23)", () => {
  const files = [
    ...sources(join(ROOT, "src/modules/risk")),
    ...sources(join(ROOT, "src/app/admin/(signed-in)/risk")),
  ];
  const code = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");

  it("scans the gate, the reviews and both pages", () => {
    const names = files.map((file) => file.path.slice(ROOT.length + 1));
    expect(names).toEqual(
      expect.arrayContaining([
        "src/modules/risk/gate.ts",
        "src/modules/risk/reviews.ts",
        "src/app/admin/(signed-in)/risk/actions.ts",
        "src/app/admin/(signed-in)/risk/page.tsx",
      ]),
    );
  });

  it("finds no transition( call, no UPDATE of an order and no status write", () => {
    for (const file of files) {
      const text = code(file.text);
      expect(text, file.path).not.toMatch(/\btransition\(/u);
      expect(text, file.path).not.toMatch(/UPDATE\s+"?orders?"?\s/iu);
      expect(text, file.path).not.toMatch(/SET\s+status\s*=\s*'(?!open)/u);
      expect(text, file.path).not.toMatch(/allow_status_write/u);
    }
  });

  it("appends only status-preserving events", () => {
    const transitions = new Set<string>(TRANSITION_EVENTS);
    const preserving = new Set<string>(STATUS_PRESERVING_EVENTS);
    let appended = 0;
    for (const file of files) {
      for (const match of code(file.text).matchAll(
        /appendEvent\(\s*[^,]+,\s*"([a-z_.]+)"/gu,
      )) {
        appended += 1;
        expect(transitions.has(match[1] ?? ""), file.path).toBe(false);
        expect(preserving.has(match[1] ?? ""), file.path).toBe(true);
      }
    }
    expect(appended).toBe(2);
  });
});

describe("T-29: the two events reach no buyer and route only to routing (AC-29)", () => {
  it("notificationsFor has no row for order.risk_held or order.risk_released", () => {
    for (const trigger of ["order.risk_held", "order.risk_released"] as const) {
      for (const mode of ["demo", "test", "live"] as const) {
        for (const from of ["paid_unrouted", null]) {
          expect(notificationsFor(trigger, from, mode)).toEqual([]);
        }
      }
    }
  });

  it("order.risk_held has no outbox target; order.risk_released only routing", () => {
    for (const mode of ["test", "live"] as const) {
      expect(outboxTargets("order.risk_held", mode)).toEqual([]);
      expect(
        outboxTargets("order.risk_released", mode).map((target) => target.name),
      ).toEqual(["routing"]);
    }
    expect(outboxTargets("order.risk_released", "demo")).toEqual([]);
  });
});

describe("T-30: a risk cancellation reuses B5's sentence, which accuses nobody (AC-30)", () => {
  const keys = ["notDeliveredRefunding", "notDeliveredRefunded"] as const;
  for (const locale of ["en", "en-gb", "de", "pl"] as const) {
    it(`${locale}: no accusation and no relay wording`, () => {
      const catalogue = JSON.parse(
        readFileSync(join(ROOT, `messages/${locale}.json`), "utf8"),
      ) as Record<string, Record<string, Record<string, string>>>;
      const fallback = JSON.parse(
        readFileSync(join(ROOT, "messages/en.json"), "utf8"),
      ) as typeof catalogue;
      for (const key of keys) {
        const text =
          catalogue["payments"]?.["confirmation"]?.[key] ??
          fallback["payments"]?.["confirmation"]?.[key] ??
          "";
        expect(text, key).not.toBe("");
        expect(accusationMatches(text, locale), key).toEqual([]);
        expect(relayMatches(text, locale), key).toEqual([]);
      }
    });
  }

  it("turns red on an accusation", () => {
    expect(
      accusationMatches("Your order is under security review", "en").length,
    ).toBeGreaterThan(0);
  });
});

describe("the decision schema and the queue's signals", () => {
  it("parses exactly ReviewDecisionSchema's four fields", () => {
    const valid = {
      reviewId: "00000000-0000-4000-8000-000000000005",
      decision: "approve",
      reason: "looks_genuine",
      expectedStatus: "open",
    };
    expect(ReviewDecisionSchema.safeParse(valid).success).toBe(true);
    expect(
      ReviewDecisionSchema.safeParse({ ...valid, expectedStatus: "approved" })
        .success,
    ).toBe(false);
    expect(
      ReviewDecisionSchema.safeParse({ ...valid, reason: "deadline_default" })
        .success,
    ).toBe(false);
    expect(
      ReviewDecisionSchema.safeParse({ ...valid, note: "x" }).success,
    ).toBe(false);
  });

  it("offers the reasons the boards draw per decision", () => {
    expect(REASONS_BY_DECISION.approve).toEqual([
      "looks_genuine",
      "buyer_contacted",
      "other",
    ]);
    expect(REASONS_BY_DECISION.cancel).toEqual(
      REASONS_BY_DECISION.cancel_block,
    );
    expect(REASONS_BY_DECISION.cancel).not.toContain("looks_genuine");
  });

  it("puts holding signals first, then the largest points, three at most", () => {
    expect(
      topSignals([
        { id: "S3", points: 15 },
        { id: "S9", points: 30 },
        { id: "S5", points: 0 },
        { id: "S1", points: 30 },
      ]).map((signal) => signal.id),
    ).toEqual(["S5", "S9", "S1"]);
  });
});
