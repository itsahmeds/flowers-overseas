"use client";

/**
 * `FinderTypeahead` — the finder's one island, and the whole of its client JavaScript (spec 004
 * §2 "Locale-home skeleton", §13's 2026-09-08 resolution note, §14 **A1**, AC-11; TASK-052;
 * design round 7).
 *
 * Round 7: *"the country field is a plain type-ahead — as the user types, the matching country
 * name appears beneath the field; no status column, no footnote, no pills."* That is what this
 * renders, and nothing else: the matching names, the typed prefix in bold as the artboards draw
 * it, and a polite live region announcing how many matched — the one thing a `<datalist>` cannot
 * do, and the reason this island exists at all.
 *
 * ## Three constraints it is built under
 *
 * **1. It is an enhancement, never the only way to choose (AC-11).** The server renders this
 * component's HTML with `list={listId}`, so before hydration — and forever, with JavaScript
 * disabled — the country field is a native `<input list>` over the `<datalist>` of all seven
 * destinations, which types, filters and picks without a byte of script. On mount the `list`
 * attribute is dropped and this list takes over, so the visitor never sees two overlapping
 * pop-ups. Remove this component and the finder still works; that is the test.
 *
 * **2. Strings arrive as props, and no formatter runs in the browser** (§13 Q13 option (b)). The
 * country names come from `destinations.*` on the server, and the announcement is
 * **pre-formatted per match count** — an array indexed 0…n — because `finder.destinations.matches`
 * is an ICU plural and evaluating it here would mean shipping a message catalogue and a
 * formatter to say "3 countries match". No `next-intl`, no `zod`, no `Intl` (which is also what
 * keeps `fo/no-adhoc-intl` clean without an exception).
 *
 * **3. It is measured in hundreds of bytes of Brotli** (§14 A1's 131 072 B budget on a locale
 * document; the PR body carries the measurement for this head). That number is why the component
 * is this small: no combobox roles, no `aria-activedescendant`, no debounce and no library — the
 * only focus management is returning focus to the field after a pick, which the dismissal rule
 * below needs. The combobox proper is spec 007/008's, where a real destination set and a search
 * backend make it worth its weight; until then a labelled text field, a list of buttons and a
 * live region are keyboard-operable, screen-reader-honest and cheap.
 *
 * ## Dismissal (`/review 40`, blocking item 1)
 *
 * The first cut left the list rendered after a pick — `choose()` set the query to the full
 * country name, the filter recomputed to that one option, and the box stayed over the town label
 * and the top 12 px of its input at 390 px. The list is now open only while the visitor is
 * working in it: a pick closes it and puts focus back on the field, `Escape` closes it, and
 * moving focus out of the field-plus-list closes it. Mouse selection survives the blur rule
 * because an option cancels `pointerdown` — focus never leaves the input, so no `focusout` races
 * the `click` that chooses. None of this touches the no-JavaScript path: the `<datalist>` and its
 * `list` attribute are the platform's own pop-up and dismiss themselves.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

export interface FinderTypeaheadProps {
  /** Ids owned by `finder-model.ts`, so the server's `<label>` and `<datalist>` still match. */
  readonly inputId: string;
  readonly listId: string;
  readonly describedBy: string;
  /** The field skin, passed in so the island cannot drift from the two sibling fields. */
  readonly className: string;
  /** The seven destination names, already collated and translated on the server. */
  readonly options: readonly string[];
  /**
   * The announcement for each possible match count, index `0…options.length`. Pre-formatted on
   * the server; see constraint 2.
   */
  readonly matchLabels: readonly string[];
}

export function FinderTypeahead({
  inputId,
  listId,
  describedBy,
  className,
  options,
  matchLabels,
}: FinderTypeaheadProps): ReactElement {
  const [query, setQuery] = useState("");
  // `open` is "the visitor is choosing right now", not "there is something to show": typing opens
  // it, and a pick, `Escape` or focus leaving the widget closes it even though the query still
  // matches. Without this the list sat over the town field forever after a pick (`/review 40`).
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // The handover, and the only side effect in this component: `list` is in the server-rendered
  // HTML (and in React's own props, so it survives every later render), and it is removed from
  // the DOM once — and only once — this island is alive. Before that, and forever with
  // JavaScript disabled, the field is a native `<input list>` type-ahead. Done by attribute
  // rather than by a `useState` flag because a state flag would be a `set-state-in-effect`
  // render pass for a single attribute, and because the pre-hydration markup must be identical
  // to the server's byte for byte.
  useEffect(() => {
    field.current?.removeAttribute("list");
  }, []);

  const needle = query.trim().toLocaleLowerCase();
  // `startsWith`, not `includes`: "pol" should offer Poland, and nothing in a seven-country list
  // needs fuzzy matching. `toLocaleLowerCase()` rather than `toLowerCase()` because Turkish `İ`
  // is a Phase-4 destination language and the dotted/dotless pair is exactly the case this gets
  // wrong otherwise.
  const matches =
    needle === ""
      ? []
      : options.filter((option) =>
          option.toLocaleLowerCase().startsWith(needle),
        );
  const showMatches = open && matches.length > 0;
  const announcement =
    !open || needle === "" ? "" : (matchLabels[matches.length] ?? "");

  const choose = (option: string): void => {
    setQuery(option);
    setOpen(false);
    if (field.current !== null) {
      field.current.value = option;
      // The chosen option's `<button>` is about to be unmounted, so focus has to be put somewhere
      // deliberate; the field the visitor was filling in is the only honest answer, and it leaves
      // the tab order pointing at the town field next.
      field.current.focus();
    }
  };

  const dismiss = (): void => {
    setOpen(false);
  };

  return (
    // `onBlur` on the wrapper, not the input: React's `onBlur` is `focusout`, so it fires for the
    // option buttons too and `relatedTarget` tells us whether focus went to a sibling inside the
    // widget (keep it open) or out of it (close). `onKeyDown` likewise catches `Escape` from the
    // field and from an option.
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        // `preventDefault` so `Escape` in the field does not also clear what was typed: the first
        // press dismisses the suggestions, and the text stays for the visitor to correct.
        event.preventDefault();
        dismiss();
        field.current?.focus();
      }}
    >
      <input
        ref={field}
        id={inputId}
        name="country"
        type="text"
        autoComplete="country-name"
        aria-describedby={describedBy}
        className={className}
        list={listId}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {/*
        The count, politely. `role="status"` and `aria-live="polite"` both, because Safari has
        historically honoured one and not the other on a node that starts empty; the node is in
        the DOM from first paint so the announcement is an update to an existing region rather
        than the insertion of a new one, which is what makes it announce at all.
      */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        data-fo-finder-announce
      >
        {announcement}
      </div>
      {/* No `z-index` on the list below: an absolutely positioned box already paints above its
          non-positioned in-flow siblings, so the two fields under it do not need the named layer
          scale — which is reserved for elements that overlap *chrome* (`globals.css`). */}
      {!showMatches ? null : (
        <ul
          className="bg-surface border-rule mt-xs absolute start-0 end-0 top-full border border-solid shadow-md"
          data-fo-finder-matches
        >
          {matches.map((option) => (
            <li key={option}>
              {/* The matched prefix in bold, as the artboards draw it (`**Pol**and`). */}
              <button
                className="text-md hover:bg-surface-raised min-h-[44px] w-full cursor-pointer px-[12px] text-start"
                // Cancelling `pointerdown` keeps focus in the input, so the wrapper's `focusout`
                // rule cannot close the list — and unmount this button — between the press and
                // the `click` that chooses. This is why a mouse pick still works.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => choose(option)}
                type="button"
              >
                <strong>{option.slice(0, needle.length)}</strong>
                {option.slice(needle.length)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
