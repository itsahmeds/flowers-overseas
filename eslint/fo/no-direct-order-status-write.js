/**
 * `fo/no-direct-order-status-write` (spec 001 §2, §5, AC-7, §14 A20 AC-60; ADR-0009; plan/12 §2
 * "Order integrity").
 *
 * ADR-0009 makes the order lifecycle a guarded state machine: every transition goes through
 * `orderService.transition`, which appends an immutable `order_events` row and an outbox row in
 * the same transaction. A direct `UPDATE "order" SET status = …` skips the guard, the event and
 * the outbox, so it is banned everywhere except inside the service that owns the machine
 * (`src/modules/orders/service/`).
 *
 * The table is `orders` or `order` (spec 002 names it `"order"`), and it counts under any name
 * this file gives it (AC-60 item 1): imported under another name (`import { orders as o }`),
 * bound again (`const t = orders`, `let t = …; t = orders`, `const { orders: t } = schema`), or
 * read as `schema["orders"]`.
 *
 * Shapes flagged outside the service:
 *   1. Drizzle: a `.set(…)` on a chain headed by `.update(<orders>)`, and the `set` of an
 *      `.onConflictDoUpdate({ set: … })` on a chain headed by `.insert(<orders>)` (item 3). A
 *      plain `insert(orders).values({ status: "draft" })` creates an order and stays allowed.
 *   2. **What it cannot read** (item 4): the patch must be an object literal, or a `const` in this
 *      file bound to one and never written or handed on, whose keys are all readable and none is
 *      `status`. A parameter, a call, a member, a spread of any of those, a computed key, or a
 *      literal that is later assigned to, `Object.assign`ed or passed on is red with "cannot prove
 *      this does not write `status`".
 *   3. SQL (item 2), in a string, a template (a `sql` template's interpolation of the table or of
 *      `<table>.status` reads as the name) or a `+` chain of them: `UPDATE`, `INSERT … ON
 *      CONFLICT … DO UPDATE SET` or `MERGE INTO … UPDATE SET` on `order`/`orders` — quoted,
 *      schema-qualified, `ONLY`, aliased, over line breaks — whose SET clause names `status`.
 *      String literals and comments are blanked first, so `'status'` as a value is not a write
 *      and a `;` inside a string does not end the statement; the SET clause ends at a top-level
 *      `WHERE`, `FROM`, `RETURNING`, a `)` closing an outer bracket, or `;`.
 *
 * What lint cannot see (AC-60): a table re-exported under another name from another file, SQL
 * assembled at run time, and SQL in `.sql` migration files. The database trigger of spec 002
 * AC-13 (TASK-020) is the lock for those.
 */

/** Path fragment (posix) whose files own the state machine and may write the status column. */
export const ALLOWED_PATH = "src/modules/orders/service/";

/** The order table's names: today's `orders`, and spec 002's `"order"`. */
export const TABLE_NAMES = new Set(["orders", "order"]);

/**
 * @param {string} filename ESLint's `context.filename`
 * @returns {boolean} true when the file owns order transitions and may write the column
 */
export function isOrderServiceFile(filename) {
  return filename.split("\\").join("/").includes(ALLOWED_PATH);
}

// ---------------------------------------------------------------------------------------------
// SQL

/** The table, as SQL may write it: optional `ONLY`, a schema, quotes, and nothing glued on. */
const SQL_TABLE = String.raw`(?:ONLY\s+)?(?:(?:"[^"]*"|\w+)\s*\.\s*)?(?:"orders?"|orders?)(?![\w".$])`;

/** Statement heads whose SET clause writes the order table's columns. */
const SQL_HEADS = [
  String.raw`\bUPDATE\s+${SQL_TABLE}[^;]*?\bSET\b`,
  String.raw`\bINSERT\s+INTO\s+${SQL_TABLE}[^;]*?\bON\s+CONFLICT\b[^;]*?\bDO\s+UPDATE\s+SET\b`,
  String.raw`\bMERGE\s+INTO\s+${SQL_TABLE}[^;]*?\bUPDATE\s+SET\b`,
];

/** Quoted identifiers kept; string literals and comments blanked. One pass, left to right. */
const SQL_TOKENS = /"(?:[^"]|"")*"|'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g;

/**
 * @param {string} sql
 * @returns {string} the SQL with every string literal emptied and every comment a space
 */
function blankSql(sql) {
  return sql.replace(SQL_TOKENS, (token) =>
    token.startsWith('"') ? token : token.startsWith("'") ? "''" : " ",
  );
}

/**
 * The SET clause from `start`: up to a top-level `WHERE`, `FROM` or `RETURNING`, a `)` that
 * closes a bracket opened before it, a `;`, or the end.
 * @param {string} sql
 * @param {number} start
 * @returns {string}
 */
function setClause(sql, start) {
  const stops = /[();]|\b(?:WHERE|FROM|RETURNING)\b/gi;
  stops.lastIndex = start;
  let depth = 0;
  for (let match = stops.exec(sql); match !== null; match = stops.exec(sql)) {
    const token = match[0];
    if (token === "(") depth += 1;
    else if (token === ")") {
      if (depth === 0) return sql.slice(start, match.index);
      depth -= 1;
    } else if (token === ";" || depth === 0) {
      return sql.slice(start, match.index);
    }
  }
  return sql.slice(start);
}

/**
 * True when the SQL writes the order table's `status` column.
 * @param {string} sql
 * @returns {boolean}
 */
export function isOrderStatusSql(sql) {
  const text = blankSql(sql);
  return SQL_HEADS.some((head) => {
    const pattern = new RegExp(head, "gi");
    for (
      let match = pattern.exec(text);
      match !== null;
      match = pattern.exec(text)
    ) {
      const clause = setClause(text, match.index + match[0].length);
      if (/\bstatus\b/i.test(clause)) return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------------------------
// AST helpers

/** Expression wrappers that do not change which value an expression is. */
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
  "ChainExpression",
  "AwaitExpression",
]);

/**
 * The node under TypeScript's expression wrappers, `?.` and `await`.
 * @param {any} node
 * @returns {any}
 */
function unwrap(node) {
  let current = node;
  while (
    current !== null &&
    current !== undefined &&
    WRAPPERS.has(current.type)
  ) {
    current = current.expression ?? current.argument;
  }
  return current;
}

/**
 * A static key: an identifier, a string or number literal, or a template with no interpolation.
 * @param {any} key
 * @param {boolean} computed
 * @returns {string | null} the key, or null when it cannot be read
 */
function staticKey(key, computed) {
  if (!computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal") return String(key.value);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/**
 * @param {any} member a MemberExpression
 * @returns {string | null} its property name when static
 */
function propName(member) {
  return staticKey(member.property, member.computed);
}

/**
 * @param {any} call a CallExpression
 * @returns {string | null} the called name: `f(…)` or `x.f(…)` / `x["f"](…)`
 */
function calleeName(call) {
  const callee = unwrap(call.callee);
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression") return propName(callee);
  return null;
}

/**
 * The destructuring key a pattern binds `name` from (`const { orders: t } = …` → `orders`).
 * @param {any} name the bound Identifier
 * @returns {string | null}
 */
function destructuredKey(name) {
  let node = name;
  if (node.parent?.type === "AssignmentPattern" && node.parent.left === node) {
    node = node.parent;
  }
  const property = node.parent;
  if (property?.type !== "Property" || property.value !== node) return null;
  if (property.parent?.type !== "ObjectPattern") return null;
  return staticKey(property.key, property.computed);
}

/** @typedef {"clean" | "status" | "unreadable"} Verdict */

/**
 * @param {Verdict[]} verdicts
 * @returns {Verdict} `status` over `unreadable` over `clean`
 */
function worst(verdicts) {
  if (verdicts.includes("status")) return "status";
  if (verdicts.includes("unreadable")) return "unreadable";
  return "clean";
}

/** @param {any} node */
const isPlus = (node) =>
  node?.type === "BinaryExpression" && node.operator === "+";

// ---------------------------------------------------------------------------------------------
// The rule

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow direct writes to the order table's status; order transitions go through orderService.transition (ADR-0009)",
    },
    schema: [],
    messages: {
      drizzle:
        "Direct write to the order table's `status`. Order status changes only via `orderService.transition` (ADR-0009); it appends the `order_events` row and the outbox row in the same transaction.",
      unreadable:
        "On the order table, cannot prove this does not write `status`: pass an object literal, or a `const` in this file bound to one and never written or handed on, with no `status` key. Order status changes only via `orderService.transition` (ADR-0009).",
      sql: 'Raw SQL writing the order table\'s `status` (`UPDATE "order" SET … status …`, or an upsert that does). Order status changes only via `orderService.transition` (ADR-0009); direct SQL skips the guard, the event and the outbox.',
    },
  },
  create(context) {
    if (isOrderServiceFile(context.filename)) return {};

    /**
     * @param {any} identifier
     * @returns {import("eslint").Scope.Variable | null}
     */
    function findVariable(identifier) {
      /** @type {import("eslint").Scope.Scope | null} */
      let scope = context.sourceCode.getScope(identifier);
      while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        if (variable !== undefined) return variable;
        scope = scope.upper;
      }
      return null;
    }

    /**
     * The expressions ever assigned to a variable (its initialiser and later `=`), skipping
     * destructuring, whose right-hand side is the whole object rather than the bound value.
     * @param {import("eslint").Scope.Variable} variable
     * @returns {any[]}
     */
    function assignedValues(variable) {
      return variable.references.flatMap((reference) =>
        reference.writeExpr !== null &&
        reference.writeExpr !== undefined &&
        destructuredKey(reference.identifier) === null
          ? [reference.writeExpr]
          : [],
      );
    }

    /**
     * True when the expression is the order table under any name this file gives it.
     * @param {any} input
     * @param {Set<unknown>} [seen]
     * @returns {boolean}
     */
    function isOrdersTable(input, seen = new Set()) {
      const node = unwrap(input);
      if (node === null || node === undefined) return false;
      if (node.type === "MemberExpression") {
        const name = propName(node);
        return name !== null && TABLE_NAMES.has(name);
      }
      if (node.type !== "Identifier") return false;
      if (TABLE_NAMES.has(node.name)) return true;
      const variable = findVariable(node);
      if (variable === null || seen.has(variable)) return false;
      seen.add(variable);
      for (const def of variable.defs) {
        /** @type {string | null} */
        let key = null;
        if (
          def.type === "ImportBinding" &&
          def.node.type === "ImportSpecifier"
        ) {
          key = staticKey(def.node.imported, false);
        } else if (def.type === "Variable") {
          key = destructuredKey(def.name);
        }
        if (key !== null && TABLE_NAMES.has(key)) return true;
      }
      return assignedValues(variable).some((value) =>
        isOrdersTable(value, seen),
      );
    }

    /**
     * True when the chain below `input` is headed by `.<method>(<orders>)`. Intermediate calls
     * (`.where(…)`, `.values(…)`) and a variable holding part of the chain do not hide it.
     * @param {any} input
     * @param {string} method
     * @param {Set<unknown>} [seen]
     * @returns {boolean}
     */
    function chainOn(input, method, seen = new Set()) {
      let current = unwrap(input);
      while (current !== null && current !== undefined) {
        if (current.type === "CallExpression") {
          const args = current.arguments;
          if (
            calleeName(current) === method &&
            args.some((/** @type {any} */ a) => isOrdersTable(a))
          ) {
            return true;
          }
          current = unwrap(current.callee);
        } else if (current.type === "MemberExpression") {
          current = unwrap(current.object);
        } else if (current.type === "Identifier") {
          const variable = findVariable(current);
          if (variable === null || seen.has(variable)) return false;
          seen.add(variable);
          return assignedValues(variable).some((value) =>
            chainOn(value, method, seen),
          );
        } else {
          return false;
        }
      }
      return false;
    }

    /**
     * True when this reference to a patch variable only reads it: the one argument of a
     * `.set()`, the `set:` of an object literal, a spread into another literal, or a member read.
     * @param {any} identifier
     * @returns {boolean}
     */
    function isReadOnlyUse(identifier) {
      let node = identifier;
      while (node.parent !== null && WRAPPERS.has(node.parent?.type)) {
        node = node.parent;
      }
      const parent = node.parent;
      if (parent === null || parent === undefined) return false;
      if (parent.type === "CallExpression") {
        return (
          parent.arguments.length === 1 &&
          parent.arguments[0] === node &&
          calleeName(parent) === "set"
        );
      }
      if (parent.type === "SpreadElement") {
        return parent.parent?.type === "ObjectExpression";
      }
      if (parent.type === "Property") {
        return (
          parent.value === node &&
          parent.parent?.type === "ObjectExpression" &&
          staticKey(parent.key, parent.computed) === "set"
        );
      }
      if (parent.type === "MemberExpression" && parent.object === node) {
        const use = parent.parent;
        if (use?.type === "AssignmentExpression" && use.left === parent) {
          return false;
        }
        if (use?.type === "UpdateExpression") return false;
        return !(use?.type === "CallExpression" && use.callee === parent);
      }
      return false;
    }

    /**
     * What a patch does to `status`.
     * @param {any} input
     * @param {Set<unknown>} [seen]
     * @returns {Verdict}
     */
    function classify(input, seen = new Set()) {
      const node = unwrap(input);
      if (node === null || node === undefined) return "unreadable";
      if (node.type === "ConditionalExpression") {
        return worst([
          classify(node.consequent, seen),
          classify(node.alternate, seen),
        ]);
      }
      if (node.type === "ObjectExpression") {
        return worst(
          node.properties.map((/** @type {any} */ property) => {
            if (property.type === "SpreadElement") {
              return classify(property.argument, seen);
            }
            const key = staticKey(property.key, property.computed);
            if (key === null) return "unreadable";
            return key === "status" ? "status" : "clean";
          }),
        );
      }
      if (node.type !== "Identifier") return "unreadable";
      const variable = findVariable(node);
      if (variable === null || seen.has(variable)) return "unreadable";
      seen.add(variable);
      const [def] = variable.defs;
      if (
        variable.defs.length !== 1 ||
        def === undefined ||
        def.node.id !== def.name ||
        def.node.init === null ||
        def.node.init === undefined
      ) {
        return "unreadable";
      }
      const writes = variable.references.filter((reference) =>
        reference.isWrite(),
      );
      if (writes.length !== 1 || writes[0]?.writeExpr !== def.node.init) {
        return "unreadable";
      }
      const onlyRead = variable.references.every(
        (reference) =>
          reference.isWrite() || isReadOnlyUse(reference.identifier),
      );
      return onlyRead ? classify(def.node.init, seen) : "unreadable";
    }

    /**
     * An upsert config: every key readable, no spread, and its `set` a readable patch.
     * @param {any} config
     * @returns {Verdict}
     */
    function classifyUpsert(config) {
      const node = unwrap(config);
      if (node?.type !== "ObjectExpression") return "unreadable";
      return worst(
        node.properties.map((/** @type {any} */ property) => {
          if (property.type === "SpreadElement") return "unreadable";
          const key = staticKey(property.key, property.computed);
          if (key === null) return "unreadable";
          return key === "set" ? classify(property.value) : "clean";
        }),
      );
    }

    /**
     * @param {any} node
     * @param {Verdict} verdict
     */
    function reportPatch(node, verdict) {
      if (verdict === "clean") return;
      context.report({
        node,
        messageId: verdict === "status" ? "drizzle" : "unreadable",
      });
    }

    /**
     * An interpolation in SQL: the table reads as `orders`, `<table>.status` as `status`, a string
     * literal as itself; anything else is a placeholder that matches nothing.
     * @param {any} node
     * @returns {string}
     */
    function interpolated(node) {
      const expression = unwrap(node);
      if (isOrdersTable(expression)) return "orders";
      if (
        expression.type === "MemberExpression" &&
        propName(expression) === "status" &&
        isOrdersTable(expression.object)
      ) {
        return "status";
      }
      if (
        expression.type === "Literal" &&
        typeof expression.value === "string"
      ) {
        return expression.value;
      }
      return " $0 ";
    }

    /**
     * The SQL an operand spells.
     * @param {any} node
     * @returns {string}
     */
    function sqlText(node) {
      const expression = unwrap(node);
      if (expression.type === "TemplateLiteral") {
        return expression.quasis
          .map((/** @type {any} */ quasi, /** @type {number} */ index) => {
            const inner = expression.expressions[index];
            const cooked = quasi.value.cooked ?? "";
            return inner === undefined ? cooked : cooked + interpolated(inner);
          })
          .join("");
      }
      return interpolated(expression);
    }

    /**
     * The operands of a `+` chain, left to right.
     * @param {any} node
     * @returns {any[]}
     */
    function plusOperands(node) {
      const expression = unwrap(node);
      if (isPlus(expression)) {
        return [
          ...plusOperands(expression.left),
          ...plusOperands(expression.right),
        ];
      }
      return [expression];
    }

    /**
     * @param {any} node
     * @param {string} text
     */
    function checkSql(node, text) {
      if (isOrderStatusSql(text)) context.report({ node, messageId: "sql" });
    }

    return {
      CallExpression(/** @type {any} */ node) {
        const callee = unwrap(node.callee);
        if (callee.type !== "MemberExpression") return;
        const name = calleeName(node);
        if (name === "set" && chainOn(callee.object, "update")) {
          const verdicts = node.arguments.map((/** @type {any} */ argument) =>
            classify(argument),
          );
          reportPatch(node, worst(verdicts));
        } else if (
          name === "onConflictDoUpdate" &&
          chainOn(callee.object, "insert")
        ) {
          const [config] = node.arguments;
          reportPatch(
            node,
            config === undefined ? "unreadable" : classifyUpsert(config),
          );
        }
      },
      Literal(/** @type {any} */ node) {
        if (typeof node.value !== "string" || isPlus(node.parent)) return;
        checkSql(node, node.value);
      },
      TemplateLiteral(/** @type {any} */ node) {
        if (isPlus(node.parent)) return;
        checkSql(node, sqlText(node));
      },
      BinaryExpression(/** @type {any} */ node) {
        if (!isPlus(node) || isPlus(node.parent)) return;
        checkSql(node, plusOperands(node).map(sqlText).join(""));
      },
    };
  },
};

export default rule;
