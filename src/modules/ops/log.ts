/**
 * The alert module's logger: only §8's field allowlist reaches a line (spec 025 §8 "Logs and
 * PII", §11; AC-38; TASK-488).
 *
 * Every line this module writes goes through `opsLog(logger)`, which keeps the allowlisted keys and
 * drops every other one before the shared logger sees it, so a caller cannot widen what an alert
 * line carries by passing an extra field. No token, user key, heartbeat URL, address or text is on
 * the list.
 */
import { type Logger, type LogFields } from "@/lib/logger";

/** §8's allowlist, plus `missing` (key names only, AC-12) and `count` (§11's monitor counts). */
export const OPS_LOG_FIELDS = [
  "request_id",
  "alert_id",
  "alert",
  "severity",
  "fingerprint",
  "order_id",
  "component",
  "channel",
  "kind",
  "priority",
  "outcome",
  "skip_reason",
  "provider_ref",
  "attempt",
  "http_status",
  "job",
  "duration_ms",
  "missing",
  "count",
] as const;

const ALLOWED: ReadonlySet<string> = new Set(OPS_LOG_FIELDS);

/** `fields` without any key outside the allowlist. */
export function allowlisted(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => ALLOWED.has(key)),
  );
}

export interface OpsLog {
  error(fields: LogFields, msg: string): void;
  warn(fields: LogFields, msg: string): void;
  info(fields: LogFields, msg: string): void;
}

export function opsLog(logger: Logger): OpsLog {
  return {
    error: (fields, msg) => logger.error(allowlisted(fields), msg),
    warn: (fields, msg) => logger.warn(allowlisted(fields), msg),
    info: (fields, msg) => logger.info(allowlisted(fields), msg),
  };
}
