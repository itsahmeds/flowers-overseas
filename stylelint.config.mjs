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

/** @type {import("stylelint").Config} */
const config = {
  // The rule fixtures under `tests/fixtures/lint/` are outside the main run because `lint:css`
  // globs `src/**/*.css`; `lint:fixtures` points Stylelint at them deliberately.
  ignoreFiles: ["**/node_modules/**", ".next/**", "coverage/**"],
  rules: {
    "property-disallowed-list": DISALLOWED_PROPERTIES,
    "declaration-property-value-disallowed-list": {
      "text-align": ["left", "right"],
    },
  },
};

export default config;
