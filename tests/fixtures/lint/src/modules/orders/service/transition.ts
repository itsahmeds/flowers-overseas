// Valid fixture: the state machine owns the column, so the identical Drizzle call and the
// identical SQL are allowed here (spec 001 AC-7 "passes ... in a fixture path simulating
// src/modules/orders/service/transition.ts"; ADR-0009).
import { db, orders, sql } from "../../../../stubs";

export async function transition(orderId: string): Promise<void> {
  await db.update(orders).set({ status: "paid" }).where(orderId);
  await sql`UPDATE orders SET status = 'paid' WHERE id = ${orderId}`;
}
