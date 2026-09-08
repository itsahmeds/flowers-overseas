/**
 * Locale-correct sorting (spec 003 §2 "Formatters", §5.2, AC-18; `plan/03` §7 "Sorting";
 * TASK-036).
 *
 * The second of the two files allowed to construct an `Intl.*` object (`fo/no-adhoc-intl`,
 * TASK-037). Every list a buyer reads in alphabetical order — cities in a corridor, countries in
 * the chooser, florist names in admin — is ordered here, because `Array.prototype.sort()`'s
 * default is UTF-16 code-unit order, which puts `Łódź` after `Zakopane` and reads as broken in
 * Poland (`plan/03` §7's acid test: `ł` sorts after `l`, not with the diacritics of `L`).
 *
 * Collator options, and why:
 *
 *  - `usage: "sort"` — the ordering ICU uses for display lists, not the looser `"search"`
 *    matching. Explicit because the default differs in intent from what we want.
 *  - `sensitivity` is left at its default (`"variant"`, full strength) rather than `"base"`:
 *    `"base"` would make `Łódź` and `Lodz` *equal*, which is right for a search box and wrong for
 *    a sorted list, where an equality collapses two real cities into an arbitrary order. In
 *    Polish, `l` and `ł` are different letters at the primary level, so full strength is also
 *    what produces AC-18's ordering.
 *  - `numeric: true` — `Warszawa 2` before `Warszawa 10` (address lines, apartment numbers,
 *    size labels). Digit-string ordering is never what a human expects.
 *  - `caseFirst` is left at the locale default; nothing we sort mixes cases meaningfully.
 */
import { type LocaleCode, getLocaleRegistry } from "./registry.ts";

const collators = new Map<string, Intl.Collator>();

/**
 * The collator for a locale, memoised per BCP 47 tag (construction is the expensive part). The
 * tag is resolved through the registry, exactly as in `format.ts` — and it is the locale's
 * `formattingTag`, for the same reason: collation is a formatting convention, not a document
 * language, so `en` collates as `en-150` while `<html lang>` stays `en` (TASK-044). A
 * database-backed locale set moves collation with it (AC-5).
 */
export function collator(locale: LocaleCode): Intl.Collator {
  const config = getLocaleRegistry().get(locale);
  if (config === undefined) {
    throw new Error(`unknown locale code: ${locale}`);
  }
  const tag = config.formattingTag;
  const cached = collators.get(tag);
  if (cached !== undefined) return cached;
  const created = new Intl.Collator(tag, { usage: "sort", numeric: true });
  collators.set(tag, created);
  return created;
}

/**
 * Sort a copy of `items` by the string `key` returns, in `locale`'s collation order. A copy,
 * because sorting a caller's array in place has bitten every codebase that renders a list twice.
 */
export function sortBy<T>(
  items: readonly T[],
  locale: LocaleCode,
  key: (item: T) => string,
): T[] {
  const compare = collator(locale).compare;
  return [...items].sort((left, right) => compare(key(left), key(right)));
}
