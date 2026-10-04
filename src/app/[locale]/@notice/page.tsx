/**
 * The locale home's `@notice` slot: **no** price claim (founder, 2026-10-04: "Every price
 * includes VAT and delivery. dont write this on home"; TASK-176). The home shows no price, and
 * every other page gets the claim from `./default.tsx`.
 */
export default function HomeNotice(): null {
  return null;
}
