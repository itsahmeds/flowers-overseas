/**
 * @purpose POST: the confirm page's "Continue"; consumes the token in process (spec 012 §2.2, AC-9)
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.confirm(request);
}
