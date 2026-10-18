/**
 * The shared fixture for A2.1's `orderReference` and A2.2's SQL `order_reference(uuid)` (spec 010
 * §14 A2.5, AC-45, T-45; TASK-245).
 *
 * `PINNED_REFERENCES` was computed outside both implementations (Python, from the definition:
 * Crockford base32 of the id's first 40 bits), so the unit suite holds the TypeScript side to it
 * and the integration suite holds the SQL side to the same ten pairs. The first five are the
 * edges: all zero, all ones in the first 40 bits (and in every bit), one in the lowest five bits
 * of the 40, one in the second group of five.
 */
import { randomUUID } from "node:crypto";

export const PINNED_REFERENCES: readonly (readonly [string, string])[] = [
  ["00000000-0000-4000-8000-000000000000", "FO-0000-0000"],
  ["ffffffff-ff00-4000-8000-000000000000", "FO-ZZZZ-ZZZZ"],
  ["ffffffff-ffff-4fff-bfff-ffffffffffff", "FO-ZZZZ-ZZZZ"],
  ["00000000-0100-4000-8000-000000000000", "FO-0000-0001"],
  ["00000000-2000-4000-8000-000000000000", "FO-0000-0010"],
  ["11eb4678-7889-4121-898d-83332035bce5", "FO-27NM-CY3R"],
  ["bd4ac539-cf4b-4ab9-9468-e2597394bdee", "FO-QN5C-AEEF"],
  ["76ab5fee-a2b8-470b-99f2-89c5fa9e8ffe", "FO-ETNN-ZVN2"],
  ["36fae29a-ba76-498a-8bf5-5edefef63863", "FO-6VXE-56NT"],
  ["25cf05e8-fc36-4ac4-8107-40c0d357ce5f", "FO-4Q7G-BT7W"],
];

/**
 * A fresh version-4 id whose first 40 bits (the first ten hex digits) are `orderId`'s, so it
 * derives the same reference: everything after them is new.
 */
export function clashingId(orderId: string): string {
  const fresh = randomUUID();
  const id = `${orderId.slice(0, 8)}-${orderId.slice(9, 11)}${fresh.slice(11)}`;
  if (id === orderId) return clashingId(orderId);
  return id;
}

/**
 * A fresh version-4 id equal to `orderId` in its first 39 bits and different in the 40th, so it
 * derives a different reference although it shares nine and a half hex digits.
 */
export function nearMissId(orderId: string): string {
  const fresh = randomUUID();
  const tenth = (Number.parseInt(orderId.charAt(10), 16) ^ 1).toString(16);
  return `${orderId.slice(0, 8)}-${orderId.slice(9, 10)}${tenth}${fresh.slice(11)}`;
}

/** An id generator that returns `ids` in order, then fresh random ids; counts its calls. */
export function scriptedIds(ids: readonly string[]): {
  readonly next: () => string;
  readonly calls: () => number;
} {
  let calls = 0;
  return {
    next: () => {
      calls += 1;
      return ids[calls - 1] ?? randomUUID();
    },
    calls: () => calls,
  };
}
