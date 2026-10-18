/**
 * @purpose POST: admin sign-out; deletes the session row and expires the cookie (spec 012 §2.2)
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.signOut(request);
}
