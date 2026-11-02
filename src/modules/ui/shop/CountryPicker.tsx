/**
 * `CountryPicker`: the chooser's form (spec 004 §14 A-founder-2026-10-24a items 3 and 4.2; the
 * "Commerce structure" group of `docs/design/system/components.dc.html`, "The picker" and "The
 * picker · a remembered country"; `wireframes/choose-country-*.dc.html`; TASK-385).
 *
 * One GET form, native HTML, no script needed: with a remembered country a first "Continue to
 * {country}" button; one submit button per shop country (`name="to"`, the ISO code, at most
 * `PICKER_CHIPS`); the search field (`<input type="search" name="to" list="fo-countries">` over a
 * `<datalist>` of every registry country, live or not) with "Show prices"; under them the remember
 * line, the clear indication the cookie's exemption asks for (spec 004 "Compliance").
 *
 * **The field is the form's last control named `to`**, so the chooser reads the last non-empty
 * `to` (`chosenInput()` in the catalogue): a typed name wins over the default button that Enter in
 * the field also submits, and a button's code wins when nothing was typed.
 *
 * `variant="page"` is the chooser page's skin: no card, the label is the page's `<h1>` at 48 px
 * (32 px on a phone). The home's card and the selector's flat panel are the same form in another
 * skin; their tasks (TASK-386, TASK-384) add them here.
 *
 * `data-fo-choose` is the motion module's hook: with JavaScript on, the submit becomes
 * `location.replace()` of the same GET, so the chooser leaves the history (AC-79). With a
 * remembered country "Show prices" steps down to the outline skin, so one accent stays per form.
 *
 * Server-rendered, zero client JavaScript of its own; every string arrives resolved.
 */
import type { ReactElement } from "react";

import { QUERY_KEY } from "@/config/url-keys";

import { Icon } from "../icons/Icon.tsx";
import { PILL_ACCENT, PILL_SECONDARY } from "../primitives/Button.tsx";

/** One country button: its lowercase code (the form value) and its name in the page's locale. */
export interface CountryPickerChoice {
  readonly code: string;
  readonly name: string;
}

export interface CountryPickerProps {
  /** The chooser path of the page the visitor wanted, no country and no query. */
  readonly action: string;
  readonly variant: "page";
  /** `home.picker.label`. */
  readonly label: string;
  /** `home.picker.search`: the field's label and its placeholder. */
  readonly searchLabel: string;
  /** `home.picker.submit`. */
  readonly submitLabel: string;
  /** `shop.choose.remember`. */
  readonly rememberLine: string;
  /** The remembered shop country and its resolved `shop.choose.continue`. */
  readonly continueTo?:
    (CountryPickerChoice & { readonly label: string }) | undefined;
  readonly chips: readonly CountryPickerChoice[];
  /** Every registry country's name, in the one country order. */
  readonly datalist: readonly string[];
  /** What the visitor typed, shown back in the field (the no-match state). */
  readonly typed?: string | undefined;
  /** Prefix of the form's ids, unique on the page. */
  readonly idPrefix: string;
}

/** The pill both submit buttons share (`.cm-pbtn`). */
const PILL =
  "inline-flex items-center justify-center gap-[8px] rounded-full font-bold text-ui whitespace-nowrap cursor-pointer";
const ACCENT = `${PILL} ${PILL_ACCENT} bg-accent text-on-accent`;
const OUTLINE = `${PILL} ${PILL_SECONDARY} bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]`;

/** `.cm-chip`: a 44 px pill on paper with a hairline, bold. */
const CHIP =
  "inline-flex flex-none items-center min-h-(--target-min) px-[16px] rounded-full bg-paper text-ink font-bold text-ui whitespace-nowrap cursor-pointer shadow-[inset_0_0_0_1px_var(--color-rule)] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]";

export function CountryPicker({
  action,
  label,
  searchLabel,
  submitLabel,
  rememberLine,
  continueTo,
  chips,
  datalist,
  typed,
  idPrefix,
}: CountryPickerProps): ReactElement {
  const headingId = `${idPrefix}-l`;
  const fieldId = `${idPrefix}-to`;
  const listId = "fo-countries";
  return (
    <form
      action={action}
      method="get"
      aria-labelledby={headingId}
      data-fo-choose=""
    >
      <h1
        id={headingId}
        className="display mb-[16px] block text-[32px] leading-[1.05] [font-variation-settings:var(--font-variation-display)] md:mb-[22px] md:text-[48px]"
      >
        {label}
      </h1>
      {continueTo === undefined ? null : (
        <div className="mb-[12px]">
          <button
            type="submit"
            name={QUERY_KEY.to}
            value={continueTo.code}
            className={`${ACCENT} min-h-[50px] px-[28px]`}
            data-fo-pending=""
            data-fo-choose-continue={continueTo.code}
          >
            {continueTo.label}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-[8px]">
        {chips.map((chip) => (
          <button
            key={chip.code}
            type="submit"
            name={QUERY_KEY.to}
            value={chip.code}
            className={CHIP}
            data-fo-choose-chip={chip.code}
          >
            {chip.name}
          </button>
        ))}
      </div>
      <div className="mt-[10px] flex gap-[10px] md:mt-[12px]">
        <label className="sr-only" htmlFor={fieldId}>
          {searchLabel}
        </label>
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            size={18}
            className="text-ink-2 pointer-events-none absolute start-[14px] top-1/2 -translate-y-1/2"
          />
          <input
            id={fieldId}
            type="search"
            name={QUERY_KEY.to}
            list={listId}
            autoComplete="off"
            placeholder={searchLabel}
            defaultValue={typed}
            className="rounded-field border-field-edge bg-card text-ui text-ink placeholder:text-ink-3 block min-h-(--field-height) w-full border-[1.5px] border-solid ps-[42px] pe-[14px]"
          />
        </div>
        <button
          type="submit"
          className={`${continueTo === undefined ? ACCENT : OUTLINE} min-h-[46px] px-[24px]`}
          data-fo-pending=""
        >
          {submitLabel}
        </button>
      </div>
      <datalist id={listId}>
        {datalist.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="text-ink-3 mt-[10px] max-w-[76ch] text-xs leading-[1.4]">
        {rememberLine}
      </p>
    </form>
  );
}
