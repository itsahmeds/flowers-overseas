/**
 * The one seam checkout reads of the buyer account (spec 018 §14 A-founder-2026-10-22 C.8, C.12;
 * AC-55 use half, AC-61; TASK-352).
 *
 * `buyerCheckoutProfile(request)` answers `null` without a valid buyer session, and for an admin
 * or a florist cookie (their tokens are bound to their own surfaces, so the buyer surface admits
 * none of them); with one, a `.strict()` object holding exactly the customer's email, name, phone,
 * country and saved recipients, read under the buyer's `customer` context, so RLS keeps every
 * other customer's rows out. It writes nothing.
 *
 * `takeSavedRecipientForCheckout(request, id)` is the only write: `last_used_at` of one of the
 * session customer's saved recipients (C.8 R3), and the copy checkout puts into the order.
 *
 * Checkout's touchpoints R1 to R4 are spec 010's amendment (TASK-419); this file is what they call.
 * Nothing here logs.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  type BuyerContext,
  buyerSessionToken,
  resolveBuyerContext,
  toDbContext,
} from "@/lib/auth/buyer";

import {
  type AccountRunner,
  listSavedRecipients,
  readAccountDetails,
  SavedRecipientSchema,
  type SavedRecipient,
  markSavedRecipientUsed,
} from "./buyer-account";

export const BuyerCheckoutProfileSchema = z
  .object({
    email: z.string().min(1),
    name: z.string().nullable(),
    phoneE164: z.string().nullable(),
    countryIso2: z.string().nullable(),
    savedRecipients: z.array(SavedRecipientSchema),
  })
  .strict();
export type BuyerCheckoutProfile = z.infer<typeof BuyerCheckoutProfileSchema>;

/** The seams a test replaces: the session lookup and the runner of a buyer context. */
export interface CheckoutProfileOptions {
  readonly resolve?: (
    token: string | undefined,
  ) => Promise<BuyerContext | null>;
  readonly runnerFor?: (context: BuyerContext) => AccountRunner;
  readonly now?: () => Date;
}

/** The production runner: one `customer`-context transaction (RLS). */
function customerContextRunner(context: BuyerContext): AccountRunner {
  return async (fn) => {
    const { withDbContext } = await import("@/lib/db");
    return withDbContext(toDbContext(context, randomUUID()), (db) =>
      fn({
        async execute(query) {
          const rows: unknown = await db.execute(query);
          return rows as readonly Record<string, unknown>[];
        },
      }),
    );
  };
}

async function contextOf(
  request: Request,
  options: CheckoutProfileOptions,
): Promise<BuyerContext | null> {
  const token = buyerSessionToken(request.headers.get("cookie"));
  if (token === undefined) return null;
  return (options.resolve ?? ((value) => resolveBuyerContext(value)))(token);
}

/** The buyer's checkout profile, or `null` (AC-61). */
export async function buyerCheckoutProfile(
  request: Request,
  options: CheckoutProfileOptions = {},
): Promise<BuyerCheckoutProfile | null> {
  const context = await contextOf(request, options);
  if (context === null) return null;
  const run = (options.runnerFor ?? customerContextRunner)(context);
  const details = await readAccountDetails(run, context.customerId);
  if (details === null) return null;
  const savedRecipients = await listSavedRecipients(run, context.customerId);
  return BuyerCheckoutProfileSchema.parse({
    email: details.email,
    name: details.name,
    phoneE164: details.phoneE164,
    countryIso2: details.countryIso2,
    savedRecipients,
  });
}

/**
 * Uses one saved recipient of the session's customer at checkout (C.8 R3, AC-55): sets its
 * `last_used_at` and answers the copy, or `null` without a session or for another customer's id.
 */
export async function takeSavedRecipientForCheckout(
  request: Request,
  savedRecipientId: string,
  options: CheckoutProfileOptions = {},
): Promise<SavedRecipient | null> {
  const context = await contextOf(request, options);
  if (context === null) return null;
  const run = (options.runnerFor ?? customerContextRunner)(context);
  const now = (options.now ?? (() => new Date()))();
  return markSavedRecipientUsed(run, context.customerId, savedRecipientId, now);
}
