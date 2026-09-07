/**
 * `fo/no-direct-order-status-write` (spec 001 §2, §5, AC-7; ADR-0009; plan/12 §2 "Order integrity").
 *
 * ADR-0009 makes the order lifecycle a guarded state machine: every transition goes through
 * `orderService.transition`, which appends an immutable `order_events` row and an outbox row in
 * the same transaction. A direct `UPDATE orders SET status = …` skips the guard, the event and
 * the outbox, so it is banned everywhere except inside the service that owns the machine
 * (`src/modules/orders/service/`).
 *
 * Two shapes are flagged:
 *   1. Drizzle: any chain in which `.update(orders)` is followed by `.set({ … status … })`
 *      (`db.update(orders).set({ status })`, `tx.update(orders).where(…)` variants, and
 *      `.set({ ...statusPatch })` spreads of a `status` identifier).
 *   2. Raw SQL in a string or template literal matching `/UPDATE\s+orders\s+SET[^;]*\bstatus\b/i`.
 */

/** Path fragment (posix) whose files own the state machine and may write `orders.status`. */
export const ALLOWED_PATH = "src/modules/orders/service/";

export const SQL_ORDER_STATUS_WRITE = /UPDATE\s+orders\s+SET[^;]*\bstatus\b/i;

/**
 * @param {string} filename ESLint's `context.filename`
 * @returns {boolean} true when the file owns order transitions and may write the column
 */
export function isOrderServiceFile(filename) {
  return filename.split("\\").join("/").includes(ALLOWED_PATH);
}

/**
 * @param {string} sql
 * @returns {boolean}
 */
export function isOrderStatusSql(sql) {
  return SQL_ORDER_STATUS_WRITE.test(sql);
}

/**
 * `orders` as a table reference: the bare identifier or a member of a schema object
 * (`schema.orders`, `tables.orders`).
 * @param {any} node
 * @returns {boolean}
 */
function isOrdersTable(node) {
  if (node === null || node === undefined) return false;
  if (node.type === "Identifier") return node.name === "orders";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" && node.property.name === "orders"
    );
  }
  return false;
}

/**
 * True for `<anything>.update(orders)` — the head of a Drizzle update chain on `orders`.
 * @param {any} node
 * @returns {boolean}
 */
function isUpdateOrdersCall(node) {
  if (node === null || node === undefined || node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee;
  const name =
    callee.type === "Identifier"
      ? callee.name
      : callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ? callee.property.name
        : null;
  if (name !== "update") return false;
  return node.arguments.some((/** @type {any} */ argument) =>
    isOrdersTable(argument),
  );
}

/**
 * Walks back down a member/call chain looking for the `.update(orders)` head, so intermediate
 * calls (`.where(...)`, `.from(...)`) do not hide the write.
 * @param {any} node
 * @returns {boolean}
 */
function chainUpdatesOrders(node) {
  let current = node;
  while (current !== null && current !== undefined) {
    if (isUpdateOrdersCall(current)) return true;
    if (current.type === "MemberExpression") {
      current = current.object;
      continue;
    }
    if (current.type === "CallExpression") {
      current = current.callee;
      continue;
    }
    if (
      current.type === "TSNonNullExpression" ||
      current.type === "AwaitExpression"
    ) {
      current = current.expression ?? current.argument;
      continue;
    }
    return false;
  }
  return false;
}

/**
 * True when a `.set()` argument mentions `status`: a `status` property, a computed
 * `["status"]` key, or a spread of a `status`-named identifier.
 * @param {any} node
 * @returns {boolean}
 */
function setsStatus(node) {
  if (node === null || node === undefined || node.type !== "ObjectExpression") {
    return false;
  }
  return node.properties.some((/** @type {any} */ property) => {
    if (property.type === "SpreadElement") {
      const argument = property.argument;
      return argument.type === "Identifier" && /status/i.test(argument.name);
    }
    if (property.type !== "Property") return false;
    const key = property.key;
    if (key.type === "Identifier") return key.name === "status";
    if (key.type === "Literal") return key.value === "status";
    return false;
  });
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow direct writes to orders.status; order transitions go through orderService.transition (ADR-0009)",
    },
    schema: [],
    messages: {
      drizzle:
        "Direct write to `orders.status`. Order status changes only via `orderService.transition` (ADR-0009); it appends the `order_events` row and the outbox row in the same transaction.",
      sql: "Raw `UPDATE orders SET … status …`. Order status changes only via `orderService.transition` (ADR-0009); direct SQL skips the guard, the event and the outbox.",
    },
  },
  create(context) {
    if (isOrderServiceFile(context.filename)) return {};

    /**
     * @param {any} node
     * @param {string} value
     */
    function checkSql(node, value) {
      if (!isOrderStatusSql(value)) return;
      context.report({ node, messageId: "sql" });
    }

    return {
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "set"
        ) {
          return;
        }
        if (!chainUpdatesOrders(callee.object)) return;
        if (!node.arguments.some((/** @type {any} */ a) => setsStatus(a)))
          return;
        context.report({ node, messageId: "drizzle" });
      },
      Literal(/** @type {any} */ node) {
        if (typeof node.value !== "string") return;
        checkSql(node, node.value);
      },
      TemplateLiteral(/** @type {any} */ node) {
        const value = node.quasis
          .map((/** @type {any} */ quasi) => quasi.value.cooked ?? "")
          .join(" ");
        checkSql(node, value);
      },
    };
  },
};

export default rule;
