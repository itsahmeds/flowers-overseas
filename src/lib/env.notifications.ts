/**
 * The notification pipeline's one key (spec 016 §5.2 A1 and W, §12 "Env contract"; TASK-331):
 * `opsAlertEmail()`, the founder's address for the no-partner alert and the WhatsApp-ready
 * copies. Required at use, never at boot, for `AUTH_SECRET`'s reason: a boot requirement would
 * fail every deployment's healthcheck before the founder has set it (§12 founder action).
 */
import {
  DEVELOPMENT_OPS_ALERT_EMAIL,
  EnvValidationError,
  type EnvSource,
  OPS_ALERT_EMAIL_KEY,
  appEnvironment,
  serverEnvSchema,
} from "./env.schema";

/**
 * `OPS_ALERT_EMAIL`; in `development` and `test` (and never under `NODE_ENV=production`) the
 * `.invalid` placeholder when unset. Anywhere else an unset or malformed value throws naming the
 * key and never a value.
 */
export function opsAlertEmail(source: EnvSource): string {
  let environment: ReturnType<typeof appEnvironment> = "development";
  let unparseable = false;
  try {
    environment = appEnvironment(source);
  } catch {
    unparseable = true;
  }
  const parsed = serverEnvSchema.shape.OPS_ALERT_EMAIL.safeParse(
    source[OPS_ALERT_EMAIL_KEY],
  );
  if (!parsed.success) {
    throw new EnvValidationError(
      [{ key: OPS_ALERT_EMAIL_KEY, message: "must be an email address" }],
      environment,
    );
  }
  if (parsed.data !== undefined) return parsed.data;
  if (
    !unparseable &&
    (environment === "development" || environment === "test") &&
    source["NODE_ENV"] !== "production"
  ) {
    return DEVELOPMENT_OPS_ALERT_EMAIL;
  }
  throw new EnvValidationError(
    [
      {
        key: OPS_ALERT_EMAIL_KEY,
        message: `is required in ${environment} to send ops messages`,
      },
    ],
    environment,
  );
}
