/**
 * `orderReference(orderId)` — the buyer-facing reference `FO-XXXX-XXXX` (spec 010 §14 A2.1;
 * TASK-202).
 *
 * Crockford base32 (digits and capitals without I, L, O, U) of the **first 40 bits** of the id,
 * written `FO-` + four characters + `-` + four characters. Pure; no other file builds an `FO-`
 * string. The database half of A2 (the `order_reference(uuid)` SQL function and the unique index
 * that refuses a clash, A2.2) is not in this file; see the TASK-202 brief's escalations.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ORDER_REFERENCE_PATTERN = /^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

export function orderReference(orderId: string): string {
  if (!UUID_PATTERN.test(orderId)) {
    throw new TypeError("orderReference expects a UUID");
  }
  // The first 10 hex digits are the first 40 bits; 40 = 8 × 5, so eight base32 digits exactly.
  let bits = BigInt(`0x${orderId.replaceAll("-", "").slice(0, 10)}`);
  const digits: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    digits.unshift(CROCKFORD[Number(bits & 31n)] as string);
    bits >>= 5n;
  }
  return `FO-${digits.slice(0, 4).join("")}-${digits.slice(4).join("")}`;
}
