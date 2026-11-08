/**
 * `normaliseCode`, `emailKey` and `generateCode` (spec 047 §5.2, §7 "Code text is
 * locale-neutral", §2 "Abuse limits"; AC-11; TASK-445).
 *
 * `normaliseCode` maps what a buyer or the founder typed to the stored form: trims, drops spaces
 * and hyphens, upper-cases a to z **by code point** (never `toUpperCase`, which maps `ß` to `SS`
 * and `ﬁ` to `FI`, and never a locale's case mapping, so `pl`, `de` and `/ar-XB` behave alike), and
 * refuses anything that is not then 6 to 32 characters of A to Z and 0 to 9. A dotted capital I,
 * a dotless i, a Polish letter or an emoji returns null, so it never reaches the database.
 *
 * `emailKey` is the per buyer email cap's key: lower case, any `+tag` in the local part removed,
 * then SHA-256 hex. The email itself is never stored for this.
 */
import { createHash, randomInt } from "node:crypto";

import {
  DISCOUNT_CODE_MAX_LENGTH,
  DISCOUNT_CODE_MIN_LENGTH,
  DISCOUNT_GENERATED_ALPHABET,
  DISCOUNT_GENERATED_LENGTH,
} from "@/config/discounts";

const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const CASE_OFFSET = 0x20;
const STORED_SHAPE = new RegExp(
  `^[A-Z0-9]{${String(DISCOUNT_CODE_MIN_LENGTH)},${String(DISCOUNT_CODE_MAX_LENGTH)}}$`,
  "u",
);

/** The stored form of a typed code, or null when it cannot be one. */
export function normaliseCode(raw: string): string | null {
  let out = "";
  for (const character of raw.trim()) {
    if (character === "-" || /^\s$/u.test(character)) continue;
    const point = character.codePointAt(0) ?? 0;
    out +=
      point >= LOWER_A && point <= LOWER_Z
        ? String.fromCodePoint(point - CASE_OFFSET)
        : character;
  }
  return STORED_SHAPE.test(out) ? out : null;
}

/** SHA-256 hex of the folded email: lower case, `+tag` removed from the local part. */
export function emailKey(email: string): string {
  const folded = email.trim().toLowerCase();
  const at = folded.lastIndexOf("@");
  const local = at === -1 ? folded : folded.slice(0, at);
  const domain = at === -1 ? "" : folded.slice(at);
  const plus = local.indexOf("+");
  const base = plus === -1 ? local : local.slice(0, plus);
  return createHash("sha256").update(`${base}${domain}`, "utf8").digest("hex");
}

/** A random code for "Generate": no I, L, O, U, 0 or 1, so it is hard to misread or guess. */
export function generateCode(
  pick: (size: number) => number = (size) => randomInt(size),
): string {
  let out = "";
  for (let index = 0; index < DISCOUNT_GENERATED_LENGTH; index += 1) {
    out += DISCOUNT_GENERATED_ALPHABET.charAt(
      pick(DISCOUNT_GENERATED_ALPHABET.length),
    );
  }
  return out;
}
