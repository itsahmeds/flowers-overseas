/**
 * The zod boundary for occasion-calendar rows (spec 007 §2 "Occasion dates"; TASK-089).
 *
 * The schemas are **spec 006's**, re-exported rather than restated: one rule shape, in
 * `seed/schema/catalogue.ts`, parsed by the seed gate, by spec 002's importer and by anyone who
 * takes a calendar row from outside the repository. A second copy here is exactly how a rule the
 * seed accepts and the evaluator rejects would come about.
 *
 * It is a **separate file, deliberately not re-exported from `src/modules/geo/index.ts`**: the
 * evaluator and the calendar reads are pure arithmetic over a build-time JSON import, and pulling
 * zod through the module barrel would put a parser into the render path of every page that shows
 * a date (the byte spec 004 spent TASK-046 removing). A caller that genuinely has untrusted rows —
 * spec 002's importer, spec 012's admin editor — imports this file by path and parses once.
 */
export {
  type OccasionRule,
  type OccasionRuleType,
  OccasionRuleSchema,
  type SeedOccasionCountry,
  SeedOccasionCountryRegistrySchema,
  SeedOccasionCountrySchema,
  occasionRuleTypes,
} from "../../../../seed/schema/catalogue.ts";
