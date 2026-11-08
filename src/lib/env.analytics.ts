/**
 * The GA4 server side's keys (spec 023 §5.2 "Environment", AC-26, AC-27; TASK-491):
 * `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GA4_API_SECRET` and `GA4_MP_VALIDATE`, with the deployment
 * environment that decides `debug_mode` and the `mode_not_live` skip.
 *
 * **Read at use, never at import**, so the credential-free build and a server with no GA4 keys
 * both start: unset or malformed means "not configured", which the handler records as a skip
 * reason (never a throw, never a value in a message).
 */
import {
  type DeploymentEnvironment,
  type EnvSource,
  GA4_API_SECRET_KEY,
  GA4_MP_VALIDATE_KEY,
  appEnvironment,
  ga4MeasurementId,
  serverEnvSchema,
} from "./env.schema";

/** What the Measurement Protocol path needs, or why it cannot send. */
export type Ga4ServerConfig =
  | {
      readonly configured: true;
      readonly measurementId: string;
      readonly apiSecret: string;
      /** Post to `/debug/mp/collect` first (never in production). */
      readonly validate: boolean;
      readonly environment: DeploymentEnvironment;
    }
  | {
      readonly configured: false;
      readonly environment: DeploymentEnvironment;
    };

/** The configuration from `source` (the caller passes `process.env`). Never throws. */
export function ga4ServerConfig(source: EnvSource): Ga4ServerConfig {
  let environment: DeploymentEnvironment;
  try {
    environment = appEnvironment(source);
  } catch {
    // An unparseable `APP_ENV` fails the build and the boot assertion; here it only means "do
    // not send", and the most careful reading of an unknown environment is production.
    return { configured: false, environment: "production" };
  }
  const measurementId = ga4MeasurementId(source);
  const secret = serverEnvSchema.shape[GA4_API_SECRET_KEY].safeParse(
    source[GA4_API_SECRET_KEY],
  );
  if (
    measurementId === undefined ||
    !secret.success ||
    secret.data === undefined
  ) {
    return { configured: false, environment };
  }
  return {
    configured: true,
    measurementId,
    apiSecret: secret.data,
    validate:
      environment !== "production" &&
      source[GA4_MP_VALIDATE_KEY]?.trim() === "true",
    environment,
  };
}
