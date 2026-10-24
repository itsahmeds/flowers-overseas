/**
 * @purpose POST: florist sign-out
 * @spec 011
 */
import { floristAuth } from "@/lib/auth/florist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return floristAuth.signOut(request);
}
