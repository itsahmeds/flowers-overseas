/**
 * @purpose POST: the admin email form; the same 303 for every address (spec 012 §2.2, AC-2)
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.requestSignIn(request);
}
