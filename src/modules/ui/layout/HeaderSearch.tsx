/**
 * The header's search field (spec 045 §2.1 as amended by §14 A-founder-2026-11-08a items 2 and 3,
 * §5.3, AC-34, AC-38, AC-41 to AC-44; TASK-404, TASK-520; `docs/design/wireframes/
 * chrome-desktop.dc.html` and `chrome-mobile.dc.html`, the 2026-11-08 sections, and
 * `search-suggest-*.dc.html`).
 *
 *  - **`HeaderSearchForm`**: one plain GET form, `<form role="search" method="get"
 *    action="/{locale}/{searchSegment}">`, on every page: the field (`q`, `maxlength="80"`,
 *    `autocomplete="off"`, `enterkeyhint="search"`) named by a visually hidden `<label>` with the
 *    same words as its visible placeholder (`nav.search.label`, cut with an ellipsis where the field
 *    is narrow), the hidden `to` only on a page with a destination, and a 44 × 44 ink circle named
 *    by `nav.search.submit`. A 44 px pill with a 1 px field-edge ring; focused, the ring goes round
 *    the whole pill. The Menu holds the same form (`MenuSheet`'s `search`).
 *  - **`HeaderSearchField`**: the header's form with the suggestions island beside it, mounted by
 *    `AfterPaint` after the LCP paint (spec 004's deferred set, `search-suggest`). Until it loads,
 *    and whenever it fails, the field is a plain GET form.
 *
 * Server Components: no client JavaScript is needed to search. The field is in the server HTML at
 * its final size at every width, so the header adds 0 to CLS. Logical properties only, so
 * `/ar-XB` mirrors; every string arrives as a prop from the header.
 */
import type { ReactElement } from "react";

import {
  SEARCH_CONFIG,
  SEARCH_PARAM,
  SEARCH_SUGGEST_PATH,
} from "../../../config/search.ts";
import { AfterPaint } from "../deferred/AfterPaint.tsx";
import { Icon } from "../icons/Icon.tsx";
import { VisuallyHidden } from "../primitives/a11y.tsx";
import { SearchSuggestLoader } from "../search/SearchSuggestLoader.tsx";
import type { SearchSuggestLabels } from "../search/SearchSuggest.tsx";
import type { HeaderSearchForm as HeaderSearchFormModel } from "./header-model.ts";

/** The words a search control prints: the reviewed `nav.search.*` keys, resolved by the header. */
export interface HeaderSearchLabels {
  /** `nav.search.label`: the field's name and visible hint. */
  readonly label: string;
  /** `nav.search.submit`: the submit button's name. */
  readonly submit: string;
}

export interface HeaderSearchFormProps extends HeaderSearchLabels {
  readonly form: HeaderSearchFormModel;
  /** Unique per form in the document (`header-search`, `menu-search`). */
  readonly idPrefix: string;
  /**
   * The words the results page searched (its header only, a dynamic route): the field's `value`.
   * Absent on every prebuilt page, so no prebuilt field carries a `value` (AC-43).
   */
  readonly value?: string;
}

/** The input's id for a form's prefix: the suggestions island finds the field by it. */
export function headerSearchInputId(idPrefix: string): string {
  return `${idPrefix}-q`;
}

/** The board's `.sx-f` with `.sx-go`: the field and its ink circle in one 44 px pill. */
export function HeaderSearchForm({
  form,
  label,
  submit,
  idPrefix,
  value,
}: HeaderSearchFormProps): ReactElement {
  const id = headerSearchInputId(idPrefix);
  return (
    <form
      action={form.action}
      className="bg-card focus-within:outline-focus flex h-[44px] w-full min-w-0 items-center gap-[8px] rounded-full ps-[18px] shadow-[inset_0_0_0_1px_var(--color-field-edge)] focus-within:shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus-within:outline-[2.5px] focus-within:outline-offset-2 focus-within:outline-solid"
      data-fo-header-search-form={idPrefix}
      method="get"
      role="search"
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete="off"
        className="text-ui text-ink placeholder:text-ink-3 h-full w-full min-w-0 flex-1 truncate border-0 bg-transparent p-0 outline-none [&::-webkit-search-cancel-button]:hidden"
        enterKeyHint="search"
        id={id}
        maxLength={SEARCH_CONFIG.maxQueryChars}
        name={SEARCH_PARAM.q}
        placeholder={label}
        type="search"
        {...(value === undefined || value === ""
          ? {}
          : { defaultValue: value })}
      />
      {/* After the field, so the submitted address reads `?q=…&to=…` (spec 045 AC-2). */}
      {form.to === undefined ? null : (
        <input name={SEARCH_PARAM.to} type="hidden" value={form.to} />
      )}
      <button
        className="bg-ink text-paper focus-visible:outline-focus inline-grid size-(--target-min) flex-none cursor-pointer place-items-center rounded-full border-0 p-0 focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-solid"
        type="submit"
      >
        <Icon name="search" size={20} strokeWidth={1.8} />
        <VisuallyHidden>{submit}</VisuallyHidden>
      </button>
    </form>
  );
}

export interface HeaderSearchFieldProps extends HeaderSearchLabels {
  readonly form: HeaderSearchFormModel;
  readonly locale: string;
  readonly value?: string;
  /** The suggestions island's words (`search.suggest.*`), resolved by the header. */
  readonly suggest: SearchSuggestLabels;
  readonly className?: string;
}

/**
 * The header's field: the form, and the suggestions listbox hanging 6 px under it once the island
 * has loaded (it overlays the page and moves nothing).
 */
export function HeaderSearchField({
  form,
  label,
  submit,
  locale,
  value,
  suggest,
  className,
}: HeaderSearchFieldProps): ReactElement {
  const idPrefix = "header-search";
  return (
    <div
      className={["relative min-w-0", className].filter(Boolean).join(" ")}
      data-fo-header-search-field=""
    >
      <HeaderSearchForm
        form={form}
        idPrefix={idPrefix}
        label={label}
        submit={submit}
        {...(value === undefined ? {} : { value })}
      />
      {SEARCH_CONFIG.suggestions ? (
        <AfterPaint island="search-suggest" on="paint">
          <SearchSuggestLoader
            endpoint={SEARCH_SUGGEST_PATH}
            inputId={headerSearchInputId(idPrefix)}
            labels={suggest}
            locale={locale}
            {...(form.to === undefined ? {} : { to: form.to })}
          />
        </AfterPaint>
      ) : null}
    </div>
  );
}
