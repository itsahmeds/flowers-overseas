// Invalid fixture: raw SQL order-status write (spec 001 AC-7; ADR-0009).
import { sql } from "./stubs";

export const markPaid = (orderId: string) =>
  sql`UPDATE orders SET status = 'paid' WHERE id = ${orderId}`;
