/**
 * @purpose POST: admin sign-out
 * @spec 012
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.signOut(request);
}
