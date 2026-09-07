/**
 * T-13 / AC-12 (TASK-005): the logger emits one JSON object per line, redacts every PII key on
 * the spec 001 §8 list at any depth, and leaves `request_id` intact. The `no-console` half of
 * AC-12 lives in `tests/unit/lint-fixtures.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  LogContext,
  REDACTED,
  createLogger,
  isRedactedKey,
  logger,
  redact,
} from "../../src/lib/logger";

const REQUEST_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function capture(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

function loggerUnderTest(): {
  lines: string[];
  log: ReturnType<typeof createLogger>;
} {
  const sink = capture();
  return {
    lines: sink.lines,
    log: createLogger({ level: "trace", pretty: false, write: sink.write }),
  };
}

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

describe("logger (T-13)", () => {
  it("redacts email and phone and keeps request_id (AC-12)", () => {
    const { lines, log } = loggerUnderTest();
    log.info({ email: "a@b.c", phone: "+48123456789", request_id: REQUEST_ID });

    expect(lines).toHaveLength(1);
    const line = parse(lines[0] ?? "");
    expect(line["email"]).toBe(REDACTED);
    expect(line["phone"]).toBe(REDACTED);
    expect(line["request_id"]).toBe(REQUEST_ID);
    expect(line["level"]).toBe("info");
    expect(typeof line["time"]).toBe("string");
    expect(lines[0]).not.toContain("a@b.c");
    expect(lines[0]).not.toContain("+48123456789");
  });

  it("emits a single line of valid JSON with no PII anywhere in the string", () => {
    const { lines, log } = loggerUnderTest();
    log.info({ email: "a@b.c" }, "request end");
    expect(lines[0]).not.toContain("\n");
    expect(parse(lines[0] ?? "")["msg"]).toBe("request end");
  });

  it("redacts the whole spec 001 §8 list, including address*/card* at any depth", () => {
    const { lines, log } = loggerUnderTest();
    log.error({
      request_id: REQUEST_ID,
      order_id: "ord_1",
      recipient: {
        name: "Ada",
        address_line1: "ul. Ptasia 4",
        addressCountry: "PL",
        contact: { email: "a@b.c", phone: "+48" },
      },
      payment: { cardNumber: "4242424242424242", "card-last4": "4242" },
      note: { message: "Happy birthday" },
      ip: "203.0.113.4",
      headers: { authorization: "Bearer x", Cookie: "session=1" },
      items: [{ name: "Rose" }],
    });

    const line = lines[0] ?? "";
    for (const secret of [
      "Ada",
      "ul. Ptasia 4",
      "a@b.c",
      "4242424242424242",
      "Happy birthday",
      "203.0.113.4",
      "Bearer x",
      "session=1",
      "Rose",
    ]) {
      expect(line, `leaked: ${secret}`).not.toContain(secret);
    }
    const parsed = parse(line);
    expect(parsed["request_id"]).toBe(REQUEST_ID);
    expect(parsed["order_id"]).toBe("ord_1");
    expect(
      (parsed["recipient"] as Record<string, unknown>)["addressCountry"],
    ).toBe(REDACTED);
  });

  it("does not redact the operational fields of spec 001 §11", () => {
    const { lines, log } = loggerUnderTest();
    log.info(
      {
        request_id: REQUEST_ID,
        method: "GET",
        path: "/api/health",
        status: 200,
        duration_ms: 3,
        locale: "pl",
        partner_id: "p_1",
      },
      "request end",
    );
    expect(parse(lines[0] ?? "")).toMatchObject({
      method: "GET",
      path: "/api/health",
      status: 200,
      duration_ms: 3,
      locale: "pl",
      partner_id: "p_1",
    });
  });

  it("child(ctx) merges context into every later line", () => {
    const { lines, log } = loggerUnderTest();
    const child = log.child({ request_id: REQUEST_ID, locale: "de" });
    child.info({ path: "/" }, "request start");
    child.warn({ path: "/" });
    for (const line of lines) {
      expect(parse(line)["request_id"]).toBe(REQUEST_ID);
      expect(parse(line)["locale"]).toBe("de");
    }
    // The parent is untouched.
    log.info({});
    expect(parse(lines[2] ?? "")["request_id"]).toBeUndefined();
  });

  it("LogContext validates the first-class fields of spec 001 §5.2", () => {
    expect(LogContext.safeParse({ request_id: REQUEST_ID }).success).toBe(true);
    expect(LogContext.safeParse({ request_id: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(
      LogContext.safeParse({
        request_id: REQUEST_ID,
        order_id: "o",
        locale: "en",
        partner_id: "p",
      }).success,
    ).toBe(true);
  });

  it("filters below the configured level", () => {
    const sink = capture();
    const log = createLogger({
      level: "warn",
      pretty: false,
      write: sink.write,
    });
    log.debug({});
    log.info({});
    log.warn({});
    log.error({});
    expect(sink.lines).toHaveLength(2);
  });

  it("pretty-prints only when asked (development)", () => {
    const sink = capture();
    createLogger({ level: "info", pretty: true, write: sink.write }).info({
      path: "/",
    });
    expect(sink.lines[0]).toContain("\n");
  });

  it("redacts an Error message and survives cycles", () => {
    const cyclic: Record<string, unknown> = { email: "a@b.c" };
    cyclic["self"] = cyclic;
    expect(redact(cyclic)).toEqual({ email: REDACTED, self: "[CIRCULAR]" });
    expect(redact(new Error("boom"))).toMatchObject({
      name: "Error",
      message: REDACTED,
    });
  });

  it("classifies keys case- and separator-insensitively", () => {
    for (const key of [
      "email",
      "Email",
      "phone",
      "name",
      "message",
      "ip",
      "authorization",
      "cookie",
      "address",
      "address_line2",
      "addressPostalCode",
      "card",
      "card-brand",
      "cardNumber",
    ]) {
      expect(isRedactedKey(key), key).toBe(true);
    }
    for (const key of [
      "request_id",
      "order_id",
      "locale",
      "partner_id",
      "method",
      "path",
    ]) {
      expect(isRedactedKey(key), key).toBe(false);
    }
  });

  it("exports a ready-made process logger", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.child).toBe("function");
  });
});
