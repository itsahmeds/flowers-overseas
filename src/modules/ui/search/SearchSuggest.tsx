"use client";
/**
 * `SearchSuggest`: suggestions under the header's search field as the buyer types (spec 045 §14
 * A-founder-2026-11-08a item 3, §5.3, AC-44, AC-45; TASK-520, which folds TASK-409 in;
 * `docs/design/wireframes/search-suggest-desktop.dc.html` and `-mobile`).
 *
 * A progressive enhancement of the server's GET form: it finds the field by id, makes it an APG
 * "combobox with listbox popup" (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
 * `aria-controls`, `aria-activedescendant`) and renders the listbox under it. Focus never leaves
 * the field. Down opens or moves down, Up moves up (back to the field from the first row), Enter
 * follows the active row or, with none, submits the form natively; Escape closes and keeps the
 * words; Tab closes. A polite status reads `search.suggest.count` after each answer.
 *
 * **The words never go into a URL.** It asks `POST {endpoint}` with the JSON body
 * `{ locale, q, to? }` after 2 letters and 150 ms without typing; it logs, reports and measures
 * nothing. Any failure (429, 503, a lost connection) closes the list and the form still works.
 * At most 6 suggestions, each a link with its kind word and never a price; the last row submits
 * the form ("See all results for …").
 *
 * Loaded after the LCP paint by `SearchSuggestLoader` inside `<AfterPaint island="search-suggest"
 * on="paint">` (`../deferred/deferredSet.ts`), so it is never on the first screen's paint path. It
 * imports nothing but React and the menu group's name, to stay inside its 4,096 B budget.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

import { MEGA_MENU_GROUP } from "../../../config/mega-menu.ts";
import { SUGGEST_QUERY_MARK } from "./suggest-mark.ts";

/** The suggestion kinds the route answers with (`SuggestItemSchema`). */
export type SearchSuggestKind =
  "product" | "occasion" | "category" | "destination" | "page";

/** The island's words, resolved by the header on the server. */
export interface SearchSuggestLabels {
  /** `search.suggest.kind.*`: the visible kind word of each row. */
  readonly kinds: Readonly<Record<SearchSuggestKind, string>>;
  /** `search.suggest.count` for 0 to 6 suggestions, in order. */
  readonly counts: readonly string[];
  /** `search.suggest.all` with the words replaced by `SUGGEST_QUERY_MARK`. */
  readonly all: string;
  /** The listbox's name: `nav.search.label`. */
  readonly list: string;
}

export interface SearchSuggestProps {
  readonly endpoint: string;
  /** The header field's id. */
  readonly inputId: string;
  readonly locale: string;
  /** The header form's hidden destination, when the page has one. */
  readonly to?: string;
  readonly labels: SearchSuggestLabels;
}

interface Item {
  readonly kind: SearchSuggestKind;
  readonly label: string;
  readonly href: string;
}

interface View {
  readonly open: boolean;
  readonly items: readonly Item[];
  /** The active row, `-1` for the field itself. The last row is "See all". */
  readonly active: number;
  readonly q: string;
}

const LIST = "header-search-lb";
const MAX = 6;
const CLOSED: View = { open: false, items: [], active: -1, q: "" };

/** The typed letters in bold where the name contains them (case-insensitive). */
function bold(text: string, q: string): ReactNode {
  const at = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (q === "" || at < 0) return text;
  return [
    text.slice(0, at),
    <b key="b">{text.slice(at, at + q.length)}</b>,
    text.slice(at + q.length),
  ];
}

/** The header field, or `null` when the page has none. */
function fieldOf(id: string): HTMLInputElement | null {
  const node = document.getElementById(id);
  return node instanceof HTMLInputElement ? node : null;
}

/** Submit the field's form, as Enter with no active row does. */
function submitOf(id: string): void {
  fieldOf(id)?.form?.requestSubmit();
}

const ROW =
  "flex min-h-[52px] cursor-pointer items-center gap-[12px] border-s-[3px] border-transparent ps-[11px] pe-[16px] aria-selected:border-sky aria-selected:bg-sage-wash";

export function SearchSuggest({
  endpoint,
  inputId,
  locale,
  to,
  labels,
}: SearchSuggestProps) {
  const [view, setView] = useState<View>(CLOSED);
  const live = useRef(view);
  useEffect(() => {
    live.current = view;
  }, [view]);

  useEffect(() => {
    performance.mark("fo:deferred:search-suggest");
    const input = fieldOf(inputId);
    if (input === null) return undefined;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", LIST);
    input.setAttribute("aria-expanded", "false");
    let timer = 0;
    let request: AbortController | undefined;
    const close = (): void => {
      setView((current) => ({ ...current, open: false, active: -1 }));
    };

    const ask = (q: string): void => {
      request?.abort();
      const own = new AbortController();
      request = own;
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          to === undefined ? { locale, q } : { locale, q, to },
        ),
        signal: own.signal,
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("refused")),
        )
        .then((data: unknown) => {
          if (!Array.isArray(data)) throw new Error("shape");
          setView({
            open: document.activeElement === input,
            items: (data as Item[]).slice(0, MAX),
            active: -1,
            q,
          });
        })
        .catch(() => {
          if (!own.signal.aborted) close();
        });
    };

    const onInput = (): void => {
      window.clearTimeout(timer);
      const q = input.value.trim();
      if (q.replace(/\s+/gu, "").length < 2) {
        request?.abort();
        setView(CLOSED);
        return;
      }
      timer = window.setTimeout(() => {
        ask(q);
      }, 150);
    };

    const onKey = (event: KeyboardEvent): void => {
      const { open, items, active, q } = live.current;
      const last = items.length;
      if (event.key === "ArrowDown") {
        if (q === "") return;
        event.preventDefault();
        setView((current) =>
          current.open
            ? { ...current, active: Math.min(current.active + 1, last) }
            : { ...current, open: true },
        );
      } else if (event.key === "ArrowUp" && open) {
        event.preventDefault();
        setView((current) => ({
          ...current,
          active: Math.max(current.active - 1, -1),
        }));
      } else if (event.key === "Enter" && open && active >= 0) {
        event.preventDefault();
        const item = items[active];
        if (item === undefined) submitOf(inputId);
        else window.location.assign(item.href);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        close();
      }
    };

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    input.addEventListener("blur", close);
    return () => {
      window.clearTimeout(timer);
      request?.abort();
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("blur", close);
    };
  }, [endpoint, inputId, locale, to]);

  useEffect(() => {
    const input = fieldOf(inputId);
    if (input === null) return;
    input.setAttribute("aria-expanded", String(view.open));
    if (view.open && view.active >= 0) {
      input.setAttribute("aria-activedescendant", `${LIST}-${view.active}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    // Two layers never overlap: opening the list closes an open mega panel.
    if (view.open) {
      for (const panel of document.querySelectorAll<HTMLDetailsElement>(
        `details[name="${MEGA_MENU_GROUP}"][open]`,
      )) {
        panel.open = false;
      }
    }
  }, [view.open, view.active, inputId]);

  const [before = "", after = ""] = labels.all.split(SUGGEST_QUERY_MARK);
  const pick = (index: number) => () => {
    setView((current) => ({ ...current, active: index }));
  };
  return (
    <>
      <div aria-live="polite" className="sr-only" role="status">
        {view.open ? labels.counts[Math.min(view.items.length, MAX)] : ""}
      </div>
      <ul
        aria-label={labels.list}
        className="bg-card rounded-field text-ui text-ink absolute start-0 top-[calc(100%+6px)] z-30 m-0 w-full list-none py-[6px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-md)] md:w-[max(100%,420px)]"
        data-fo-search-suggest=""
        hidden={!view.open}
        id={LIST}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        role="listbox"
      >
        {view.items.map((item, index) => (
          <li
            aria-selected={index === view.active}
            className={ROW}
            data-fo-suggest-kind={item.kind}
            id={`${LIST}-${index}`}
            key={`${item.kind}${item.href}`}
            onMouseEnter={pick(index)}
            role="option"
          >
            <a
              className="text-ink flex min-w-0 flex-1 items-center gap-[12px] no-underline"
              href={item.href}
              tabIndex={-1}
            >
              <span className="min-w-0 flex-1 truncate">
                <bdi>{bold(item.label, view.q)}</bdi>
              </span>
              <span className="text-ink-3 flex-none text-xs">
                {labels.kinds[item.kind]}
              </span>
            </a>
          </li>
        ))}
        <li
          aria-selected={view.active === view.items.length}
          className={`${ROW} border-rule text-link mt-[6px] border-t font-bold`}
          id={`${LIST}-${view.items.length}`}
          onClick={() => {
            submitOf(inputId);
          }}
          onMouseEnter={pick(view.items.length)}
          role="option"
        >
          <span className="min-w-0 flex-1 truncate">
            {before}
            <bdi>{view.q}</bdi>
            {after}
          </span>
        </li>
      </ul>
    </>
  );
}
