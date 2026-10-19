/**
 * @purpose POST: ask for a link, one 303 for all (AC-2)
 * @spec 012
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.requestSignIn(request);
}
