/**
 * @purpose POST: ask for a buyer sign-in link, one 303 for every address (AC-48)
 * @spec 018
 */
import { requestBuyerSignIn } from "@/lib/auth/buyer";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return requestBuyerSignIn(request);
}
