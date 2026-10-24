/**
 * Competitor and third-party marks, every one of them traceable to `docs/research/competitors-*.md`
 * (spec 006 §2.3 rule 8) and asserted so by `tests/unit/seed-check.test.ts`. Moved here from
 * `seed/check.ts` so the seed gate and the blog rules (spec 044 §2.3 rule 5, TASK-321) read one
 * list; `seed/check.ts` re-exports it.
 *
 * Common nouns the studies happen to contain — `Blumen`, `kwiaty`, `blumenversand` — are
 * deliberately **not** here: they are German and Polish for "flowers" and banning them would ban
 * the `de` and `pl` copy. What is banned is a *brand*: naming one in our own catalogue is the
 * competitor wording `plan/10` §2.2 forbids and, on a page, a third-party mark we have no right
 * to use.
 */
export const COMPETITOR_MARKS: readonly string[] = [
  "interflora",
  "floraqueen",
  "euroflorist",
  "fleurop",
  "bloom & wild",
  "bloomandwild",
  "internetflorist",
  "1800flowers",
  "1-800-flowers",
  "netflorist",
  "floristsonline",
  "giftbasketsoverseas",
  "colvin",
  "bergamotte",
  "blume2000",
  "bonita blomster",
  "flora nordica",
  "delejos",
  "aquarelle",
  "universal flower",
];
