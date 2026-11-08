/**
 * The dead man's switch (spec 025 §2 "Channels", §5.2 "Heartbeat"; AC-27, AC-28; TASK-489).
 *
 * After a tick that reached the database, the tick route asks `tickHeartbeat`: when
 * `alerts.monitor` completed within the last 5 minutes, one `GET` goes to `ALERT_HEARTBEAT_URL`
 * (5 s timeout, never throws). A failed tick never gets here, and a stale monitor sends nothing,
 * so healthchecks.io sees the silence and pages through its own Pushover integration: the one
 * path that works when our whole stack is down. Unset, nothing is sent and one `info` line per
 * process says so. The URL is never logged.
 */
import {
  HEARTBEAT_MONITOR_FRESH_MINUTES,
  HEARTBEAT_TIMEOUT_MS,
} from "@/config/alerts";
import { alertHeartbeatUrl } from "@/lib/env.alerts";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

import { opsLog } from "./log.ts";

/** One parameterised statement on pg-boss's connection (`QueueDb` in `src/jobs/runtime.ts`). */
export interface QueueReader {
  executeSql(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

let notedUnset = false;

/** Resets the once-per-process line (tests). */
export function resetHeartbeatNotes(): void {
  notedUnset = false;
}

/** One GET to `url`; true on a 2xx. Never throws, never logs the URL. */
export async function heartbeat(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The last completion of `alerts.monitor`, read from pg-boss's own table. */
export async function lastMonitorCompletion(
  queue: QueueReader,
): Promise<Date | null> {
  const result = await queue.executeSql(
    "SELECT max(completed_on) AS at FROM pgboss.job WHERE name = 'alerts.monitor' AND state = 'completed'",
  );
  const at = result.rows[0]?.["at"];
  return at instanceof Date ? at : typeof at === "string" ? new Date(at) : null;
}

export interface TickHeartbeatDeps {
  readonly url?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly log?: Logger;
}

/** The tick's heartbeat (AC-27): `sent`, `stale`, `unset` or `failed`. */
export async function tickHeartbeat(
  queue: QueueReader,
  deps: TickHeartbeatDeps = {},
): Promise<"sent" | "stale" | "unset" | "failed"> {
  const log = opsLog(deps.log ?? defaultLogger);
  const url = "url" in deps ? deps.url : alertHeartbeatUrl(process.env);
  if (url === undefined) {
    if (!notedUnset) {
      notedUnset = true;
      log.info(
        { outcome: "unset", missing: ["ALERT_HEARTBEAT_URL"] },
        "alerts.heartbeat",
      );
    }
    return "unset";
  }
  const now = (deps.now ?? (() => new Date()))();
  const last = await lastMonitorCompletion(queue);
  if (
    last === null ||
    now.getTime() - last.getTime() > HEARTBEAT_MONITOR_FRESH_MINUTES * 60_000
  ) {
    log.warn({ job: "alerts.monitor", outcome: "stale" }, "alerts.heartbeat");
    return "stale";
  }
  const ok = await heartbeat(url, deps.fetch);
  if (!ok) log.warn({ outcome: "failed" }, "alerts.heartbeat");
  return ok ? "sent" : "failed";
}
