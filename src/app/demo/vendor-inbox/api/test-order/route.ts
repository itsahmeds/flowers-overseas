/**
 * @purpose POST: the demo member's "Send a test order" (AC-33)
 * @spec 011
 *
 * A same-origin form post from the inbox list, by a signed-in member of a `demo` partner,
 * outside production: one `placeDemoOrder({ partnerId })` for their demo partner, then back to
 * the list (303), where the new offer is waiting. Anything else (another origin, no session, no
 * demo membership, production, a refusal) changes nothing and lands on the list or sign-in.
 */
import { FLORIST_PATHS } from "@/config/florists";
import { sameOrigin } from "@/lib/auth/surface";
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";
import {
  DemoOrderRefused,
  demoRefusedIn,
  placeDemoOrder,
} from "@/modules/orders/demo";

import { currentFloristContext } from "../../request";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
} as const;

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...HEADERS, location },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return seeOther(FLORIST_PATHS.base);
  const context = await currentFloristContext();
  if (context === null) return seeOther(FLORIST_PATHS.signIn);
  const demo = context.memberships.find(
    (membership) => membership.partnerStatus === "demo",
  );
  if (demo === undefined || demoRefusedIn(appEnvironment(process.env))) {
    return seeOther(FLORIST_PATHS.base);
  }
  try {
    await placeDemoOrder({ partnerId: demo.partnerId });
  } catch (error) {
    if (!(error instanceof DemoOrderRefused)) throw error;
    logger.warn({ code: error.code }, "florists.test_order_refused");
  }
  return seeOther(FLORIST_PATHS.base);
}
