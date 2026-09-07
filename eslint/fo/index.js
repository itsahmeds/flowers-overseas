/**
 * Local ESLint plugin `fo` (spec 001 §5). Plain ESM JavaScript with JSDoc types so
 * `eslint.config.mjs` can import it directly, with no build step and no published package.
 *
 * Rules owned by TASK-003: `no-physical-css`, `no-literal-strings`.
 * TASK-004 adds `no-direct-order-status-write`, `no-geo-redirect`, `no-float-money`.
 */
import noLiteralStrings from "./no-literal-strings.js";
import noPhysicalCss from "./no-physical-css.js";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "eslint-plugin-fo", version: "0.1.0" },
  rules: {
    "no-physical-css": noPhysicalCss,
    "no-literal-strings": noLiteralStrings,
  },
};

export default plugin;
