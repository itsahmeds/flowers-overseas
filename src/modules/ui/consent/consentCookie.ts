/**
 * The `fo_consent` value, read and written without zod (spec 004 §2 "Consent", §5.3, §8, AC-19;
 * TASK-051).
 *
 * Pure string functions and nothing else: no `document`, no `window`, no import. Two reasons that
 * is not fussiness.
 *
 *  - **zod may not reach the browser.** `src/lib/consent.ts` owns `ConsentDecisionSchema` and
 *    `src/config/cookies.ts` owns the register, and both parse at module load — importing either
 *    from the island would put zod back into a public route's client bundle, which
 *    `pnpm budget:client-js` fails on (spec 004 AC-25, TASK-046). So the cookie shape is
 *    hand-parsed here, the register travels to the island as props, and the schema stays the
 *    server's contract for `POST /api/consent`.
 *  - **The reader must not throw.** Spec 003 `/review 23` found a live instance of the opposite:
 *    a cookie reader that decoded its value threw `URIError` on `fo_locale=%` for the cookie's
 *    whole year, and a throw inside a Client Component's first render replaces the document with
 *    the error page. `parseConsentCookie` therefore answers `null` for every unparsable,
 *    truncated, forged or stale value — the island treats `null` as "no consent given" and shows
 *    the banner (AC-19's "a forged or unparsable `fo_consent` is treated as no consent").
 *
 * The stored shape is the five short fields of the TASK-051 row — `{v, a, m, ts, cid}` — and not
 * the `POST` body's field names, because a cookie is sent on every request to the origin and the
 * bytes are worth the abbreviation. It carries no identifier beyond its own random `cid` (§8).
 */

/** The decision as it is stored: policy version, analytics, marketing, timestamp, record id. */
export interface StoredConsent {
  /** The `CONSENT_POLICY_VERSION` the visitor answered. */
  readonly v: number;
  readonly a: boolean;
  readonly m: boolean;
  /** ISO-8601 instant of the decision. */
  readonly ts: string;
  /** The unlinkable random id of the consent record (`crypto.randomUUID()`). */
  readonly cid: string;
}

/** What the two non-essential categories were answered with. */
export interface ConsentChoices {
  readonly analytics: boolean;
  readonly marketing: boolean;
}

/** A UUID as `crypto.randomUUID()` prints one; the server's `z.uuid()` refuses anything else. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The raw value of `name` from a `document.cookie` string, or `null`. The value is returned
 * **undecoded**; `parseConsentCookie` decodes it inside its own `try`.
 */
export function rawCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (cookieHeader === null) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * The stored decision, or `null` when there is none we can honour. `null` covers all of: no
 * cookie, an empty value, a malformed percent-escape, invalid JSON, a JSON value of the wrong
 * shape, a `cid` that is not a UUID, and a decision that answered an **older policy version**
 * than `policyVersion` — a stale answer to a question we have since changed is not consent, so
 * the banner asks again (the reason `CONSENT_POLICY_VERSION` exists).
 */
export function parseConsentCookie(
  cookieHeader: string | null,
  options: { readonly name: string; readonly policyVersion: number },
): StoredConsent | null {
  const raw = rawCookieValue(cookieHeader, options.name);
  if (raw === null || raw === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    // A forged, truncated or half-encoded value. Not an error: an answer we do not have.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const value = parsed as Record<string, unknown>;
  if (
    typeof value.v !== "number" ||
    !Number.isInteger(value.v) ||
    typeof value.a !== "boolean" ||
    typeof value.m !== "boolean" ||
    typeof value.ts !== "string" ||
    value.ts === "" ||
    typeof value.cid !== "string" ||
    !UUID_PATTERN.test(value.cid)
  ) {
    return null;
  }
  if (value.v !== options.policyVersion) return null;

  return { v: value.v, a: value.a, m: value.m, ts: value.ts, cid: value.cid };
}

/**
 * The `document.cookie` assignment for a decision, per the TASK-051 row exactly: first-party,
 * `Path=/`, `SameSite=Lax`, `Secure` outside development, **not** `HttpOnly` (the island owns the
 * value and must be able to read it back), and the register's asymmetric lifetime — 12 months for
 * an acceptance, 6 for a refusal (§8, `plan/07` §5). Both numbers arrive as arguments from
 * `src/config/cookies.ts` rather than being restated, so the register stays the single source.
 *
 * `secure` is a parameter, not a read of `location.protocol`, for the reason
 * `serialiseLocaleCookie` gives: it keeps the function pure and the attribute set a unit test.
 */
export function serialiseConsentCookie(
  value: StoredConsent,
  options: {
    readonly name: string;
    readonly maxAgeSeconds: number;
    readonly secure: boolean;
  },
): string {
  const attributes = [
    `${options.name}=${encodeURIComponent(JSON.stringify(value))}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    "SameSite=Lax",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * The assignment that **removes** a value. Used for exactly one case: a stored value that
 * `parseConsentCookie` refused (forged, corrupt or answering a retired policy version). Leaving
 * it in place would mean a browser walking around with a consent record we do not honour and
 * cannot read, so it is deleted and the banner asks again — which is the "and rewritten" half of
 * AC-19. Deleting storage is not a decision: no new value is stored, nothing is sent, and the
 * visitor's next explicit action is what writes a cookie (§8's "only on an explicit user
 * action" is about *recording a choice*, and there is no choice here to record).
 */
export function clearConsentCookie(options: {
  readonly name: string;
  readonly secure: boolean;
}): string {
  const attributes = [
    `${options.name}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

/** The choices a stored decision records. */
export function choicesOf(stored: StoredConsent): ConsentChoices {
  return { analytics: stored.a, marketing: stored.m };
}
