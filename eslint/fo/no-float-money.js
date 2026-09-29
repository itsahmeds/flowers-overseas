/**
 * `fo/no-float-money` (spec 001 §2, §14 A20 AC-58; spec 005 AC-4; plan/12 §2 "Money").
 *
 * Money is stored and computed in **integer minor units** so that "price shown = price charged"
 * survives rounding, currency conversion and VAT. A binary float amount silently loses cents.
 *
 * A **money name** has a money word (`MONEY_WORDS`) among its words, split on `_`, `-` and camel
 * case (clause 1). On a money name the rule reports:
 *   1. a `number` type annotation, unless the name ends in `Minor`/`_minor`, `Bp`/`_bp` or
 *      `Ppm`/`_ppm` (clause 2: those endings are whole numbers by contract);
 *   2. a decimal literal as its value — declaration, property, class field, default or
 *      assignment — whatever its ending (clause 2);
 *   3. a division whose left side mentions a money name, unless the whole division is the
 *      argument of `Math.round`/`Math.floor`/`Math.ceil`/`Math.trunc` (clause 3);
 *   4. money multiplied or divided by a decimal literal, rounded or not (clause 4);
 *   5. `Number(x)`, `parseInt(x)`, `Number.parseInt(x)` and unary `+x` when `x` is a money name
 *      or the result is assigned to one (clause 5);
 *   6. `parseFloat(…)` / `Number.parseFloat(…)` on it, or `…toFixed(…)` called on it.
 *
 * **What lint cannot see: values.** `const rate = 0.23; amountMinor * rate` passes, and so does
 * money under a name that is not a money word (`const p = priceMinor; p / 100`, `prices`). The
 * branded `Minor` type (spec 001 AC-59) is the check for those.
 *
 * Enabled on `src/`, `seed/` and `scripts/` by `eslint.config.mjs` (spec 005 AC-4) and allowed
 * off nowhere (spec 001 AC-50, AC-52).
 */

/**
 * AC-58 clause 1: the money words. A name is money when one of its words (see `nameWords`) is in
 * this set, so `shippingCost` and `vat_rate_bp` match and `feedback` and `coffee` do not.
 */
export const MONEY_WORDS = new Set([
  "price",
  "amount",
  "total",
  "payout",
  "fee",
  "cost",
  "vat",
  "subtotal",
  "surcharge",
  "discount",
  "refund",
  "gross",
  "net",
  "retail",
]);

/**
 * AC-58 clause 2: the whole-number endings — minor units, basis points, parts per million. A name
 * ending in one is an integer by contract, which exempts it from the `number`-type clause only.
 */
export const WHOLE_NUMBER_ENDINGS = new Set(["minor", "bp", "ppm"]);

/**
 * The lower-case words of a name, split on `_`, `-` (and any other non-letter) and camel case:
 * `deliveryFee_minor` → `delivery fee minor`, `VATRateBp` → `vat rate bp`.
 * @param {string} name
 * @returns {string[]}
 */
export function nameWords(name) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/**
 * @param {string} name
 * @returns {boolean} true when one of the name's words is a money word
 */
export function isMoneyName(name) {
  return nameWords(name).some((word) => MONEY_WORDS.has(word));
}

/**
 * @param {string} name
 * @returns {boolean} true when the name's last word is `minor`, `bp` or `ppm`
 */
export function hasWholeNumberEnding(name) {
  const words = nameWords(name);
  const last = words[words.length - 1];
  return last !== undefined && WHOLE_NUMBER_ENDINGS.has(last);
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

/** Wrappers that do not change which value an expression is. */
const TRANSPARENT = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ChainExpression",
]);

/** Nodes whose bodies are a different computation: a name inside one is not "mentioned". */
const OPAQUE = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

/** `Math.round` and friends: a division that is their whole argument is rounded to a whole. */
const ROUNDING = new Set(["round", "floor", "ceil", "trunc"]);

/**
 * @param {any} node
 * @returns {any} the node with transparent wrappers peeled off
 */
function unwrap(node) {
  let current = node;
  while (
    current !== null &&
    current !== undefined &&
    TRANSPARENT.has(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * @param {any} node
 * @returns {any} the nearest ancestor that is not a transparent wrapper
 */
function logicalParent(node) {
  let child = node;
  let parent = node.parent;
  while (
    parent !== null &&
    parent !== undefined &&
    TRANSPARENT.has(parent.type)
  ) {
    child = parent;
    parent = parent.parent;
  }
  return { child, parent };
}

/**
 * AC-58 clause 3's "mentions": every identifier and non-computed member name in an expression,
 * outside nested functions and classes, that is a money name.
 * @param {any} node
 * @param {Record<string, readonly string[]>} visitorKeys
 * @returns {string | null} the first money name found
 */
function mentionedMoneyName(node, visitorKeys) {
  if (node === null || node === undefined || typeof node.type !== "string") {
    return null;
  }
  if (OPAQUE.has(node.type)) return null;
  if (node.type === "Identifier") {
    return isMoneyName(node.name) ? node.name : null;
  }
  if (node.type === "PrivateIdentifier") {
    return isMoneyName(node.name) ? node.name : null;
  }
  for (const key of visitorKeys[node.type] ?? []) {
    if (
      key === "typeAnnotation" ||
      key === "typeArguments" ||
      key === "typeParameters"
    ) {
      continue;
    }
    const value = node[key];
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      const found = mentionedMoneyName(child, visitorKeys);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * @param {any} node a CallExpression
 * @returns {boolean} true for `Math.round(…)`, `Math.floor(…)`, `Math.ceil(…)`, `Math.trunc(…)`
 */
function isRoundingCall(node) {
  const callee = unwrap(node.callee);
  return (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Math" &&
    callee.property.type === "Identifier" &&
    ROUNDING.has(callee.property.name)
  );
}

/**
 * @param {any} node
 * @returns {string | null} `Number`, `parseInt`, `parseFloat`, `toFixed`… — the called name
 */
function calleeName(node) {
  const callee = unwrap(node.callee);
  if (callee?.type === "Identifier") return callee.name;
  if (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

/**
 * @param {any} node a CallExpression
 * @returns {boolean} true for `Number(x)`, `parseInt(x)` and `Number.parseInt(x)`
 */
function isTextToNumberCall(node) {
  const callee = unwrap(node.callee);
  if (callee?.type === "Identifier") {
    return callee.name === "Number" || callee.name === "parseInt";
  }
  return (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Number" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "parseInt"
  );
}

/**
 * The name a value is assigned to, when `node` is the whole value: `const priceMinor = <node>`,
 * `priceMinor = <node>`, `{ priceMinor: <node> }`, `class { priceMinor = <node> }`.
 * @param {any} node
 * @returns {string | null}
 */
function assignedName(node) {
  const { child, parent } = logicalParent(node);
  if (parent === null || parent === undefined) return null;
  if (parent.type === "VariableDeclarator" && parent.init === child) {
    return nameOf(parent.id);
  }
  if (
    parent.type === "AssignmentExpression" &&
    parent.operator === "=" &&
    parent.right === child
  ) {
    return nameOf(parent.left);
  }
  if (parent.type === "AssignmentPattern" && parent.right === child) {
    return nameOf(parent.left);
  }
  if (
    (parent.type === "Property" || parent.type === "PropertyDefinition") &&
    !parent.computed &&
    parent.value === child
  ) {
    return nameOf(parent.key);
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow float money: name money values in minor units (*Minor) and keep them integers",
    },
    schema: [],
    messages: {
      annotation:
        "`{{ name }}` is money typed as `number`. Store and compute money in integer minor units (`…Minor`), rates in whole basis points (`…Bp`) — plan/12 §2.",
      decimal:
        "`{{ name }}` is money initialised with a decimal literal. Money is integer minor units (`…Minor`) and rates whole basis points (`…Bp`) — plan/12 §2.",
      parseFloat:
        "`parseFloat` on money `{{ name }}`. Parse minor units as an integer instead (plan/12 §2).",
      toFixed:
        "`toFixed` on money `{{ name }}`. Format money with `Intl.NumberFormat` from integer minor units (plan/12 §2).",
      division:
        "Division of money `{{ name }}` leaves a fraction. Keep minor units whole: make the whole division the argument of `Math.round`/`Math.floor`/`Math.ceil`/`Math.trunc`, or format through `Intl` without dividing (plan/12 §2).",
      decimalFactor:
        "Money `{{ name }}` multiplied or divided by a decimal literal. Rates are whole basis points (`…Bp`): `Math.round((amountMinor * rateBp) / 10000)` (plan/12 §2).",
      coerce:
        "Text turned into money `{{ name }}` with `Number`/`parseInt`/unary `+`. Money comes from text only through `MinorUnitsSchema`; a value that is already minor units needs no conversion (plan/12 §2).",
    },
  },
  create(context) {
    const visitorKeys = context.sourceCode.visitorKeys;

    /** Nodes already reported, so an annotated *and* decimal declaration reports once. */
    const reported = new WeakSet();

    /**
     * @param {any} node
     * @param {"annotation" | "decimal" | "parseFloat" | "toFixed" | "division" | "decimalFactor" | "coerce"} messageId
     * @param {string} name
     */
    function report(node, messageId, name) {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data: { name } });
    }

    /**
     * A declaration-like node with a name, an optional annotation and an optional value.
     * Clause 2: a decimal literal is red in every money name; the `number` annotation is red
     * only in a money name without a whole-number ending.
     * @param {any} node
     * @param {any} keyNode
     * @param {any} annotation
     * @param {any} value
     */
    function checkDeclaration(node, keyNode, annotation, value) {
      const name = keyNode?.type === "Identifier" ? keyNode.name : null;
      if (name === null || !isMoneyName(name)) return;
      if (isDecimalLiteral(unwrap(value))) {
        report(node, "decimal", name);
        return;
      }
      if (!hasWholeNumberEnding(name) && isNumberAnnotation(annotation)) {
        report(node, "annotation", name);
      }
    }

    /**
     * Clauses 3 and 4 over one `*` or `/` (binary or compound assignment).
     * @param {any} node
     * @param {string} operator `*` or `/`
     * @param {any} left
     * @param {any} right
     */
    function checkArithmetic(node, operator, left, right) {
      if (operator !== "*" && operator !== "/") return;
      // clause 4: a money name multiplied or divided by a decimal literal, rounded or not
      const leftDecimal = isDecimalLiteral(unwrap(left));
      const rightDecimal = isDecimalLiteral(unwrap(right));
      if (rightDecimal || (operator === "*" && leftDecimal)) {
        const name = mentionedMoneyName(
          rightDecimal ? left : right,
          visitorKeys,
        );
        if (name !== null) {
          report(node, "decimalFactor", name);
          return;
        }
      }
      if (operator !== "/") return;
      // clause 3: a division whose left side mentions a money name, unless the whole division
      // is the argument of a rounding call
      const name = mentionedMoneyName(left, visitorKeys);
      if (name === null) return;
      const { child, parent } = logicalParent(node);
      if (
        node.type === "BinaryExpression" &&
        parent?.type === "CallExpression" &&
        parent.callee !== child &&
        parent.arguments.includes(child) &&
        isRoundingCall(parent)
      ) {
        return;
      }
      report(node, "division", name);
    }

    /**
     * Clause 5: text to number, red when the operand is a money name or the result is assigned
     * to one.
     * @param {any} node
     * @param {any} operand
     */
    function checkCoercion(node, operand) {
      const operandName = nameOf(unwrap(operand));
      if (operandName !== null && isMoneyName(operandName)) {
        report(node, "coerce", operandName);
        return;
      }
      const target = assignedName(node);
      if (target !== null && isMoneyName(target))
        report(node, "coerce", target);
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
      AssignmentPattern(/** @type {any} */ node) {
        // a default value: `(feeMinor = 0.5) => …`, `{ price = 1.5 } = …`
        const name = nameOf(node.left);
        if (
          name !== null &&
          isMoneyName(name) &&
          isDecimalLiteral(unwrap(node.right))
        ) {
          report(node, "decimal", name);
        }
      },
      AssignmentExpression(/** @type {any} */ node) {
        if (node.operator === "=") {
          const name = nameOf(node.left);
          if (
            name !== null &&
            isMoneyName(name) &&
            isDecimalLiteral(unwrap(node.right))
          ) {
            report(node, "decimal", name);
          }
          return;
        }
        if (node.operator === "*=" || node.operator === "/=") {
          checkArithmetic(
            node,
            node.operator.slice(0, 1),
            node.left,
            node.right,
          );
        }
      },
      BinaryExpression(/** @type {any} */ node) {
        checkArithmetic(node, node.operator, node.left, node.right);
      },
      UnaryExpression(/** @type {any} */ node) {
        if (node.operator === "+") checkCoercion(node, node.argument);
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
        if (!isMoneyName(node.name) || hasWholeNumberEnding(node.name)) return;
        if (!isNumberAnnotation(node.typeAnnotation)) return;
        report(node, "annotation", node.name);
      },
      CallExpression(/** @type {any} */ node) {
        const called = calleeName(node);

        if (isTextToNumberCall(node)) {
          checkCoercion(node, node.arguments[0]);
          return;
        }

        if (called === "parseFloat") {
          for (const argument of node.arguments) {
            const name = nameOf(unwrap(argument));
            if (name !== null && isMoneyName(name)) {
              report(node, "parseFloat", name);
              return;
            }
          }
          return;
        }

        const callee = unwrap(node.callee);
        if (called === "toFixed" && callee?.type === "MemberExpression") {
          const name = nameOf(unwrap(callee.object));
          if (name !== null && isMoneyName(name)) {
            report(node, "toFixed", name);
          }
        }
      },
    };
  },
};

export default rule;
