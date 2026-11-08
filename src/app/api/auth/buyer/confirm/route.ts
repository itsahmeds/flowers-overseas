/**
 * @purpose POST: confirm the buyer sign-in, use the token (AC-24, AC-49, AC-50)
 * @spec 018
 */
import { confirmBuyerSignIn } from "@/lib/auth/buyer";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return confirmBuyerSignIn(request);
}
