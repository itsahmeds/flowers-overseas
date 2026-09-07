// Invalid fixture: direct Drizzle write to orders.status (spec 001 AC-7; ADR-0009).
// Simulates a file outside src/modules/orders/service/ — see
// src/modules/orders/service/transition.ts for the identical call in the one allowed place.
import { db, orders } from "./stubs";

export async function markPaid(orderId: string): Promise<void> {
  await db.update(orders).set({ status: "paid" }).where(orderId);
}
