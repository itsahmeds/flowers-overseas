/**
 * The sign-in core's env resolvers (spec 012 §2.2; TASK-217): `authSecret()` and `mailerConfig()`,
 * optional at boot and required at use. Kept out of `env.schema.ts`, which the browser bundle
 * reaches through `env.client.ts`, so no public page carries a byte of them; read through the
 * `@/lib/env` barrel.
 */
import {
  AUTH_SECRET_KEY,
  DEVELOPMENT_AUTH_SECRET,
  type DeploymentEnvironment,
  EnvValidationError,
  type EnvSource,
  MAILER_KEY,
  type MailerKind,
  appEnvironment,
  serverEnvSchema,
} from "./env.schema";

/** The sender the capturing mailer stamps when `EMAIL_FROM` is unset; it never leaves the process. */
export const DEVELOPMENT_EMAIL_FROM = "sign-in@localhost.invalid";

/** The environment, and whether `APP_ENV` was present but did not parse. */
export function resolve(source: EnvSource): {
  environment: DeploymentEnvironment;
  unparseable: boolean;
} {
  try {
    return { environment: appEnvironment(source), unparseable: false };
  } catch {
    return { environment: "development", unparseable: true };
  }
}

/** Whether the environment is positively a laptop or a test run (`quoteSigningSecret()`'s rule). */
export function developmentFallbackAllowed(source: EnvSource): boolean {
  const { environment, unparseable } = resolve(source);
  return (
    (environment === "development" || environment === "test") &&
    source["NODE_ENV"] !== "production" &&
    !unparseable
  );
}

/**
 * The sign-in core's secret (spec 012 §2.2; TASK-217): the configured value, or the development
 * secret where the environment is positively development or test; anything else throws naming
 * `AUTH_SECRET` and no value.
 */
export function authSecret(source: EnvSource): string {
  const { environment } = resolve(source);
  const parsed = serverEnvSchema.shape.AUTH_SECRET.safeParse(
    source[AUTH_SECRET_KEY],
  );
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => ({
        key: AUTH_SECRET_KEY,
        message: issue.message,
      })),
      environment,
    );
  }
  const allowed = developmentFallbackAllowed(source);
  if (
    parsed.data !== undefined &&
    (allowed || parsed.data !== DEVELOPMENT_AUTH_SECRET)
  ) {
    return parsed.data;
  }
  if (parsed.data === undefined && allowed) return DEVELOPMENT_AUTH_SECRET;
  throw new EnvValidationError(
    [
      {
        key: AUTH_SECRET_KEY,
        message:
          "must be set to a real secret before anyone signs in outside development and test (`openssl rand -hex 32`; spec 012 §2.2)",
      },
    ],
    environment,
  );
}

/** What `mailerConfig()` resolves: which mailer, and what it needs. */
export type MailerConfig =
  | { readonly kind: "resend"; readonly apiKey: string; readonly from: string }
  | { readonly kind: "capture"; readonly from: string };

/**
 * The mailer this environment uses (spec 012 §2.2; TASK-217): `MAILER` when set, else `resend`
 * in `staging` and `production` and `capture` elsewhere. `capture` is refused in `staging` and
 * `production`; `resend` without `RESEND_API_KEY` and `EMAIL_FROM` throws naming the missing
 * keys and no value.
 */
export function mailerConfig(source: EnvSource): MailerConfig {
  const { environment } = resolve(source);
  const productionLike =
    environment === "staging" || environment === "production";
  const parsed = serverEnvSchema.shape.MAILER.safeParse(source[MAILER_KEY]);
  if (!parsed.success) {
    throw new EnvValidationError(
      [{ key: MAILER_KEY, message: "must be `resend` or `capture`" }],
      environment,
    );
  }
  const kind: MailerKind =
    parsed.data ?? (productionLike ? "resend" : "capture");
  const from = serverEnvSchema.shape.EMAIL_FROM.parse(source["EMAIL_FROM"]);
  if (kind === "capture") {
    if (productionLike) {
      throw new EnvValidationError(
        [
          {
            key: MAILER_KEY,
            message: `must not be \`capture\` in ${environment} (spec 012 §2.2)`,
          },
        ],
        environment,
      );
    }
    return { kind, from: from ?? DEVELOPMENT_EMAIL_FROM };
  }
  const apiKey = serverEnvSchema.shape.RESEND_API_KEY.parse(
    source["RESEND_API_KEY"],
  );
  const missing = [
    ...(apiKey === undefined ? ["RESEND_API_KEY"] : []),
    ...(from === undefined ? ["EMAIL_FROM"] : []),
  ];
  if (apiKey === undefined || from === undefined) {
    throw new EnvValidationError(
      missing.map((key) => ({
        key,
        message:
          "must be set before sign-in mail is sent through Resend (spec 012 §2.2, §12 founder action 3)",
      })),
      environment,
    );
  }
  return { kind, apiKey, from };
}
