/**
 * `fo/no-raw-color` (spec 004 §2 "Tokens", AC-1, T-02; TASK-045).
 *
 * The token analogue of `fo/no-physical-css`: **one place to change a colour.** Flags
 *
 *   - arbitrary-value colour utilities in `className`/`class` — `bg-[#ff0000]`, `text-[rgb(0,0,0)]`,
 *     `border-[hsl(210_10%_50%)]`, `shadow-[0_1px_2px_rgba(0,0,0,.2)]`;
 *   - hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` and `color-mix()` literals
 *     anywhere in a class string or in a class helper (`clsx`, `cva`, `cn`, `twMerge`, …);
 *   - the same literals in a `style` attribute's values, which is the other way a component can
 *     paint itself outside the token system.
 *
 * The tokens themselves live in the `@theme` block of `src/app/globals.css` and are the only
 * colour literals in the repository (Stylelint's `color-no-hex` and the colour-property
 * `declaration-property-value-disallowed-list` hold the CSS side; a `@theme` custom property is
 * exempt by construction because its property name is `--color-*` and not `color`/`background`).
 * So this rule needs no path allowlist: a component has no legitimate reason to name a colour, and
 * `var(--color-…)` is always available for the rare inline case.
 *
 * Not flagged: token utilities (`bg-accent`, `text-ink-muted`, `border-rule`), `var(--color-*)` in
 * a `style` value, and any non-JSX code — a regex, a test fixture string or a comment that happens
 * to contain `oklch(` is not a paint instruction. That is the same boundary `fo/no-literal-strings`
 * draws, and it is what keeps `src/modules/ui/tokens/contrast.ts` (which parses OKLCH) lintable.
 */

/**
 * Colour functions no component may call. `color-mix` included: it takes colours as arguments.
 *
 * The lookbehind is `(?<![a-z])` rather than `\b`, because Tailwind writes spaces as underscores
 * inside an arbitrary value (`shadow-[0_1px_2px_rgba(0,0,0,0.2)]`) and `_` is a word character —
 * so `\b` would not match there, which is exactly the shape §2 names.
 */
const COLOUR_FUNCTION =
  /(?<![a-z])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\s*\(/i;

/** A CSS hex colour: `#abc`, `#aabbcc`, `#aabbccdd`. */
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;

/** Tailwind arbitrary value on a colour-ish utility: `bg-[…]`, `text-[…]`, `ring-[…]`… */
const COLOUR_UTILITY_PREFIXES = [
  "bg-",
  "text-",
  "border-",
  "border-s-",
  "border-e-",
  "border-t-",
  "border-b-",
  "divide-",
  "outline-",
  "ring-",
  "ring-offset-",
  "shadow-",
  "fill-",
  "stroke-",
  "accent-",
  "caret-",
  "decoration-",
  "from-",
  "via-",
  "to-",
];

const CLASS_HELPERS = new Set([
  "cva",
  "clsx",
  "cn",
  "classNames",
  "twMerge",
  "twJoin",
]);

/**
 * The raw colour a class token or a style value carries, or `null`.
 * @param {string} value
 * @returns {string | null}
 */
export function findRawColour(value) {
  const hex = HEX_COLOUR.exec(value);
  if (hex !== null) return hex[0];
  const fn = COLOUR_FUNCTION.exec(value);
  if (fn !== null) return fn[0].replace(/\s*\($/, "()");
  return null;
}

/**
 * An arbitrary-value colour utility (`bg-[…]` with anything colour-shaped inside), or `null`.
 * @param {string} token a single whitespace-delimited class token
 * @returns {string | null}
 */
export function findArbitraryColourUtility(token) {
  let base = token;
  const lastColon = base.lastIndexOf(":");
  if (lastColon !== -1) base = base.slice(lastColon + 1);
  base = base.replace(/^-/, "").replace(/!/g, "");
  const open = base.indexOf("[");
  if (open === -1 || !base.endsWith("]")) return null;
  const prefix = base.slice(0, open);
  if (!COLOUR_UTILITY_PREFIXES.includes(prefix)) return null;
  const inner = base.slice(open + 1, -1);
  return findRawColour(inner) === null ? null : token;
}

/**
 * Every offence in a whole class string.
 * @param {string} value
 * @returns {string[]}
 */
export function findRawColoursInClassValue(value) {
  /** @type {string[]} */
  const found = [];
  for (const token of value.split(/\s+/)) {
    if (token === "") continue;
    const arbitrary = findArbitraryColourUtility(token);
    if (arbitrary !== null) {
      found.push(arbitrary);
      continue;
    }
    const raw = findRawColour(token);
    if (raw !== null) found.push(token);
  }
  return found;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow raw colours in components; colours come from the @theme tokens in src/app/globals.css",
    },
    schema: [],
    messages: {
      rawColour:
        "Raw colour {{ found }} is not allowed outside the @theme block of src/app/globals.css (spec 004 §2). Use a token utility (`bg-accent`, `text-ink-muted`, `border-rule`) or `var(--color-…)`.",
    },
  },
  create(context) {
    /**
     * @param {import("estree").Node} node
     * @param {string[]} found
     */
    function report(node, found) {
      if (found.length === 0) return;
      context.report({
        node,
        messageId: "rawColour",
        data: { found: found.map((token) => `"${token}"`).join("; ") },
      });
    }

    /**
     * Walks a class-helper argument or a class attribute value.
     * @param {any} node
     */
    function checkClassExpression(node) {
      if (node === null || node === undefined) return;
      if (node.type === "Literal" && typeof node.value === "string") {
        report(node, findRawColoursInClassValue(node.value));
        return;
      }
      if (node.type === "TemplateLiteral") {
        const value = node.quasis
          .map((/** @type {any} */ quasi) => quasi.value.cooked ?? "")
          .join(" ");
        report(node, findRawColoursInClassValue(value));
        return;
      }
      if (node.type === "ArrayExpression") {
        for (const element of node.elements) checkClassExpression(element);
        return;
      }
      if (node.type === "ObjectExpression") {
        for (const property of node.properties) {
          if (property.type !== "Property") continue;
          checkClassExpression(property.key);
          checkClassExpression(property.value);
        }
        return;
      }
      if (node.type === "ConditionalExpression") {
        checkClassExpression(node.consequent);
        checkClassExpression(node.alternate);
        return;
      }
      if (node.type === "LogicalExpression") {
        checkClassExpression(node.left);
        checkClassExpression(node.right);
      }
    }

    /**
     * Walks a `style={{ … }}` object: only the *values* can carry a colour.
     * @param {any} node
     */
    function checkStyleExpression(node) {
      if (node === null || node === undefined) return;
      if (node.type === "Literal" && typeof node.value === "string") {
        const raw = findRawColour(node.value);
        if (raw !== null) report(node, [node.value]);
        return;
      }
      if (node.type === "TemplateLiteral") {
        const value = node.quasis
          .map((/** @type {any} */ quasi) => quasi.value.cooked ?? "")
          .join(" ");
        const raw = findRawColour(value);
        if (raw !== null) report(node, [value]);
        return;
      }
      if (node.type === "ObjectExpression") {
        for (const property of node.properties) {
          if (property.type !== "Property") continue;
          checkStyleExpression(property.value);
        }
        return;
      }
      if (node.type === "ConditionalExpression") {
        checkStyleExpression(node.consequent);
        checkStyleExpression(node.alternate);
        return;
      }
      if (node.type === "LogicalExpression") {
        checkStyleExpression(node.left);
        checkStyleExpression(node.right);
      }
    }

    return {
      JSXAttribute(/** @type {any} */ node) {
        const name =
          node.name?.type === "JSXIdentifier" ? node.name.name : null;
        if (name === null) return;
        const value = node.value;
        if (value === null) return;
        const expression =
          value.type === "JSXExpressionContainer" ? value.expression : value;
        if (name === "className" || name === "class") {
          checkClassExpression(expression);
          return;
        }
        if (name === "style") checkStyleExpression(expression);
      },
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : null;
        if (name === null || !CLASS_HELPERS.has(name)) return;
        for (const argument of node.arguments) checkClassExpression(argument);
      },
    };
  },
};

export default rule;
