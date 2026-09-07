// Valid fixture: writes a non-status column, and reads status; neither is a transition.
import { db, orders, sql } from "./stubs";

export async function renameRecipient(orderId: string): Promise<void> {
  await db.update(orders).set({ recipient_name_hash: orderId });
  await sql`SELECT status FROM orders WHERE id = ${orderId}`;
}
