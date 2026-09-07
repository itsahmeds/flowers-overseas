/**
 * `fo/no-literal-strings` (spec 001 §5 lint design, §7 "Literal strings"; plan/03 §5).
 *
 * Flags user-facing literal copy in JSX: text nodes containing letters, and literal values of
 * the user-facing attributes below. Every such string must come from a message catalogue
 * (next-intl, spec 003) instead.
 *
 * Never flagged: non-JSX code (module constants, keys, log messages), structural attributes
 * (`className`, `href`, `src`, `id`, `type`, `rel`, `target`, `data-*`, …) and text with no
 * letters (punctuation, separators, whitespace).
 */

/** Attribute names whose literal value reaches a human. */
const TEXT_ATTRIBUTES = new Set([
  "alt",
  "title",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

/**
 * Structural attributes, listed for documentation and asserted by the rule tests. Any attribute
 * outside `TEXT_ATTRIBUTES` is allowed; this set is the explicit contract of spec 001 AC-5.
 */
export const ALLOWED_ATTRIBUTES = new Set([
  "className",
  "class",
  "href",
  "src",
  "id",
  "type",
  "rel",
  "target",
  "key",
  "name",
  "role",
  "htmlFor",
]);

const HAS_LETTER = /\p{L}/u;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isTextAttribute(name) {
  if (name.startsWith("data-")) return false;
  return TEXT_ATTRIBUTES.has(name);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isUserFacingText(value) {
  return HAS_LETTER.test(value);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow literal user-facing strings in JSX; use the message catalogue (next-intl) instead",
    },
    schema: [],
    messages: {
      text: "Literal user-facing text {{ text }} in JSX. Use a message key instead (plan/03 §5).",
      attribute:
        "Literal user-facing value {{ text }} on `{{ name }}`. Use a message key instead (plan/03 §5).",
    },
  },
  create(context) {
    /**
     * @param {any} node
     * @returns {string | null} the literal string this node carries, or null
     */
    function literalOf(node) {
      if (node === null || node === undefined) return null;
      if (node.type === "Literal" && typeof node.value === "string")
        return node.value;
      if (node.type === "JSXText" || node.type === "Text")
        return String(node.value);
      if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis
          .map((/** @type {any} */ q) => q.value.cooked ?? "")
          .join("");
      }
      return null;
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    function quote(value) {
      const trimmed = value.trim();
      return `"${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}"`;
    }

    return {
      JSXText(/** @type {any} */ node) {
        const value = String(node.value);
        if (!isUserFacingText(value)) return;
        context.report({
          node,
          messageId: "text",
          data: { text: quote(value) },
        });
      },
      JSXExpressionContainer(/** @type {any} */ node) {
        if (
          node.parent?.type !== "JSXElement" &&
          node.parent?.type !== "JSXFragment"
        )
          return;
        const value = literalOf(node.expression);
        if (value === null || !isUserFacingText(value)) return;
        context.report({
          node,
          messageId: "text",
          data: { text: quote(value) },
        });
      },
      JSXAttribute(/** @type {any} */ node) {
        const name =
          node.name?.type === "JSXNamespacedName"
            ? null
            : (node.name?.name ?? null);
        if (typeof name !== "string" || !isTextAttribute(name)) return;
        const value = node.value;
        if (value === null) return;
        const literal =
          value.type === "JSXExpressionContainer"
            ? literalOf(value.expression)
            : literalOf(value);
        if (literal === null || !isUserFacingText(literal)) return;
        context.report({
          node: value,
          messageId: "attribute",
          data: { name, text: quote(literal) },
        });
      },
    };
  },
};

export default rule;
