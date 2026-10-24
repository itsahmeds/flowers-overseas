/**
 * Spec 020a T-09 (AC-8; TASK-357): admin never moves an order or its money itself.
 *
 * Under `src/modules/admin/order-actions/` and `src/app/admin/` there is no call to `transition(`
 * or `appendEvent(`, and no insert, update or delete on `order`, `order_event`, `refund`,
 * `payment` or `order_assignment`, as SQL or as a Drizzle builder. The effects are reached only
 * through spec 013's and 016's commands. The fixtures below prove the scan is not vacuous: each
 * holds one offence and must be caught.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const SCANNED = ["src/modules/admin/order-actions", "src/app/admin"];

const TABLES = "order|order_event|refund|payment|order_assignment";
const DRIZZLE_TABLES = "order|orderEvent|refund|payment|orderAssignment";
const OFFENCES: readonly RegExp[] = [
  /\btransition\(/,
  /\bappendEvent\(/,
  new RegExp(
    String.raw`\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?"?(?:${TABLES})"?(?:\s|$|\()`,
    "i",
  ),
  new RegExp(
    String.raw`\.(?:insert|update|delete)\(\s*(?:${DRIZZLE_TABLES})\s*\)`,
  ),
];

function offences(source: string): readonly string[] {
  return OFFENCES.filter((pattern) => pattern.test(source)).map(String);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("T-09 no order write under admin (spec 020a AC-8)", () => {
  it("finds none under the two paths", () => {
    const files = SCANNED.flatMap((dir) => filesUnder(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(5);
    const found = files
      .map(
        (file) =>
          [relative(ROOT, file), offences(readFileSync(file, "utf8"))] as const,
      )
      .filter(([, hits]) => hits.length > 0);
    expect(found).toEqual([]);
  });

  it.each([
    ["an engine call", "await orderService.transition(tx, input);"],
    ["an event append", "await appendEvent(tx, { type: 'order.cancelled' });"],
    ["a raw status update", 'await sql`UPDATE "order" SET status = ${s}`;'],
    ["a raw refund insert", "INSERT INTO refund (id) VALUES ($1)"],
    ["a raw event delete", "delete from public.order_event where id = $1"],
    ["a Drizzle payment update", "await tx.update(payment).set({ status });"],
    ["a Drizzle assignment insert", "tx.insert( orderAssignment ).values(row)"],
  ])("catches %s", (_label, source) => {
    expect(offences(source).length).toBeGreaterThan(0);
  });

  it.each([
    ["a read", 'select * from "order" where id = $1'],
    ["the admin's own row", "INSERT INTO admin_order_action (id) VALUES ($1)"],
    ["an update of another table", "UPDATE order_line_note SET x = 1"],
    ["a word in prose", "the order is updated by spec 013's refund command"],
  ])("lets %s through", (_label, source) => {
    expect(offences(source)).toEqual([]);
  });
});
