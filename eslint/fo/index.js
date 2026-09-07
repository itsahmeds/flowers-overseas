/**
 * Local ESLint plugin `fo` (spec 001 §5). Plain ESM JavaScript with JSDoc types so
 * `eslint.config.mjs` can import it directly, with no build step and no published package.
 *
 * | Rule | Owner task | Enabled on `src/**` |
 * |---|---|---|
 * | `no-physical-css` | TASK-003 | yes |
 * | `no-literal-strings` | TASK-003 | yes |
 * | `no-direct-order-status-write` | TASK-004 | yes |
 * | `no-geo-redirect` | TASK-004 | yes |
 * | `no-float-money` | TASK-004 | no — fixture and unit tested only in spec 001, enabled by spec 005 |
 */
import noDirectOrderStatusWrite from "./no-direct-order-status-write.js";
import noFloatMoney from "./no-float-money.js";
import noGeoRedirect from "./no-geo-redirect.js";
import noLiteralStrings from "./no-literal-strings.js";
import noPhysicalCss from "./no-physical-css.js";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "eslint-plugin-fo", version: "0.2.0" },
  rules: {
    "no-physical-css": noPhysicalCss,
    "no-literal-strings": noLiteralStrings,
    "no-direct-order-status-write": noDirectOrderStatusWrite,
    "no-geo-redirect": noGeoRedirect,
    "no-float-money": noFloatMoney,
  },
};

export default plugin;
