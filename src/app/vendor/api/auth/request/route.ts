/**
 * @purpose POST: ask for a florist link, one 303 for every address (AC-18)
 * @spec 011
 */
import { requestFloristSignIn } from "@/lib/auth/florist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return requestFloristSignIn(request);
}
