/**
 * JSON logger with PII redaction (spec 001 §5.2, §8 "Logs / PII", AC-12, TASK-005).
 *
 * ## Why not pino
 * Spec 001 §5 asks for "pino or equivalent". This is the equivalent, and the reason is
 * `src/middleware.ts`: middleware runs on the edge runtime, where pino's Node transports and
 * `worker_threads` are unavailable, so pino would mean two logger implementations (node + browser
 * shim) and therefore two copies of the redaction list — the one thing spec 001 §8 says must be
 * mechanical. pino's `redact` also only accepts explicit paths, while §8's `address*` / `card*`
 * require redacting keys we have not seen yet, at any depth. ~120 lines of dependency-free code
 * gives identical output on node and edge, one redaction list, and no bytes in the edge bundle.
 * Revisit if log volume ever needs pino's transports (Phase 1 log drain, plan/08 §7).
 *
 * ## Contract
 * - one JSON object per line on stdout: `{ level, time, msg, ...fields }`
 * - `request_id`, `order_id`, `locale`, `partner_id` are first-class context fields (§5.2)
 * - every key on the redaction list becomes `"[REDACTED]"`, at any depth, in objects and arrays
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
 * PII key list of spec 001 §5.2 / §8. Exact keys plus the `address*` / `card*` prefixes, which
 * cover `address_line1`, `addressCountry`, `card_number`, `cardLast4`, … Comparison is on the
 * key with `_`, `-` and spaces removed and lower-cased, so snake, camel and kebab all match.
 */
export const REDACTED_KEYS: readonly string[] = [
  "email",
  "phone",
  // §8 spells `name` without a wildcard, so it is matched exactly: `partner_name` would be a
  // deliberate addition, not an accident.
  "name",
  "message",
  "ip",
  // The Sentry field name for the same datum (`user.ip_address`), so a captured event and a log
  // line agree (spec 001 §8).
  "ipaddress",
  "authorization",
  "cookie",
];

export const REDACTED_KEY_PREFIXES: readonly string[] = ["address", "card"];

function normaliseKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

export function isRedactedKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (REDACTED_KEYS.includes(normalised)) return true;
  return REDACTED_KEY_PREFIXES.some((prefix) => normalised.startsWith(prefix));
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

/** Process-wide logger. Per-request lines use `logger.child({ request_id })` (middleware). */
export const logger: Logger = createLogger();
