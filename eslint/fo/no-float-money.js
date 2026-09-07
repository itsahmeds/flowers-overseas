/**
 * `fo/no-float-money` (spec 001 §2, §5 line "fails on identifiers matching
 * /(price|amount|total|payout|fee)/i typed or initialised as number with a decimal literal, or
 * passed to parseFloat/toFixed; allows *_minor/*Minor names"; §7, §8; plan/12 §2 "Money").
 *
 * Money is stored and computed in **minor units** (integer cents) so that "price shown = price
 * charged" survives rounding, currency conversion and VAT. A binary float amount silently loses
 * cents; `parseFloat` / `toFixed` are the two idioms that introduce one.
 *
 * Flagged when the name matches `/(price|amount|total|payout|fee)/i` and does not end in
 * `_minor` / `Minor`:
 *   1. a `number` type annotation (`let total: number`, `(fee: number) => …`, `price: number` in
 *      an interface or class);
 *   2. initialisation with a decimal numeric literal (`const price = 12.5`, `{ fee: -1.5 }`);
 *   3. the identifier passed to `parseFloat(…)` / `Number.parseFloat(…)`, or `…toFixed(…)`
 *      called on it.
 *
 * **Not enabled in `eslint.config.mjs` in spec 001** (§2: "Lint fixture only in 001; enforced on
 * real code from 005"), because no money code exists yet and the money vocabulary — the exact
 * `*_minor` column and field names — is fixed by spec 005. The rule ships complete and unit
 * tested here so that 005 only flips it on.
 */

export const MONEY_NAME = /(price|amount|total|payout|fee)/i;

/** Names that are already minor units, and therefore integers by contract. */
export const MINOR_SUFFIX = /(_minor|Minor)$/;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isMoneyName(name) {
  return MONEY_NAME.test(name) && !MINOR_SUFFIX.test(name);
}

/**
 * @param {any} node
 * @returns {boolean} true for a numeric literal with a fractional part, incl. `-1.5`
 */
export function isDecimalLiteral(node) {
  if (node === null || node === undefined) return false;
  if (
    node.type === "UnaryExpression" &&
    (node.operator === "-" || node.operator === "+")
  ) {
    return isDecimalLiteral(node.argument);
  }
  if (node.type !== "Literal" || typeof node.value !== "number") return false;
  const raw = typeof node.raw === "string" ? node.raw : String(node.value);
  return raw.includes(".") || !Number.isInteger(node.value);
}

/**
 * @param {any} node
 * @returns {boolean} true when the annotation is the `number` primitive (or `number | undefined`)
 */
function isNumberAnnotation(node) {
  if (node === null || node === undefined) return false;
  const annotation =
    node.type === "TSTypeAnnotation" ? node.typeAnnotation : node;
  if (annotation === null || annotation === undefined) return false;
  if (annotation.type === "TSNumberKeyword") return true;
  if (annotation.type === "TSUnionType") {
    return annotation.types.some((/** @type {any} */ t) =>
      isNumberAnnotation(t),
    );
  }
  return false;
}

/**
 * The name a member expression hangs off: `order.total.toFixed()` → `total`.
 * @param {any} node
 * @returns {string | null}
 */
function nameOf(node) {
  if (node === null || node === undefined) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) {
    return node.property.type === "Identifier" ? node.property.name : null;
  }
  if (node.type === "TSNonNullExpression" || node.type === "AwaitExpression") {
    return nameOf(node.expression ?? node.argument);
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow float money: name money values in minor units (*_minor) and keep them integers",
    },
    schema: [],
    messages: {
      annotation:
        "`{{ name }}` is money typed as `number`. Store and compute money in integer minor units (`{{ name }}_minor`) — plan/12 §2.",
      decimal:
        "`{{ name }}` is money initialised with a decimal literal. Store and compute money in integer minor units (`{{ name }}_minor`) — plan/12 §2.",
      parseFloat:
        "`parseFloat` on money `{{ name }}`. Parse minor units as an integer instead (plan/12 §2).",
      toFixed:
        "`toFixed` on money `{{ name }}`. Format money with `Intl.NumberFormat` from integer minor units (plan/12 §2).",
    },
  },
  create(context) {
    /** Nodes already reported, so an annotated *and* decimal declaration reports once. */
    const reported = new WeakSet();

    /**
     * @param {any} node
     * @param {"annotation" | "decimal" | "parseFloat" | "toFixed"} messageId
     * @param {string} name
     */
    function report(node, messageId, name) {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data: { name } });
    }

    /**
     * A declaration-like node with a name, an optional annotation and an optional value.
     * @param {any} node
     * @param {any} keyNode
     * @param {any} annotation
     * @param {any} value
     */
    function checkDeclaration(node, keyNode, annotation, value) {
      const name = keyNode?.type === "Identifier" ? keyNode.name : null;
      if (name === null || !isMoneyName(name)) return;
      if (isDecimalLiteral(value)) {
        report(node, "decimal", name);
        return;
      }
      if (isNumberAnnotation(annotation)) report(node, "annotation", name);
    }

    return {
      VariableDeclarator(/** @type {any} */ node) {
        checkDeclaration(node, node.id, node.id?.typeAnnotation, node.init);
      },
      Property(/** @type {any} */ node) {
        if (node.computed) return;
        checkDeclaration(node, node.key, undefined, node.value);
      },
      PropertyDefinition(/** @type {any} */ node) {
        if (node.computed) return;
        checkDeclaration(node, node.key, node.typeAnnotation, node.value);
      },
      TSPropertySignature(/** @type {any} */ node) {
        if (node.computed) return;
        checkDeclaration(node, node.key, node.typeAnnotation, undefined);
      },
      Identifier(/** @type {any} */ node) {
        // function parameters and any other annotated binding
        if (node.typeAnnotation === undefined || node.typeAnnotation === null) {
          return;
        }
        // declarations and members are handled by their own visitor, which also sees the
        // initialiser; reporting here as well would double-count `const price: number = 12.5`.
        const parent = node.parent;
        if (
          parent !== undefined &&
          parent !== null &&
          ((parent.type === "VariableDeclarator" && parent.id === node) ||
            ((parent.type === "Property" ||
              parent.type === "PropertyDefinition" ||
              parent.type === "TSPropertySignature") &&
              parent.key === node))
        ) {
          return;
        }
        if (!isMoneyName(node.name)) return;
        if (!isNumberAnnotation(node.typeAnnotation)) return;
        report(node, "annotation", node.name);
      },
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        const calleeName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                !callee.computed &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : null;

        if (calleeName === "parseFloat") {
          for (const argument of node.arguments) {
            const name = nameOf(argument);
            if (name !== null && isMoneyName(name)) {
              report(node, "parseFloat", name);
              return;
            }
          }
          return;
        }

        if (calleeName === "toFixed" && callee.type === "MemberExpression") {
          const name = nameOf(callee.object);
          if (name !== null && isMoneyName(name)) {
            report(node, "toFixed", name);
          }
        }
      },
    };
  },
};

export default rule;
