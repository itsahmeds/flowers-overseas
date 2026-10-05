/**
 * The checkout primitives' shared class strings (spec 010 §5.3; `docs/design/wireframes/
 * checkout-{desktop,mobile}.dc.html` and `docs/design/system/components.dc.html` "Checkout";
 * TASK-201).
 *
 * One place for the board's `.btn`, `.fld`, `.input`, `.s10-alert` and friends, written against
 * the `@theme` tokens of `src/app/globals.css` (no raw colour, logical properties only). The
 * button skin mirrors `primitives/Button.tsx` token for token: the checkout needs `name`, `value`,
 * `form` and `formAction` on its submits (the sample-details button, the sticky bar's action that
 * submits the step's form from outside it), which `Button` does not take, and this module may not
 * edit the shared primitive. A later task that teaches `Button` those attributes deletes the
 * copy here.
 *
 * **Sizes are the binding ones** (§5.3 "Form quality"): every input is `text-ui` (16 px, so iOS
 * does not zoom) and at least `--field-height` tall; every control is at least `--target-min`
 * (44 px) in both directions.
 */

/** The board's `.btn` base: pill, bold, at least 44 px. */
const BUTTON_BASE =
  "inline-flex min-h-(--target-min) min-w-(--target-min) cursor-pointer items-center justify-center gap-[10px] rounded-full font-bold leading-[1.15] text-center transition-colors motion-fast ease-standard select-none focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid focus-visible:outline-focus";

/** The three skins the checkout boards draw. */
export const BUTTON_SKINS = {
  /** Poppy: the step's primary action. */
  primary:
    "bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-strong",
  /** Ink outline: "Use sample details", "Back to …". */
  ghost:
    "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] hover:bg-paper-2",
  /** In progress (`useFormStatus`): the strong poppy, still focusable. */
  busy: "bg-accent-strong text-on-accent",
} as const;

export type ButtonSkin = keyof typeof BUTTON_SKINS;

/** Heights and type of the three button sizes the boards use. */
export const BUTTON_SIZES = {
  /** `.btn`: 52 px, body-s. */
  md: "min-h-(--control-md) px-[28px] text-body-s",
  /** `.s10-priv .btn`, `.s10-alert .btn`: 44 px, 16 px type. */
  sm: "min-h-(--control-sm) px-[20px] text-ui",
  /** `.s10-place .btn`: the full-width place control, 19 px type, wraps when it must. */
  send: "min-h-(--control-send) w-full px-[28px] py-[10px] text-[19px]",
  /** `.s10-bar .btn`: the sticky bar's action, 52 px, wraps. */
  bar: "min-h-[52px] flex-1 px-[16px] text-ui",
} as const;

export type ButtonSize = keyof typeof BUTTON_SIZES;

/** The class string of a checkout button. */
export function buttonClass(
  skin: ButtonSkin,
  size: ButtonSize,
  extra?: string,
): string {
  return [BUTTON_BASE, BUTTON_SKINS[skin], BUTTON_SIZES[size], extra]
    .filter(Boolean)
    .join(" ");
}

/** `.fld`: label above, control, then hint, warning and error. */
export const FIELD = "grid min-w-0 gap-[6px]";

/** `.fld label`. */
export const FIELD_LABEL = "text-sm font-bold text-ink";

/** `.fld .opt`: "optional", in the label, in body weight. */
export const FIELD_OPTIONAL = "font-normal text-ink-3";

/**
 * `.input`: 16 px type, at least 50 px tall (the board's `.fld .input`), the field edge, the card
 * fill. The error state replaces the edge with a 2 px danger ring **and** the field gets a text
 * message with a "!" mark (`FIELD_ERROR`), so the error is never colour alone (AC-14).
 */
export const INPUT =
  "block w-full min-h-[50px] rounded-field border-[1.5px] border-solid border-field-edge bg-card px-[14px] py-[10px] text-ui text-ink placeholder:text-ink-3 focus:outline-[2.5px] focus:outline-offset-[3px] focus:outline-solid focus:outline-focus disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-danger)]";

/** The focus ring, forced, for the gallery's `focus` state (§2 of spec 004: hover-equivalent). */
export const INPUT_FORCED_FOCUS =
  "outline-[2.5px] outline-offset-[3px] outline-solid outline-focus";

/** `.fld .hint`. */
export const FIELD_HINT = "m-0 text-sm leading-[1.35] text-ink-2";

/** `.s10-ferr`: bold danger text after a round "!" mark, which is text, not colour. */
export const FIELD_ERROR =
  "m-0 flex items-baseline gap-[8px] text-sm leading-[1.35] font-bold text-danger";

/** `.s10-ferr::before`: the "!" mark, a CSS glyph, ringed in forced colours. */
export const FIELD_ERROR_MARK =
  "inline-grid size-[18px] flex-none place-items-center rounded-full bg-danger text-[12px] text-on-danger before:content-['!'] forced-colors:border forced-colors:border-solid";

/** `.s10-fwarn`: ink text after a round "i" mark on the warning fill. */
export const FIELD_WARNING =
  "m-0 flex items-baseline gap-[8px] text-sm leading-[1.35] text-ink";

/** `.s10-fwarn::before`: the "i" mark, a CSS glyph, ringed in forced colours. */
export const FIELD_WARNING_MARK =
  "inline-grid size-[18px] flex-none place-items-center rounded-full bg-warning text-[12px] font-bold text-on-warning before:content-['i'] forced-colors:border forced-colors:border-solid";

/** `.s10-alert`: blush, for what blocks the step. */
export const NOTICE_BLOCKING =
  "grid gap-[12px] rounded-field bg-blush px-[18px] py-[16px] text-ui leading-[1.45] text-ink";

/** `.s10-alert.calm` and `.s10-priv`: paper, for what informs. */
export const NOTICE_CALM =
  "grid gap-[12px] rounded-field bg-paper-2 px-[18px] py-[16px] text-ui leading-[1.45] text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]";

/** The money figure in the recap and the sticky bar: lining, tabular numerals. */
export const MONEY_FIGURE =
  "font-display font-(--font-weight-display) [font-variant-numeric:lining-nums_tabular-nums]";
