/**
 * `fo/no-direct-review-write` (spec 012b §2.4, AC-14, T-14; proposed ADR-0022; TASK-293).
 *
 * Copy and photo approval is a named human's own act, recorded in the append-only ledger
 * `review_attestation`. `attest()` (`src/modules/i18n/db/ledger.ts`) is the only code that writes
 * the ledger **and** the only code that may set the review columns it mirrors —
 * `product_translation.reviewed` / `reviewed_by` / `reviewed_at` and `media_asset.review_state` /
 * `reviewed_by` / `reviewed_at`. Postgres enforces that at run time (`review_write_guard()`,
 * migration `0023`); this rule catches the attempt in review, before it can reach a database.
 *
 * Reported outside a function named `attest`:
 *   1. **Drizzle** (`messageId: "drizzle"`): a `.set(patch)` with one argument, a `.values(row)` or
 *      `.values([rows])`, and the `set` of an `.onConflictDoUpdate({ set })`, where the patch is
 *      an object literal — or a same-file variable bound to one — with a key naming a review
 *      column (`reviewed`, `reviewedBy`, `reviewedAt`, `reviewState` and their snake-case
 *      spellings), whether the key is an identifier, a string or a constant computed key.
 *   2. **SQL** (`messageId: "sql"`): a string or template literal (tagged `sql\`…\`` included)
 *      that is an `UPDATE … SET` assigning a review column (also `ON CONFLICT … DO UPDATE SET`),
 *      or an `INSERT INTO <table> (…)` whose column list names one. Identifier quotes are
 *      ignored. A column that is only *read* — in a `WHERE`, a `SELECT` — is not a write.
 *
 * Allowed: the same code lexically inside `function attest`, `const attest = …`, or a method or
 * property named `attest`. A *call* to `attest()` gives no cover to the code around it.
 *
 * What it cannot see (the guard can): a patch built at run time (a parameter, a spread, a call),
 * a column name assembled from pieces, and SQL text read from a file. `seed/index.ts`'s generic
 * upsert is one such writer; it writes the review columns on insert only, unreviewed, and the
 * guard refuses anything else.
 */

/** The review columns, as the database names them. */
export const REVIEW_COLUMNS = Object.freeze([
  "reviewed",
  "reviewed_by",
  "reviewed_at",
  "review_state",
]);

/** The same columns as a Drizzle patch may name them. */
const PATCH_KEYS = new Set([
  ...REVIEW_COLUMNS,
  "reviewedBy",
  "reviewedAt",
  "reviewState",
]);

const COLUMN = String.raw`(?:reviewed_by|reviewed_at|review_state|reviewed)`;

/** `col =` at the start of a SET item (after `SET`, a comma, or an opening parenthesis). */
const ASSIGNS_REVIEW_COLUMN = new RegExp(
  String.raw`(?:^|[\s,(.])${COLUMN}\s*=(?!=)`,
  "i",
);

const NAMES_REVIEW_COLUMN = new RegExp(String.raw`\b${COLUMN}\b`, "i");

/**
 * Whether `text` writes a review column: an `UPDATE … SET` clause assigning one, or an
 * `INSERT INTO t (…)` column list naming one.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isReviewWriteSql(text) {
  const sql = text.replace(/"/g, " ");
  for (const match of sql.matchAll(
    /\bUPDATE\b[\s\S]*?\bSET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bRETURNING\b|;|$)/gi,
  )) {
    if (ASSIGNS_REVIEW_COLUMN.test(` ${match[1] ?? ""}`)) return true;
  }
  for (const match of sql.matchAll(
    /\bINSERT\s+INTO\s+[\w.]+\s*\(([^)]*)\)/gi,
  )) {
    if (NAMES_REVIEW_COLUMN.test(match[1] ?? "")) return true;
  }
  return false;
}

/**
 * @param {import("estree").Node | null | undefined} node
 * @returns {string | undefined}
 */
function keyName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/**
 * The object literal a patch argument is, or is bound to in this file.
 *
 * @param {import("eslint").Rule.RuleContext} context
 * @param {import("estree").Node} node
 * @returns {import("estree").ObjectExpression[]}
 */
function objectsOf(context, node) {
  if (node.type === "ObjectExpression") return [node];
  if (node.type === "ArrayExpression") {
    return node.elements.flatMap((element) =>
      element && element.type !== "SpreadElement"
        ? objectsOf(context, element)
        : [],
    );
  }
  if (node.type === "Identifier") {
    const scope = context.sourceCode.getScope(node);
    for (let current = scope; current; current = current.upper) {
      const variable = current.set.get(node.name);
      if (variable) {
        return variable.defs.flatMap((def) =>
          def.node.type === "VariableDeclarator" && def.node.init
            ? objectsOf(context, def.node.init)
            : [],
        );
      }
    }
  }
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    return objectsOf(context, /** @type {any} */ (node).expression);
  }
  return [];
}

/**
 * @param {import("estree").ObjectExpression} object
 * @returns {boolean}
 */
function namesReviewKey(object) {
  return object.properties.some((property) => {
    if (property.type !== "Property") return false;
    const name = property.computed
      ? keyName(property.key)
      : keyName(property.key);
    return name !== undefined && PATCH_KEYS.has(name);
  });
}

/**
 * Whether `node` sits inside a function named `attest`.
 *
 * @param {import("eslint").Rule.RuleContext} context
 * @param {import("estree").Node} node
 */
function insideAttest(context, node) {
  for (const ancestor of context.sourceCode.getAncestors(node)) {
    if (
      ancestor.type !== "FunctionDeclaration" &&
      ancestor.type !== "FunctionExpression" &&
      ancestor.type !== "ArrowFunctionExpression"
    ) {
      continue;
    }
    if ("id" in ancestor && ancestor.id?.name === "attest") return true;
    const parent = /** @type {any} */ (ancestor).parent;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.id?.type === "Identifier" &&
      parent.id.name === "attest"
    ) {
      return true;
    }
    if (
      (parent?.type === "Property" || parent?.type === "MethodDefinition") &&
      keyName(parent.key) === "attest"
    ) {
      return true;
    }
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Review columns (reviewed, reviewed_by, reviewed_at, review_state) are written only by attest() (spec 012b AC-14, ADR-0022).",
    },
    schema: [],
    messages: {
      drizzle:
        "This writes a review column outside attest(). Approval is recorded through attest() in src/modules/i18n, which writes the ledger and the column together (spec 012b AC-14).",
      sql: "This SQL writes a review column outside attest(). Approval is recorded through attest() in src/modules/i18n; the database refuses any other write (REVIEW_DIRECT_WRITE).",
    },
  },
  create(context) {
    /**
     * @param {import("estree").Node} node
     * @param {"drizzle" | "sql"} messageId
     */
    const report = (node, messageId) => {
      if (!insideAttest(context, node)) context.report({ node, messageId });
    };

    /** @param {import("estree").Node} node @param {string} text */
    const checkSql = (node, text) => {
      if (isReviewWriteSql(text)) report(node, "sql");
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const method = keyName(callee.property);
        const [first] = node.arguments;
        if (!first || first.type === "SpreadElement") return;
        if (method === "set" && node.arguments.length === 1) {
          if (objectsOf(context, first).some(namesReviewKey)) {
            report(node, "drizzle");
          }
        } else if (method === "values") {
          if (objectsOf(context, first).some(namesReviewKey)) {
            report(node, "drizzle");
          }
        } else if (method === "onConflictDoUpdate") {
          for (const options of objectsOf(context, first)) {
            for (const property of options.properties) {
              if (
                property.type === "Property" &&
                keyName(property.key) === "set" &&
                objectsOf(context, property.value).some(namesReviewKey)
              ) {
                report(node, "drizzle");
              }
            }
          }
        }
      },
      Literal(node) {
        if (typeof node.value === "string") checkSql(node, node.value);
      },
      TemplateLiteral(node) {
        checkSql(
          node,
          node.quasis.map((quasi) => quasi.value.cooked ?? "").join("$x"),
        );
      },
    };
  },
};

export default rule;
