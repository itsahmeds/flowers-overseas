/**
 * The founder alert channel's keys (spec 025 §2 "Env", §5.5 "Channel failure", AC-12, AC-27,
 * AC-35; TASK-488): the Pushover token and user keys and the two healthchecks.io ping URLs.
 *
 * Every key is **optional at server start and read at use**, never at import: an alert must never
 * fail a deployment's healthcheck, and a missing key degrades to "push not configured" or "no
 * heartbeat", which the alert log, the banner and the daily summary say by key **name**. A
 * malformed value is treated as unset and named (never printed), so a typo cannot crash the alert
 * path that would report it.
 */
import { type EnvSource, serverEnvSchema } from "./env.schema";

export const PUSHOVER_APP_TOKEN_KEY = "PUSHOVER_APP_TOKEN" as const;
export const PUSHOVER_USER_KEY_KEY = "PUSHOVER_USER_KEY" as const;
export const PUSHOVER_BACKUP_USER_KEY_KEY = "PUSHOVER_BACKUP_USER_KEY" as const;
export const ALERT_HEARTBEAT_URL_KEY = "ALERT_HEARTBEAT_URL" as const;
export const ALERT_SUMMARY_HEARTBEAT_URL_KEY =
  "ALERT_SUMMARY_HEARTBEAT_URL" as const;

type AlertEnvKey =
  | typeof PUSHOVER_APP_TOKEN_KEY
  | typeof PUSHOVER_USER_KEY_KEY
  | typeof PUSHOVER_BACKUP_USER_KEY_KEY
  | typeof ALERT_HEARTBEAT_URL_KEY
  | typeof ALERT_SUMMARY_HEARTBEAT_URL_KEY;

/** The key's value when it is set and valid, else undefined (a malformed value counts as unset). */
function read(source: EnvSource, key: AlertEnvKey): string | undefined {
  const parsed = serverEnvSchema.shape[key].safeParse(source[key]);
  return parsed.success ? parsed.data : undefined;
}

/** The Pushover configuration, or the names of the missing keys (AC-12: the banner names them). */
export type PushoverConfig =
  | {
      readonly configured: true;
      readonly appToken: string;
      readonly userKey: string;
      readonly backupUserKey: string | undefined;
    }
  | { readonly configured: false; readonly missing: readonly string[] };

export function pushoverConfig(source: EnvSource): PushoverConfig {
  const appToken = read(source, PUSHOVER_APP_TOKEN_KEY);
  const userKey = read(source, PUSHOVER_USER_KEY_KEY);
  if (appToken === undefined || userKey === undefined) {
    return {
      configured: false,
      missing: [
        ...(appToken === undefined ? [PUSHOVER_APP_TOKEN_KEY] : []),
        ...(userKey === undefined ? [PUSHOVER_USER_KEY_KEY] : []),
      ],
    };
  }
  return {
    configured: true,
    appToken,
    userKey,
    backupUserKey: read(source, PUSHOVER_BACKUP_USER_KEY_KEY),
  };
}

/** `ALERT_HEARTBEAT_URL`, or undefined. */
export function alertHeartbeatUrl(source: EnvSource): string | undefined {
  return read(source, ALERT_HEARTBEAT_URL_KEY);
}

/** `ALERT_SUMMARY_HEARTBEAT_URL`, or undefined. */
export function alertSummaryHeartbeatUrl(
  source: EnvSource,
): string | undefined {
  return read(source, ALERT_SUMMARY_HEARTBEAT_URL_KEY);
}

/** Every configured alert secret value, for the scrubbers and the AC-35 scan (never printed). */
export function alertSecretValues(source: EnvSource): readonly string[] {
  return [
    PUSHOVER_APP_TOKEN_KEY,
    PUSHOVER_USER_KEY_KEY,
    PUSHOVER_BACKUP_USER_KEY_KEY,
    ALERT_HEARTBEAT_URL_KEY,
    ALERT_SUMMARY_HEARTBEAT_URL_KEY,
  ]
    .map((key) => read(source, key))
    .filter((value): value is string => value !== undefined);
}
