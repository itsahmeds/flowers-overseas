/**
 * The analytics context of an order at placement (spec 023 §5.2 "Context capture at placement",
 * AC-19; TASK-491): the consent answer from `fo_consent`, and, **only** when analytics was
 * granted, the GA client id from `_ga` and the session id from `_ga_<id without G->`.
 *
 * Pure: the caller hands in the request's cookie reader and the measurement id. Every malformed
 * value gives "no consent" or a null id, never a throw (the placement must not fail for it).
 *
 *  - `fo_consent`: spec 004's stored shape `{v, a, m, ts, cid}`; a wrong policy version, a
 *    forged or unparsable value means both answers false.
 *  - `_ga`: `GA1.<n>.<random>.<timestamp>` → `<random>.<timestamp>`.
 *  - `_ga_<id>`: `GS1.<n>.<session_id>.…` or `GS2.<n>.s<session_id>$…` → `<session_id>`.
 *
 * A `_ga` left over from before a withdrawal is ignored: the ids are read only under a grant.
 */
import { z } from "zod";

import { CONSENT_COOKIE_NAME } from "@/config/cookies";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";

/** The cookie reader shape Next's `cookies()` and a test map both satisfy. */
export interface CookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/** `GA1.<n>.<random>.<timestamp>` → `<random>.<timestamp>`. */
export const GaClientCookieSchema = z
  .string()
  .regex(/^GA1\.\d{1,3}\.(\d{1,20})\.(\d{1,20})$/u)
  .transform((value) => value.split(".").slice(2).join("."));

/** `GS1.<n>.<session_id>.…` or `GS2.<n>.s<session_id>$…` → `<session_id>`. */
export const GaSessionCookieSchema = z
  .string()
  .max(512)
  .transform((value, ctx) => {
    const gs1 = /^GS1\.\d{1,3}\.(\d{1,20})(?:\.|$)/u.exec(value);
    const gs2 = /^GS2\.\d{1,3}\.s(\d{1,20})(?:\$|$)/u.exec(value);
    const id = gs1?.[1] ?? gs2?.[1];
    if (id === undefined) {
      ctx.addIssue({ code: "custom", message: "not a GA session cookie" });
      return z.NEVER;
    }
    return id;
  });

const StoredConsentSchema = z.object({
  v: z.literal(CONSENT_POLICY_VERSION),
  a: z.boolean(),
  m: z.boolean(),
  ts: z.string().min(1),
  cid: z.uuid(),
});

export const AnalyticsContextSchema = z
  .strictObject({
    analyticsConsent: z.boolean(),
    marketingConsent: z.boolean(),
    consentPolicyVersion: z.string().regex(/^\d{1,6}$/u),
    gaClientId: z.string().nullable(),
    gaSessionId: z.string().nullable(),
  })
  .refine(
    (context) =>
      context.analyticsConsent ||
      (context.gaClientId === null && context.gaSessionId === null),
    { message: "GA ids only with analytics consent" },
  )
  .refine(
    (context) => context.gaSessionId === null || context.gaClientId !== null,
    { message: "a session id needs a client id" },
  );

export type AnalyticsContext = z.infer<typeof AnalyticsContextSchema>;

/** The session cookie's name for a measurement id: `G-ABC123` → `_ga_ABC123`. */
export function gaSessionCookieName(measurementId: string): string {
  return `_ga_${measurementId.replace(/^G-/u, "")}`;
}

function storedConsent(
  raw: string | undefined,
): z.infer<typeof StoredConsentSchema> | null {
  if (raw === undefined || raw === "") return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  const parsed = StoredConsentSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

/** The context of the request whose cookies `jar` reads. Never throws. */
export function readAnalyticsContext(
  jar: CookieReader,
  measurementId: string | undefined,
): AnalyticsContext {
  const consent = storedConsent(jar.get(CONSENT_COOKIE_NAME)?.value);
  const analyticsConsent = consent?.a ?? false;
  let gaClientId: string | null = null;
  let gaSessionId: string | null = null;
  if (analyticsConsent) {
    const client = GaClientCookieSchema.safeParse(jar.get("_ga")?.value);
    gaClientId = client.success ? client.data : null;
    if (gaClientId !== null && measurementId !== undefined) {
      const session = GaSessionCookieSchema.safeParse(
        jar.get(gaSessionCookieName(measurementId))?.value,
      );
      gaSessionId = session.success ? session.data : null;
    }
  }
  return AnalyticsContextSchema.parse({
    analyticsConsent,
    marketingConsent: consent?.m ?? false,
    consentPolicyVersion: String(CONSENT_POLICY_VERSION),
    gaClientId,
    gaSessionId,
  });
}
