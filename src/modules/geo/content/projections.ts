/**
 * The corridor content model's projection onto spec 002 §5.1 (spec 007 §5.1's first contract,
 * AC-3; TASK-087).
 *
 * One pure function returning **exactly** the column set of `country_locale_content`, in the order
 * spec 002 §5.1 lists them, plus the two columns spec 007 §5.1 requests as an amendment
 * (`seo_title`, `seo_description` — spec 007 §13 Q10, accepted by the founder on 2026-09-15 and
 * recorded in spec 002 §14). It exists for the same reason `src/config/catalogue/projections.ts`
 * does: the corridor copy is authored once, in `content/corridors/`, and spec 002's seed and spec
 * 012's admin editor read it through this function instead of re-keying it — so the file half and
 * the table half cannot drift.
 *
 * The three conventions of `src/config/catalogue/projections.ts` apply unchanged:
 *
 *  1. **Surrogate keys and trigger columns are not projected.** No `id`, no `created_at`, no
 *     `updated_at`: the database mints them, and a fabricated UUID here would be ignored by a seed
 *     that upserts on the natural key `(country_id, locale_code, state)`.
 *  2. **A foreign key is passed in, never invented.** `toCountryLocaleContentRow(content, { countryId })`
 *     takes the id the caller resolved after upserting `country`, so the column *is* `country_id`
 *     and the projection stays pure.
 *  3. **The amendment is included, because it exists for this content.** `plan/02` §5.3 requires an
 *     authored per-country title and meta description and the table as specified had nowhere to put
 *     them.
 *
 * `tests/unit/corridor-projections.test.ts` pins this list and `COUNTRY_ROW_COLUMNS` against a
 * separately transcribed copy of spec 002 §5.1, so neither side can be edited alone (AC-3).
 */
import type { CountryLocaleContent, FaqItem } from "./schemas.ts";

/** The id of an already-upserted `country` row, resolved by the caller (convention 2 above). */
export interface CountryRef {
  readonly countryId: string;
}

/**
 * Spec 002 §5.1 `country_locale_content` columns, in declaration order, minus the generated `id`
 * and the trigger timestamps, plus the two columns of the spec 007 §5.1 amendment. `seo_title` and
 * `seo_description` sit beside `h1`, which is where the page reads them from: the title, the
 * description and the heading are one authored unit (`plan/02` §5.3).
 */
export const COUNTRY_LOCALE_CONTENT_ROW_COLUMNS = [
  "country_id",
  "locale_code",
  "state",
  "seo_title",
  "seo_description",
  "h1",
  "intro_md",
  "faq",
  "local_flowers_md",
  "taboos_md",
  "version",
  "reviewed",
  "reviewed_by",
  "reviewed_at",
] as const;

/** Spec 002 §5.1's natural key: `UNIQUE (country_id, locale_code, state)`. */
export const COUNTRY_LOCALE_CONTENT_NATURAL_KEY_COLUMNS = [
  "country_id",
  "locale_code",
  "state",
] as const;

export interface CountryLocaleContentRow {
  country_id: string;
  locale_code: string;
  state: string;
  seo_title: string;
  seo_description: string;
  h1: string;
  intro_md: string;
  faq: readonly FaqItem[];
  local_flowers_md: string;
  taboos_md: string;
  version: number;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/**
 * Project a parsed corridor file onto spec 002 §5.1's `country_locale_content` row.
 *
 * `intro_md` is the authored intro and the guide body is **not** projected: spec 002 §5.1 gives
 * the table `intro_md`, `local_flowers_md` and `taboos_md` and no column for the long body, which
 * is the markdown half of the file. Spec 012's editor inherits the same split, and the body stays
 * where a human edits and diffs it. An unset `reviewed_by`/`reviewed_at` becomes `NULL` rather
 * than an empty string, because "not reviewed" is an absence, not a value.
 */
export function toCountryLocaleContentRow(
  content: CountryLocaleContent,
  ref: CountryRef,
): CountryLocaleContentRow {
  return {
    country_id: ref.countryId,
    locale_code: content.locale,
    state: content.state,
    seo_title: content.seoTitle,
    seo_description: content.seoDescription,
    h1: content.h1,
    intro_md: content.intro,
    faq: content.faq,
    local_flowers_md: content.localFlowers,
    taboos_md: content.taboos,
    version: content.version,
    reviewed: content.reviewed,
    reviewed_by: content.reviewedBy ?? null,
    reviewed_at: content.reviewedAt ?? null,
  };
}
