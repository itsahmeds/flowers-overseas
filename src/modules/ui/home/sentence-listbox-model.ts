/**
 * The home sentence listbox's pure model (spec 004 §14 A-founder-2026-10-21d clauses 5 and 6,
 * AC-62, AC-63, T-68; TASK-326): which option a key moves to, the type-ahead, and what `Enter` on
 * an option does. No DOM: `./sentence-listbox.ts` reads the select and calls these.
 *
 * Small on purpose: this ships in the sentence's lazy chunk, which spec 004 caps at 3,072 B Brotli
 * (clause 11).
 */

/** The type-ahead buffer's window (clause 6): a key more than this after the last one starts afresh. */
export const TYPEAHEAD_MS = 500;

/**
 * The option `key` moves focus to from `current` among `count` options, or `-1` when the key is
 * not a move. `ArrowDown` and `ArrowUp` move one and **do not wrap**; `Home` and `End` go to the
 * first and the last. Disabled options are stops like any other (a screen reader announces them).
 */
export function moveIndex(key: string, current: number, count: number): number {
  const last = count - 1;
  return key === "ArrowDown"
    ? Math.min(current + 1, last)
    : key === "ArrowUp"
      ? Math.max(current - 1, 0)
      : key === "Home"
        ? 0
        : key === "End"
          ? last
          : -1;
}

/** The option an opening focuses: the selected one, or the first enabled one if none is. */
export function openingIndex(
  disabled: readonly boolean[],
  selected: number,
): number {
  return selected >= 0 ? selected : Math.max(disabled.indexOf(false), 0);
}

/** `Enter` or `Space` on an option: an enabled one is chosen, a disabled one keeps the list open. */
export function activation(disabled: boolean): "select" | "stay" {
  return disabled ? "stay" : "select";
}

/**
 * The type-ahead (clause 6): printable keys build a buffer that a pause of more than
 * `TYPEAHEAD_MS` clears; the buffer is a case- and accent-insensitive prefix, compared by
 * `compare`, the page locale's collation at `sensitivity: "base"` (`collatorCompare()` below).
 * A buffer of one letter repeated ("nn") cycles through the options starting with it, from the one
 * after `current`; a longer buffer ("po") searches from `current` itself, so typing on keeps the
 * match. Returns `-1` when nothing matches. `now` is injected so the window is testable.
 */
export function typeahead(
  compare: (label: string, query: string) => number,
  now: () => number,
): (key: string, labels: readonly string[], current: number) => number {
  let buffer = "";
  let last = Number.NEGATIVE_INFINITY;
  return (key, labels, current) => {
    const at = now();
    buffer = at - last > TYPEAHEAD_MS ? key : buffer + key;
    last = at;
    const first = buffer.slice(0, 1);
    const cycling = buffer.split("").every((letter) => letter === first);
    const query = cycling ? first : buffer;
    const from = cycling ? current + 1 : current;
    for (let step = 0; step < labels.length; step += 1) {
      const index = (from + step) % labels.length;
      const label = labels[index] ?? "";
      if (compare(label.slice(0, query.length), query) === 0) return index;
    }
    return -1;
  };
}

/**
 * The page locale's base-sensitivity comparison for the type-ahead: ECMA-402 defines
 * `String.prototype.localeCompare(that, locales, options)` as `new Intl.Collator(locales,
 * options).compare(this, that)`, so this is clause 6's `Intl.Collator(locale, { sensitivity:
 * "base" })` without constructing one outside `src/modules/i18n/collate.ts` (`fo/no-adhoc-intl`).
 * `collate.ts` itself is not imported: it reads the locale registry, which must not reach this
 * 3,072 B chunk. `tests/unit/sentence-listbox-model.test.ts` holds the two equal.
 */
export function collatorCompare(
  locale: string,
): (label: string, query: string) => number {
  return (label, query) =>
    label.localeCompare(query, locale || undefined, { sensitivity: "base" });
}
