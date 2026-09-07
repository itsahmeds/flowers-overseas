/**
 * `fo/no-physical-css` (spec 001 §5 lint design, §7 "Logical CSS / RTL"; plan/03 §4, §12).
 *
 * Flags physical-direction Tailwind utilities in `className`/`class` attribute values and in
 * `cva`/`clsx`/`cn`/`classNames`/`twMerge` arguments, and names the logical replacement in the
 * message. Variants (`md:`, `hover:focus:`), negatives (`-mr-2`) and the `!` important marker
 * are stripped before matching, so `md:-mr-2` is caught the same way as `mr-2`.
 *
 * Logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`,
 * `rounded-s-`, `border-s-`, …) are never flagged.
 */

/** Utilities matched on their exact name. */
const EXACT = new Map([
  ["text-left", "text-start"],
  ["text-right", "text-end"],
  ["rounded-l", "rounded-s"],
  ["rounded-r", "rounded-e"],
  ["rounded-tl", "rounded-ss"],
  ["rounded-tr", "rounded-se"],
  ["rounded-bl", "rounded-es"],
  ["rounded-br", "rounded-ee"],
  ["border-l", "border-s"],
  ["border-r", "border-e"],
]);

/** Utilities matched on their `prefix-` head; the value after the head is preserved. */
const PREFIXES = [
  ["scroll-ml-", "scroll-ms-"],
  ["scroll-mr-", "scroll-me-"],
  ["scroll-pl-", "scroll-ps-"],
  ["scroll-pr-", "scroll-pe-"],
  ["rounded-tl-", "rounded-ss-"],
  ["rounded-tr-", "rounded-se-"],
  ["rounded-bl-", "rounded-es-"],
  ["rounded-br-", "rounded-ee-"],
  ["rounded-l-", "rounded-s-"],
  ["rounded-r-", "rounded-e-"],
  ["border-l-", "border-s-"],
  ["border-r-", "border-e-"],
  ["ml-", "ms-"],
  ["mr-", "me-"],
  ["pl-", "ps-"],
  ["pr-", "pe-"],
  ["left-", "start-"],
  ["right-", "end-"],
  ["inset-x-", "start-* and end-*"],
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
 * Strips variants (`md:hover:`), the negative sign and the `!` important marker.
 * @param {string} token
 * @returns {{ base: string, negative: boolean }}
 */
function normalise(token) {
  let base = token;
  const lastColon = base.lastIndexOf(":");
  if (lastColon !== -1) base = base.slice(lastColon + 1);
  base = base.replace(/!/g, "");
  const negative = base.startsWith("-");
  if (negative) base = base.slice(1);
  return { base, negative };
}

/**
 * @param {string} token a single whitespace-delimited class token
 * @returns {{ token: string, suggestion: string } | null}
 */
export function findPhysicalUtility(token) {
  const { base, negative } = normalise(token);
  if (base === "") return null;

  const exact = EXACT.get(base);
  if (exact !== undefined) {
    return { token, suggestion: `${negative ? "-" : ""}${exact}` };
  }

  for (const [prefix, replacement] of PREFIXES) {
    if (!base.startsWith(prefix)) continue;
    const rest = base.slice(prefix.length);
    const suggestion = replacement.includes("*")
      ? replacement
      : `${negative ? "-" : ""}${replacement}${rest}`;
    return { token, suggestion };
  }

  return null;
}

/**
 * @param {string} value a whole class string, e.g. `"ml-4 md:-mr-2"`
 * @returns {{ token: string, suggestion: string }[]}
 */
export function findPhysicalUtilities(value) {
  /** @type {{ token: string, suggestion: string }[]} */
  const found = [];
  for (const token of value.split(/\s+/)) {
    const hit = findPhysicalUtility(token);
    if (hit !== null) found.push(hit);
  }
  return found;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow physical-direction Tailwind utilities; use logical utilities so RTL locales work without overrides",
    },
    schema: [],
    messages: {
      physical:
        "Physical CSS utility {{ found }} is not allowed (plan/03 §4). Use the logical equivalent instead.",
    },
  },
  create(context) {
    /**
     * @param {import("estree").Node} node
     * @param {string} value
     */
    function check(node, value) {
      const found = findPhysicalUtilities(value);
      if (found.length === 0) return;
      context.report({
        node,
        messageId: "physical",
        data: {
          found: found
            .map((f) => `"${f.token}" -> "${f.suggestion}"`)
            .join("; "),
        },
      });
    }

    /**
     * Walks a class-helper argument: strings, template literals, arrays and object keys.
     * @param {any} node
     */
    function checkExpression(node) {
      if (node === null || node === undefined) return;
      if (node.type === "Literal" && typeof node.value === "string") {
        check(node, node.value);
        return;
      }
      if (node.type === "TemplateLiteral") {
        const value = node.quasis
          .map((/** @type {any} */ q) => q.value.cooked ?? "")
          .join(" ");
        check(node, value);
        return;
      }
      if (node.type === "ArrayExpression") {
        for (const element of node.elements) checkExpression(element);
        return;
      }
      if (node.type === "ObjectExpression") {
        for (const property of node.properties) {
          if (property.type !== "Property") continue;
          checkExpression(property.key);
        }
        return;
      }
      if (node.type === "ConditionalExpression") {
        checkExpression(node.consequent);
        checkExpression(node.alternate);
        return;
      }
      if (node.type === "LogicalExpression") {
        checkExpression(node.left);
        checkExpression(node.right);
      }
    }

    return {
      JSXAttribute(/** @type {any} */ node) {
        const name =
          node.name?.type === "JSXIdentifier" ? node.name.name : null;
        if (name !== "className" && name !== "class") return;
        const value = node.value;
        if (value === null) return;
        if (value.type === "Literal") {
          checkExpression(value);
          return;
        }
        if (value.type === "JSXExpressionContainer") {
          checkExpression(value.expression);
        }
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
        for (const argument of node.arguments) checkExpression(argument);
      },
    };
  },
};

export default rule;
