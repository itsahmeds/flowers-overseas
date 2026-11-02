/**
 * The florist application alert's env resolver (spec 011 §2 "The founder alert", §12; TASK-213):
 * `floristApplicationsNotifyEmail()`, optional at boot and resolved at use, like
 * `trustpilotAfsAddress()`. Kept out of `env.schema.ts`, which the browser bundle reaches through
 * `env.client.ts`; read through the `@/lib/env` barrel.
 */
import {
  EnvValidationError,
  type EnvSource,
  appEnvironment,
  serverEnvSchema,
} from "./env.schema";

export const FLORIST_APPLICATIONS_NOTIFY_EMAIL_KEY =
  "FLORIST_APPLICATIONS_NOTIFY_EMAIL" as const;

/**
 * The address each stored florist application is emailed to, or `undefined` when unset. A value
 * that is not an address throws naming the key and no value.
 */
export function floristApplicationsNotifyEmail(
  source: EnvSource,
): string | undefined {
  const parsed =
    serverEnvSchema.shape.FLORIST_APPLICATIONS_NOTIFY_EMAIL.safeParse(
      source[FLORIST_APPLICATIONS_NOTIFY_EMAIL_KEY],
    );
  if (parsed.success) return parsed.data;
  let environment: ReturnType<typeof appEnvironment>;
  try {
    environment = appEnvironment(source);
  } catch {
    environment = "development";
  }
  throw new EnvValidationError(
    [
      {
        key: FLORIST_APPLICATIONS_NOTIFY_EMAIL_KEY,
        message: "must be an email address",
      },
    ],
    environment,
  );
}
