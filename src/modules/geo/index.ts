/**
 * The only import path into the geo module (spec 007 §5.2; TASK-087).
 *
 * Corridor content, and later countries, cities, postcodes, holidays, cutoffs and the occasion
 * calendar. Owned by: spec 007 (corridor content), spec 002 (data), spec 009 (cutoffs).
 *
 * TASK-087 opened it with the corridor content model: the schema every authored guide parses
 * under, the view model a corridor page renders, and the projection spec 002's
 * `country_locale_content` inherits. The provider objects themselves are **not** exported — a
 * caller that could name `staticCountryContentProvider` could swap the corpus at runtime, which
 * is what the seam of `content/provider.ts` exists to prevent (spec 007 AC-4).
 *
 * TASK-089 added `occasions/` (spec 007 §13 Q7): `occasionDate` for the six `plan/03` §9 rule
 * types and the per-destination calendar; spec 009 consumes them and adds `plan/13` B15's seventh.
 */
export {
  CountryLocaleContentSchema,
  CountryOperationsSchema,
  FaqItemSchema,
  BODY_WORD_MIN,
  FAQ_MAX,
  FAQ_MIN,
  INTRO_WORD_MAX,
  INTRO_WORD_MIN,
  RELATED_COUNT,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  corridorStates,
  type CorridorState,
  type CountryLocaleContent,
  type CountryOperations,
  type FaqItem,
} from "./content/schemas.ts";
export {
  CORRIDOR_CONTENT_DIR,
  corridorContentPath,
  parseCorridorContent,
  parseCorridorContentOrThrow,
  type ContentParseIssue,
  type ContentParseResult,
} from "./content/parse.ts";
export {
  COUNTRY_LOCALE_CONTENT_NATURAL_KEY_COLUMNS,
  COUNTRY_LOCALE_CONTENT_ROW_COLUMNS,
  toCountryLocaleContentRow,
  type CountryLocaleContentRow,
} from "./content/projections.ts";
export {
  corridorContentView,
  listCorridorContent,
  relatedCorridorViews,
  type CorridorContentView,
} from "./content/view.ts";
export type { CountryContentProvider } from "./content/provider.ts";
// Occasion calendar (TASK-089).
export {
  type DatedOccasion,
  type IsoDate,
  MAX_YEAR,
  MIN_YEAR,
  NEXT_OCCASIONS_HORIZON_MONTHS,
  type OccasionCalendarRow,
  type OccasionRuleKind,
  committedOccasionCalendar,
  easterSunday,
  nextOccasions,
  observedUndatedOccasions,
  occasionDate,
  upcomingOccasions,
} from "./occasions/index.ts";
