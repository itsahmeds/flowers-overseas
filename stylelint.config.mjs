/**
 * Stylelint (spec 001 §2 "Repository and toolchain", §7 "Logical CSS / RTL"; plan/03 §4, TASK-003).
 *
 * Companion to `fo/no-physical-css`: the ESLint rule covers Tailwind utilities in TSX, this covers
 * hand-written CSS. Only the direction bans are configured — no shared preset — so Tailwind v4
 * at-rules (`@import "tailwindcss"`, `@theme`, `@apply`) pass untouched and the failure output of
 * `pnpm lint:css` is exactly the rule this project cares about.
 *
 * Spec §5 names the rule `declaration-property-disallowed-list`, which does not exist in Stylelint
 * (17.x). The equivalent pair is used instead: `property-disallowed-list` for whole properties and
 * `declaration-property-value-disallowed-list` for `text-align: left|right`.
 *
 * Spec 004 §2 / AC-1 (TASK-045) adds the colour half: `color-no-hex` plus raw colour *functions*
 * banned on every colour-bearing property, so a component stylesheet cannot paint outside the
 * token system. **The `@theme` block of `src/app/globals.css` is exempt by construction, not by an
 * override**: its declarations are custom properties (`--color-paper: oklch(…)`), and
 * `declaration-property-value-disallowed-list` keys on the property name — `color`,
 * `background`, `border-*` — so a token declaration is never matched, while `color: #26282f`
 * anywhere (including in that same file) is. `color-no-hex` applies everywhere with no exception,
 * which is why every token is written in OKLCH.
 */

/** Physical properties banned in favour of their logical equivalents. */
export const DISALLOWED_PROPERTIES = [
  "margin-left",
  "margin-right",
  "padding-left",
  "padding-right",
  "left",
  "right",
  "/^border-left/",
  "/^border-right/",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "scroll-margin-left",
  "scroll-margin-right",
  "scroll-padding-left",
  "scroll-padding-right",
];

/**
 * Properties that carry a colour, and the raw-colour patterns banned on them (spec 004 AC-1).
 * `color-mix()` is included because it takes colours as arguments; a token-only `color-mix` is
 * still allowed since its arguments are `var(--color-…)` and the pattern below matches the raw
 * forms only.
 */
export const RAW_COLOUR_PATTERNS = [
  "/#[0-9a-fA-F]{3,8}/",
  "/\\brgba?\\(/",
  "/\\bhsla?\\(/",
  "/\\bhwb\\(/",
  "/\\boklch\\(/",
  "/\\boklab\\(/",
  "/\\blab\\(/",
  "/\\blch\\(/",
];

/** Every property a colour can be written on. */
export const COLOUR_PROPERTIES = [
  "color",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-color",
  "border-block",
  "border-block-color",
  "border-block-start",
  "border-block-start-color",
  "border-block-end",
  "border-block-end-color",
  "border-inline",
  "border-inline-color",
  "border-inline-start",
  "border-inline-start-color",
  "border-inline-end",
  "border-inline-end-color",
  "outline",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "text-decoration-color",
  "fill",
  "stroke",
  "caret-color",
  "accent-color",
  "column-rule-color",
];

/** @type {import("stylelint").Config} */
const config = {
  // The rule fixtures under `tests/fixtures/lint/` are outside the main run because `lint:css`
  // globs `src/**/*.css`; `lint:fixtures` points Stylelint at them deliberately.
  ignoreFiles: ["**/node_modules/**", ".next/**", "coverage/**"],
  rules: {
    "property-disallowed-list": DISALLOWED_PROPERTIES,
    "color-no-hex": true,
    "declaration-property-value-disallowed-list": {
      "text-align": ["left", "right"],
      ...Object.fromEntries(
        COLOUR_PROPERTIES.map((property) => [property, RAW_COLOUR_PATTERNS]),
      ),
    },
  },
};

export default config;
