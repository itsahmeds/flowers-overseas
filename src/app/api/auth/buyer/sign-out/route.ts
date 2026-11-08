/**
 * @purpose POST: buyer sign-out, the session row deleted (AC-24)
 * @spec 018
 */
import { signOutBuyer } from "@/lib/auth/buyer";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return signOutBuyer(request);
}
