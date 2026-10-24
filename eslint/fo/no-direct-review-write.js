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
 * Spec 044 §2.4 (TASK-321) adds two more guarded writes, held the same way:
 *   - `blog_post_revision.frozen_at` (`frozenAt`): the freeze an approval sets, written only inside
 *     `attest` (`blog_revision_freeze()` refuses any other write);
 *   - `blog_post.published_revision_id` (`publishedRevisionId`), the publish pointer, written only
 *     inside a function named `publishPost` or `publishChanges` (`messageId: "publish"`;
 *     `blog_publish_guard()` refuses a pointer to a revision without an approval).
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

/**
 * One guarded write: the columns (as the database and as a Drizzle patch name them), the
 * functions allowed to write them, and the message reported elsewhere.
 *
 * @typedef {{ columns: readonly string[], keys: ReadonlySet<string>, writers: ReadonlySet<string>, drizzle: string, sql: string }} GuardedWrite
 */

/** @type {readonly GuardedWrite[]} */
export const GUARDED_WRITES = Object.freeze([
  {
    // the review columns, and spec 044's freeze (an approval's own column)
    columns: [...REVIEW_COLUMNS, "frozen_at"],
    keys: new Set([
      ...REVIEW_COLUMNS,
      "reviewedBy",
      "reviewedAt",
      "reviewState",
      "frozen_at",
      "frozenAt",
    ]),
    writers: new Set(["attest"]),
    drizzle: "drizzle",
    sql: "sql",
  },
  {
    // spec 044 §2.4: the blog publish pointer
    columns: ["published_revision_id"],
    keys: new Set(["published_revision_id", "publishedRevisionId"]),
    writers: new Set(["publishPost", "publishChanges"]),
    drizzle: "publish",
    sql: "publish",
  },
]);

/**
 * Whether `text` writes one of `columns`: an `UPDATE … SET` clause assigning one, or an
 * `INSERT INTO t (…)` column list naming one.
 *
 * @param {string} text
 * @param {readonly string[]} columns
 * @returns {boolean}
 */
export function writesColumnSql(text, columns) {
  const column = `(?:${[...columns].sort((a, b) => b.length - a.length).join("|")})`;
  // `col =` at the start of a SET item (after `SET`, a comma, or an opening parenthesis).
  const assigns = new RegExp(String.raw`(?:^|[\s,(.])${column}\s*=(?!=)`, "i");
  const names = new RegExp(String.raw`\b${column}\b`, "i");
  const sql = text.replace(/"/g, " ");
  for (const match of sql.matchAll(
    /\bUPDATE\b[\s\S]*?\bSET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bRETURNING\b|;|$)/gi,
  )) {
    if (assigns.test(` ${match[1] ?? ""}`)) return true;
  }
  for (const match of sql.matchAll(
    /\bINSERT\s+INTO\s+[\w.]+\s*\(([^)]*)\)/gi,
  )) {
    if (names.test(match[1] ?? "")) return true;
  }
  return false;
}

/**
 * Whether `text` writes a review column (spec 012b): an `UPDATE … SET` clause assigning one, or
 * an `INSERT INTO t (…)` column list naming one.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isReviewWriteSql(text) {
  return writesColumnSql(text, REVIEW_COLUMNS);
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
 * @param {ReadonlySet<string>} keys
 * @returns {(object: import("estree").ObjectExpression) => boolean}
 */
function namesKeyOf(keys) {
  return (object) =>
    object.properties.some((property) => {
      if (property.type !== "Property") return false;
      const name = keyName(property.key);
      return name !== undefined && keys.has(name);
    });
}

/**
 * Whether `node` sits inside a function whose name is one of `writers`.
 *
 * @param {import("eslint").Rule.RuleContext} context
 * @param {import("estree").Node} node
 * @param {ReadonlySet<string>} writers
 */
function insideWriter(context, node, writers) {
  for (const ancestor of context.sourceCode.getAncestors(node)) {
    if (
      ancestor.type !== "FunctionDeclaration" &&
      ancestor.type !== "FunctionExpression" &&
      ancestor.type !== "ArrowFunctionExpression"
    ) {
      continue;
    }
    if ("id" in ancestor && ancestor.id && writers.has(ancestor.id.name)) {
      return true;
    }
    const parent = /** @type {any} */ (ancestor).parent;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.id?.type === "Identifier" &&
      writers.has(parent.id.name)
    ) {
      return true;
    }
    if (
      (parent?.type === "Property" || parent?.type === "MethodDefinition") &&
      writers.has(keyName(parent.key) ?? "")
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
      publish:
        "This writes blog_post.published_revision_id outside publishPost() and publishChanges() (spec 044 AC-3). A post is published only through those commands; the database refuses a pointer to an unapproved revision (BLOG_PUBLISH_WITHOUT_ATTESTATION).",
    },
  },
  create(context) {
    /**
     * @param {import("estree").Node} node
     * @param {GuardedWrite} guarded
     * @param {"drizzle" | "sql"} kind
     */
    const report = (node, guarded, kind) => {
      if (!insideWriter(context, node, guarded.writers)) {
        context.report({ node, messageId: guarded[kind] });
      }
    };

    /** @param {import("estree").Node} node @param {string} text */
    const checkSql = (node, text) => {
      for (const guarded of GUARDED_WRITES) {
        if (writesColumnSql(text, guarded.columns)) report(node, guarded, "sql");
      }
    };

    /**
     * @param {import("estree").Node} node
     * @param {import("estree").Node} patch
     */
    const checkPatch = (node, patch) => {
      for (const guarded of GUARDED_WRITES) {
        if (objectsOf(context, patch).some(namesKeyOf(guarded.keys))) {
          report(node, guarded, "drizzle");
        }
      }
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const method = keyName(callee.property);
        const [first] = node.arguments;
        if (!first || first.type === "SpreadElement") return;
        if (method === "set" && node.arguments.length === 1) {
          checkPatch(node, first);
        } else if (method === "values") {
          checkPatch(node, first);
        } else if (method === "onConflictDoUpdate") {
          for (const options of objectsOf(context, first)) {
            for (const property of options.properties) {
              if (
                property.type === "Property" &&
                keyName(property.key) === "set"
              ) {
                checkPatch(node, property.value);
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
