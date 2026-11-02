/**
 * The review env resolvers (spec 022a §5.2, AC-10, AC-33; TASK-368): `reviewTokenSecret()` and
 * `trustpilotAfsAddress()`, optional at boot and resolved at use, like `authSecret()` (spec 012).
 * Kept out of `env.schema.ts`, which the browser bundle reaches through `env.client.ts`, so no
 * public page carries a byte of them; read through the `@/lib/env` barrel.
 */
import {
  DEVELOPMENT_REVIEW_TOKEN_SECRET,
  type DeploymentEnvironment,
  EnvValidationError,
  type EnvSource,
  REVIEW_TOKEN_SECRET_KEY,
  appEnvironment,
  serverEnvSchema,
} from "./env.schema";

/** The environment, and whether `APP_ENV` was present but did not parse. */
function resolve(source: EnvSource): {
  environment: DeploymentEnvironment;
  unparseable: boolean;
} {
  try {
    return { environment: appEnvironment(source), unparseable: false };
  } catch {
    return { environment: "development", unparseable: true };
  }
}

/** Whether the environment is positively a laptop or a test run (`authSecret()`'s rule). */
function developmentFallbackAllowed(source: EnvSource): boolean {
  const { environment, unparseable } = resolve(source);
  return (
    (environment === "development" || environment === "test") &&
    source["NODE_ENV"] !== "production" &&
    !unparseable
  );
}

/**
 * The review link's HMAC key: the configured value, or the development key where the environment
 * is positively development or test; anything else (absent, too short, or the development key in
 * a deployed environment) throws naming `REVIEW_TOKEN_SECRET` and no value.
 */
export function reviewTokenSecret(source: EnvSource): string {
  const { environment } = resolve(source);
  const parsed = serverEnvSchema.shape.REVIEW_TOKEN_SECRET.safeParse(
    source[REVIEW_TOKEN_SECRET_KEY],
  );
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => ({
        key: REVIEW_TOKEN_SECRET_KEY,
        message: issue.message,
      })),
      environment,
    );
  }
  const allowed = developmentFallbackAllowed(source);
  if (
    parsed.data !== undefined &&
    (allowed || parsed.data !== DEVELOPMENT_REVIEW_TOKEN_SECRET)
  ) {
    return parsed.data;
  }
  if (parsed.data === undefined && allowed) {
    return DEVELOPMENT_REVIEW_TOKEN_SECRET;
  }
  throw new EnvValidationError(
    [
      {
        key: REVIEW_TOKEN_SECRET_KEY,
        message:
          "must be set to a real key before any review link is made outside development and test (`openssl rand -hex 32`; spec 022a §5.2)",
      },
    ],
    environment,
  );
}

/** Trustpilot's AFS address, or `undefined` when unset (then no B9 carries a BCC; AC-10). */
export function trustpilotAfsAddress(source: EnvSource): string | undefined {
  const parsed = serverEnvSchema.shape.TRUSTPILOT_AFS_ADDRESS.safeParse(
    source["TRUSTPILOT_AFS_ADDRESS"],
  );
  if (!parsed.success) {
    throw new EnvValidationError(
      [
        {
          key: "TRUSTPILOT_AFS_ADDRESS",
          message: "must be an email address",
        },
      ],
      resolve(source).environment,
    );
  }
  return parsed.data;
}
