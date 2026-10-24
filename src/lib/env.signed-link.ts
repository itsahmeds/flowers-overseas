/**
 * The signed-link secret's resolver (spec 018 §5.2 `src/lib/signed-link.ts`, §12 founder action 1;
 * TASK-337): optional at boot and required at use, exactly as `authSecret()` is. Kept out of
 * `env.schema.ts`, which the browser bundle reaches through `env.client.ts`; read through the
 * `@/lib/env` barrel.
 */
import { developmentFallbackAllowed, resolve } from "./env.auth";
import {
  DEVELOPMENT_SIGNED_LINK_SECRET,
  EnvValidationError,
  type EnvSource,
  SIGNED_LINK_SECRET_KEY,
  serverEnvSchema,
} from "./env.schema";

/**
 * The key buyer links are signed with: the configured value, or the development secret where the
 * environment is positively development or test; anything else throws naming
 * `SIGNED_LINK_SECRET` and no value. A deployed server never signs with the committed key.
 */
export function signedLinkSecret(source: EnvSource): string {
  const { environment } = resolve(source);
  const parsed = serverEnvSchema.shape.SIGNED_LINK_SECRET.safeParse(
    source[SIGNED_LINK_SECRET_KEY],
  );
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => ({
        key: SIGNED_LINK_SECRET_KEY,
        message: issue.message,
      })),
      environment,
    );
  }
  const allowed = developmentFallbackAllowed(source);
  if (
    parsed.data !== undefined &&
    (allowed || parsed.data !== DEVELOPMENT_SIGNED_LINK_SECRET)
  ) {
    return parsed.data;
  }
  if (parsed.data === undefined && allowed) {
    return DEVELOPMENT_SIGNED_LINK_SECRET;
  }
  throw new EnvValidationError(
    [
      {
        key: SIGNED_LINK_SECRET_KEY,
        message:
          "must be set to a real secret before a buyer link is signed outside development and test (`openssl rand -hex 32`; spec 018 §12)",
      },
    ],
    environment,
  );
}
