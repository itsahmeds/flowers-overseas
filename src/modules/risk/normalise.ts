/**
 * Normalisers and the keyed identity hash (spec 021 §5.2 "Normalisation and hashing", AC-14's
 * normalisation half, AC-31; TASK-493). Pure: no env read here; the key is passed in by the
 * caller, which reads it through `riskHashKey()` (`@/lib/env`) at use, never at import.
 *
 *  - `normaliseEmail`: trim, NFC, lower case; IDN domain to punycode; a `+tag` removed from the
 *    local part for every domain; dots removed from the local part for `gmail.com` and
 *    `googlemail.com` only, and `googlemail.com` read as `gmail.com`.
 *  - `normaliseAddress`: country upper case; postcode upper case without spaces or hyphens; line 1
 *    NFKD without combining marks, with an explicit fold for letters NFKD does not decompose
 *    (`ł → l`, `ß → ss`, `ø → o`, `đ → d`), case-folded, punctuation removed, whitespace
 *    collapsed. Name, phone and line 2 are not part of it.
 *  - `identityHash(kind, value, key)`: HMAC-SHA-256 under the 32-byte key over `kind + ':' +
 *    value`, as 64 lower-case hex characters (the column type, migration `0043`).
 */
import { createHmac } from "node:crypto";
import { domainToASCII } from "node:url";

/** The kinds of identity a hash is taken of (`risk_identity.kind`). */
export type IdentityKind = "email" | "card" | "recipient_address";

const GMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
]);

/** The punycode form of a domain, lower case; the input lower-cased when it is not a domain. */
export function asciiDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\.$/u, "").toLowerCase();
  const ascii = domainToASCII(trimmed);
  return ascii === "" ? trimmed : ascii;
}

/** The normalised email (the file header), or `null` when it has no `@`. */
export function normaliseEmail(email: string): string | null {
  const value = email.trim().normalize("NFC").toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  let local = value.slice(0, at);
  let domain = asciiDomain(value.slice(at + 1));
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./gu, "");
    domain = "gmail.com";
  }
  if (local === "") return null;
  return `${local}@${domain}`;
}

/** Letters NFKD leaves whole, folded by hand (§5.2). */
const EXTRA_FOLDS: Readonly<Record<string, string>> = {
  ł: "l",
  Ł: "l",
  ß: "ss",
  ẞ: "ss",
  ø: "o",
  Ø: "o",
  đ: "d",
  Đ: "d",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
};

export interface AddressInput {
  readonly countryIso2: string;
  readonly postcode: string | null;
  readonly line1: string;
}

/** The normalised address (the file header) as `CC|POSTCODE|line one`. */
export function normaliseAddress(address: AddressInput): string {
  const country = address.countryIso2.trim().toUpperCase();
  const postcode = (address.postcode ?? "")
    .toUpperCase()
    .replace(/[\s-]+/gu, "");
  const line = address.line1
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[łŁßẞøØđĐæÆœŒ]/gu, (letter) => EXTRA_FOLDS[letter] ?? letter)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return `${country}|${postcode}|${line}`;
}

/** The size `RISK_HASH_KEY` must decode to. */
export const RISK_HASH_KEY_BYTES = 32;

/** HMAC-SHA-256 of `kind:value` under `key`, hex. Throws on a key that is not 32 bytes. */
export function identityHash(
  kind: IdentityKind,
  value: string,
  key: Uint8Array,
): string {
  if (key.length !== RISK_HASH_KEY_BYTES) {
    throw new RangeError("the risk hash key must be 32 bytes");
  }
  return createHmac("sha256", key).update(`${kind}:${value}`).digest("hex");
}

/** The email's hash, or `null` when the email does not normalise. */
export function emailHash(email: string, key: Uint8Array): string | null {
  const normalised = normaliseEmail(email);
  return normalised === null ? null : identityHash("email", normalised, key);
}
