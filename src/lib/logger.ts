/**
 * JSON logger with PII redaction (spec 001 §5.2, §8 "Logs / PII", AC-12, TASK-005).
 *
 * ## Why not pino
 * Spec 001 §5 asks for "pino or equivalent". This is the equivalent, and the reason is
 * the edge runtime: edge routes (and, before Next 16's `proxy` moved it to Node, `src/proxy.ts`)
 * have neither pino's Node transports nor `worker_threads`, so pino would mean two logger
 * implementations (node + browser shim) and therefore two copies of the redaction list — the one
 * thing spec 001 §8 says must be mechanical. pino's `redact` also only accepts explicit paths,
 * while §8's `address*` / `card*` require redacting keys we have not seen yet, at any depth.
 * ~120 lines of dependency-free code gives identical output on node and edge, one redaction list,
 * and no bytes in the edge bundle. Note: with `proxy` on Node the repo has no edge runtime code at
 * all today, so this rationale is kept for future edge routes rather than for anything shipping.
 * Revisit if log volume ever needs pino's transports (Phase 1 log drain, plan/08 §7).
 *
 * ## Contract
 * - one JSON object per line on stdout: `{ level, time, msg, ...fields }`
 * - `request_id`, `order_id`, `locale`, `partner_id` are first-class context fields (§5.2)
 * - every key on the redaction list becomes `"[REDACTED]"`, at any depth, in objects and arrays
 *   (spec 001 §8 plus the spec 002 §8 widening: `*name`, `card_message`, `phone_e164`,
 *   `postal_code`, `session_token`, `public_token`, `object_key`)
 * - pretty (indented) output only when the environment is `development`
 * - `no-console` (ESLint) makes this module the only writer of log lines in `src/`
 */
import { z } from "zod";

import { type LogLevel } from "./env.schema";

/** Context carried by every line of a request (spec 001 §5.2). */
export const LogContext = z.object({
  request_id: z.uuid(),
  order_id: z.string().optional(),
  locale: z.string().optional(),
  partner_id: z.string().optional(),
});
export type LogContext = z.infer<typeof LogContext>;

export type LogFields = Readonly<Record<string, unknown>>;

export const REDACTED = "[REDACTED]" as const;

/**
 * PII key list of spec 001 §5.2 / §8, widened by spec 002 §8 (AC-2, TASK-013; the `/review 5`
 * carry-forward). Exact keys, plus the `address*` / `card*` prefixes — `address_line1`,
 * `addressCountry`, `card_number`, `card_message`, `cardLast4` — plus the `*name` **suffix**.
 * Comparison is on the key with `_`, `-` and spaces removed and lower-cased, so snake, camel and
 * kebab all match, at any depth.
 */
export const REDACTED_KEYS: readonly string[] = [
  "email",
  "phone",
  // Spec 002 §8: the recipient's phone is stored in E.164, and `phone_e164` is not caught by the
  // exact `phone` above.
  "phonee164",
  "message",
  "ip",
  // The Sentry field name for the same datum (`user.ip_address`), so a captured event and a log
  // line agree (spec 001 §8).
  "ipaddress",
  "authorization",
  "cookie",
  // Spec 002 §8: a postcode is personal data in combination with a delivery date; the two tokens
  // are bearer credentials (`order.public_token`, the Auth.js session token) and an R2 object key
  // identifies a delivery photo of a named recipient.
  "postalcode",
  "sessiontoken",
  "publictoken",
  "objectkey",
];

export const REDACTED_KEY_PREFIXES: readonly string[] = ["address", "card"];

/**
 * Spec 002 §8 widens `name` to `*name`: `full_name`, `legal_name`, `recipient_name` and
 * `recipientName` are redacted as well as the bare `name`, because the schema of spec 002
 * introduces more name columns than anyone will remember to add to the list above.
 *
 * `*name` is read as a **word** boundary — the key is `name`, or `name` is its last token after a
 * `_`, `-`, space or camel-case break — not as a blind suffix. A blind suffix would also redact
 * `filename`, `hostname` and `pathname`, and the first of those is the Sentry stack-frame field
 * that spec 001 AC-13 deliberately keeps (`tests/unit/sentry-before-send.test.ts`): a stack trace
 * whose frames are `[REDACTED]` diagnoses nothing while protecting no one. Nothing personal is
 * spelled as one lowercase word ending in `name`; every name field in `plan/01` §4 and spec 002
 * §5.1 is `<something>_name`.
 */
export function isNameKey(key: string): boolean {
  if (normaliseKey(key) === "name") return true;
  return /[_\-\s]name$/i.test(key) || /[a-z0-9]Name$/.test(key);
}

function normaliseKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

export function isRedactedKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (REDACTED_KEYS.includes(normalised)) return true;
  if (REDACTED_KEY_PREFIXES.some((prefix) => normalised.startsWith(prefix)))
    return true;
  return isNameKey(key);
}

/** Deep copy of `value` with every PII key replaced by `"[REDACTED]"`. Cycles are cut. */
export function redact(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (value instanceof Error) {
    return { name: value.name, message: REDACTED, stack: value.stack };
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map || value instanceof Set) {
    return redact(Array.from(value as Iterable<unknown>), seen);
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isRedactedKey(key) ? REDACTED : redact(item, seen);
  }
  return out;
}

const LEVELS: Readonly<Record<LogLevel, number>> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

export interface Logger {
  readonly level: LogLevel;
  child(context: LogContext | LogFields): Logger;
  fatal(fields: LogFields, msg?: string): void;
  error(fields: LogFields, msg?: string): void;
  warn(fields: LogFields, msg?: string): void;
  info(fields: LogFields, msg?: string): void;
  debug(fields: LogFields, msg?: string): void;
  trace(fields: LogFields, msg?: string): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly pretty?: boolean;
  readonly bindings?: LogFields;
  /** Sink; defaults to stdout (node) or `globalThis.console` (edge). Injected in tests. */
  readonly write?: (line: string) => void;
  readonly now?: () => string;
}

/** Edge runtimes have no `process.stdout`; `console.log` there (the one allowed use, §2). */
function defaultWrite(line: string): void {
  const stdout = (
    globalThis as { process?: { stdout?: { write?: (s: string) => void } } }
  ).process?.stdout;
  if (typeof stdout?.write === "function") {
    stdout.write(`${line}\n`);
    return;
  }
  console.log(line);
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && value in LEVELS;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  // `process.env.LOG_LEVEL` is read directly rather than through `@/lib/env`: the logger must
  // stay importable from the edge runtime, where `env.server.ts` (`server-only`) is not.
  const rawLevel = options.level ?? process.env.LOG_LEVEL;
  const level: LogLevel = isLogLevel(rawLevel) ? rawLevel : "info";
  const pretty = options.pretty ?? process.env.NODE_ENV === "development";
  const write = options.write ?? defaultWrite;
  const now = options.now ?? ((): string => new Date().toISOString());
  const bindings = options.bindings ?? {};
  const threshold = LEVELS[level];

  function emit(lineLevel: LogLevel, fields: LogFields, msg?: string): void {
    if (LEVELS[lineLevel] < threshold) return;
    // Fields first, then the reserved keys, so a caller cannot shadow `level`/`time`/`msg`.
    const payload: Record<string, unknown> = {
      ...(redact({ ...bindings, ...fields }) as Record<string, unknown>),
      level: lineLevel,
      time: now(),
      ...(msg === undefined ? {} : { msg }),
    };
    write(JSON.stringify(payload, null, pretty ? 2 : undefined));
  }

  const logger: Logger = {
    level,
    child(context) {
      return createLogger({
        ...options,
        level,
        pretty,
        write,
        now,
        bindings: { ...bindings, ...context },
      });
    },
    fatal: (fields, msg) => emit("fatal", fields, msg),
    error: (fields, msg) => emit("error", fields, msg),
    warn: (fields, msg) => emit("warn", fields, msg),
    info: (fields, msg) => emit("info", fields, msg),
    debug: (fields, msg) => emit("debug", fields, msg),
    trace: (fields, msg) => emit("trace", fields, msg),
  };
  return logger;
}

/** Process-wide logger. Per-request lines use `logger.child({ request_id })` (`src/proxy.ts`). */
export const logger: Logger = createLogger();
