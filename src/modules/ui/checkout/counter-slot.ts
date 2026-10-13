/**
 * The placeholder the card counter's template keeps for the live count (spec 010 §5.3; TASK-201).
 *
 * The caller resolves `card.counter` (checkout catalogue) with `count` set to this string and the limit
 * formatted, then the server and the island each replace it with a count. A plain module, not the
 * island's: a server component that imports a value from a `"use client"` file receives a client
 * reference instead of the string.
 */
export const COUNT_SLOT = "{count}";

/**
 * Whether a card count is past the limit: `max` itself is allowed (200 of 200 is a full card, not
 * an error). The server-drawn counter and the island both ask this, so they cannot disagree.
 */
export function isOverLimit(count: number, max: number): boolean {
  return count > max;
}
