/**
 * The basket reminder's two keys (spec 034 §5.2 "Env", AC-28; TASK-449): `CONTACT_HMAC_SECRET`,
 * the key of `contactHmac`, and `MARKETING_MAIL_FROM`, the reminder's sender.
 *
 * Both are **optional at boot and read at use**, never at import, so a deployment without them
 * boots and builds. In `development` and `test` (never under `NODE_ENV=production`) an unset key
 * falls back to a fixed test value, so the suites and the capturing mailer work with nothing set.
 * Anywhere else an unset or malformed key makes `basketReminderEnv` answer `configured: false`
 * with the key **names** (never a value): the box is not rendered and the scan refuses.
 */
import { type EnvSource, appEnvironment, serverEnvSchema } from "./env.schema";

export const CONTACT_HMAC_SECRET_KEY = "CONTACT_HMAC_SECRET" as const;
export const MARKETING_MAIL_FROM_KEY = "MARKETING_MAIL_FROM" as const;

/** The fixed key used in `development` and `test` when `CONTACT_HMAC_SECRET` is unset. */
export const TEST_CONTACT_HMAC_SECRET =
  "dGVzdC1vbmx5LWNvbnRhY3QtaG1hYy1zZWNyZXQtMzItYnl0ZXMhIQ==";
/** The sender used in `development` and `test` when `MARKETING_MAIL_FROM` is unset. */
export const TEST_MARKETING_MAIL_FROM =
  "Basket reminders <basket@localhost.invalid>";

export type BasketReminderEnv =
  | {
      readonly configured: true;
      /** The decoded HMAC key bytes. */
      readonly hmacSecret: Buffer;
      readonly marketingFrom: string;
    }
  | { readonly configured: false; readonly missing: readonly string[] };

function fallbackAllowed(source: EnvSource): boolean {
  try {
    const environment = appEnvironment(source);
    return (
      (environment === "development" || environment === "test") &&
      source["NODE_ENV"] !== "production"
    );
  } catch {
    return false;
  }
}

function read(
  source: EnvSource,
  key: typeof CONTACT_HMAC_SECRET_KEY | typeof MARKETING_MAIL_FROM_KEY,
): string | undefined {
  const parsed = serverEnvSchema.shape[key].safeParse(source[key]);
  return parsed.success ? parsed.data : undefined;
}

/** Decodes standard or url-safe base64. */
function decodeSecret(value: string): Buffer {
  return Buffer.from(value.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
}

/** Both keys, resolved at use (AC-28). */
export function basketReminderEnv(source: EnvSource): BasketReminderEnv {
  const fallback = fallbackAllowed(source);
  const secret =
    read(source, CONTACT_HMAC_SECRET_KEY) ??
    (fallback && (source[CONTACT_HMAC_SECRET_KEY] ?? "").trim() === ""
      ? TEST_CONTACT_HMAC_SECRET
      : undefined);
  const from =
    read(source, MARKETING_MAIL_FROM_KEY) ??
    (fallback && (source[MARKETING_MAIL_FROM_KEY] ?? "").trim() === ""
      ? TEST_MARKETING_MAIL_FROM
      : undefined);
  if (secret === undefined || from === undefined) {
    return {
      configured: false,
      missing: [
        ...(secret === undefined ? [CONTACT_HMAC_SECRET_KEY] : []),
        ...(from === undefined ? [MARKETING_MAIL_FROM_KEY] : []),
      ],
    };
  }
  return {
    configured: true,
    hmacSecret: decodeSecret(secret),
    marketingFrom: from,
  };
}

/** The configured secret's value, for the log scrubbers (never printed). */
export function basketReminderSecretValues(
  source: EnvSource,
): readonly string[] {
  const value = read(source, CONTACT_HMAC_SECRET_KEY);
  return value === undefined ? [] : [value];
}
