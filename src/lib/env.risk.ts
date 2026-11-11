/**
 * The risk hash key's resolver (spec 021 §5.2 "Normalisation and hashing", AC-31; TASK-493):
 * `RISK_HASH_KEY`, base64 of exactly 32 bytes, **optional at boot and read at use**, never at
 * import, so a deployment without it boots and builds.
 *
 * In `development` and `test` (never under `NODE_ENV=production`) an unset key falls back to a
 * fixed test key, so the suites work with nothing set. Anywhere else an unset key answers
 * `configured: false` with the key's **name** (never a value); a malformed key is refused by
 * `validateEnv` at boot (the schema's `base64Key32`) and also answers `configured: false` here.
 */
import { type EnvSource, appEnvironment, serverEnvSchema } from "./env.schema";

export const RISK_HASH_KEY_KEY = "RISK_HASH_KEY" as const;

/** The fixed key used in `development` and `test` when `RISK_HASH_KEY` is unset (32 bytes). */
export const TEST_RISK_HASH_KEY =
  "dGVzdC1vbmx5LXJpc2staGFzaC1rZXktMzItYnl0ZXM=";

export type RiskHashKey =
  | { readonly configured: true; readonly key: Buffer }
  | { readonly configured: false; readonly missing: typeof RISK_HASH_KEY_KEY };

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

function decode(value: string): Buffer {
  return Buffer.from(value.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
}

/** The key, resolved at use (the file header). */
export function riskHashKey(source: EnvSource): RiskHashKey {
  const raw = source[RISK_HASH_KEY_KEY];
  const parsed = serverEnvSchema.shape.RISK_HASH_KEY.safeParse(raw);
  if (parsed.success && parsed.data !== undefined) {
    return { configured: true, key: decode(parsed.data) };
  }
  if ((raw ?? "").trim() === "" && fallbackAllowed(source)) {
    return { configured: true, key: decode(TEST_RISK_HASH_KEY) };
  }
  return { configured: false, missing: RISK_HASH_KEY_KEY };
}
