/**
 * The non-production access gate (spec 040 §5.3, §5.6, AC-25; TASK-098).
 *
 * Railway has no equivalent of Vercel Deployment Protection, so `staging` and every PR
 * environment are closed with HTTP Basic authentication applied in `src/proxy.ts` before any
 * route renders. The decision itself lives here — free of `next/server`, `server-only` and
 * `process.env` — so every row of AC-25 is a unit test on a pure function and the proxy stays
 * thin (plan/01 §5).
 *
 * The four rules, in order:
 *
 *  1. **`production` is never gated.** AC-25: the public site has no auth wall and no Cloudflare
 *     Access policy. The environment comes from `appEnvironment()` (spec 040 §5.2), so the gate
 *     has no second opinion about which environment it is in.
 *  2. **Absent means off** (§12 "Feature flags"): with no `STAGING_BASIC_AUTH` variable the gate
 *     allows everything, which is what a laptop and CI want. `STAGING_BASIC_AUTH` is therefore
 *     *not* part of the 28-key environment contract (`ENV_KEYS`); it is an environment-scoped
 *     switch declared in `config/railway.json` and checked by `pnpm railway:check --env`.
 *  3. **`/api/health` is exempt in every environment** — the Railway healthcheck, the CI preview
 *     probe and the uptime monitor all call it unauthenticated (AC-31, §11).
 *  4. Anything else needs the credential; without it the answer is 401 with `WWW-Authenticate`,
 *     which is what makes a browser show its own prompt (so no user-facing string is invented
 *     here, and nothing is rendered).
 *
 * A present-but-malformed value fails **closed**: it can match no request, so every non-exempt
 * path is challenged rather than served. No credential, no header value and no decoded user name
 * is ever logged or returned (spec 001 §8: no PII in logs).
 */
import { z } from "zod";

/** The variable that switches the gate on. Absent or blank ⇒ no gate (§12). */
export const STAGING_BASIC_AUTH_KEY = "STAGING_BASIC_AUTH";

/** Paths served without a credential in every environment (AC-25, AC-31). */
export const AUTH_EXEMPT_PATHS: readonly string[] = ["/api/health"];

/**
 * The challenge header. `realm` is a protocol token shown by the browser's own dialog, not a
 * translated interface string, so it is not a message-catalogue entry (spec 003 §2).
 */
export const WWW_AUTHENTICATE_HEADER = "www-authenticate";
export const BASIC_AUTH_CHALLENGE =
  'Basic realm="Flowers Overseas", charset="UTF-8"';

/** `user:password`: no whitespace, no colon in the user half, both halves non-empty. */
const credentialSchema = z
  .string()
  .regex(/^[^\s:]+:[^\s]+$/u, "must be user:password with no whitespace");

/** The configured credential, or why there is none. Values never leave this module. */
export type CredentialState =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "configured"; readonly value: string };

/** Read `STAGING_BASIC_AUTH` into a decision-ready state. Blank counts as absent. */
export function parseCredential(raw: string | undefined): CredentialState {
  if (raw === undefined || raw.trim() === "") return { kind: "absent" };
  const parsed = credentialSchema.safeParse(raw.trim());
  return parsed.success
    ? { kind: "configured", value: parsed.data }
    : { kind: "invalid" };
}

/** Exempt paths, ignoring a trailing slash and any query string the caller already stripped. */
export function isAuthExempt(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return AUTH_EXEMPT_PATHS.includes(path);
}

/** Length-independent, content-constant comparison: no early return on the first wrong byte. */
function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** Decode `Authorization: Basic <base64>` to `user:password`, or `undefined`. */
function decodeAuthorization(header: string | null): string | undefined {
  if (header === null) return undefined;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/u.exec(header.trim());
  const encoded = match?.[1];
  if (encoded === undefined) return undefined;
  try {
    return atob(encoded);
  } catch {
    return undefined;
  }
}

export interface BasicAuthInput {
  /** From `appEnvironment()` — the one environment signal (spec 040 §5.2). */
  readonly environment: string;
  /** Raw `STAGING_BASIC_AUTH` value, or `undefined`. */
  readonly credential: string | undefined;
  /** Request path, without query string. */
  readonly pathname: string;
  /** The request's `Authorization` header, or `null`. */
  readonly authorization: string | null;
}

/** `allow` ⇒ continue to the app; `challenge` ⇒ 401 with `WWW-Authenticate`. */
export type BasicAuthDecision = "allow" | "challenge";

export function basicAuthDecision(input: BasicAuthInput): BasicAuthDecision {
  if (input.environment === "production") return "allow";
  const credential = parseCredential(input.credential);
  if (credential.kind === "absent") return "allow";
  if (isAuthExempt(input.pathname)) return "allow";
  if (credential.kind === "invalid") return "challenge";
  const supplied = decodeAuthorization(input.authorization);
  if (supplied === undefined) return "challenge";
  return constantTimeEquals(supplied, credential.value) ? "allow" : "challenge";
}

/** Headers of the 401: the challenge, and never a cached copy of it. */
export const BASIC_AUTH_CHALLENGE_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    [WWW_AUTHENTICATE_HEADER]: BASIC_AUTH_CHALLENGE,
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  });
