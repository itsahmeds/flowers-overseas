/**
 * Admin payout URLs (spec 030a §2.8 `/admin/payouts/[id]`, §5.2 "Founder emails"; TASK-363).
 *
 * Admin's own module, so the one place outside `src/app/admin/` that names an admin payout path
 * (spec 012 AC-6: no public source names `/admin`). F1 links here; TASK-367 builds the page.
 */
import { z } from "zod";

/** A payout's detail page: the uuid only, never an amount or a statement number. */
export function payoutDetailHref(payoutId: string): string {
  return `/admin/payouts/${z.uuid().parse(payoutId)}`;
}
