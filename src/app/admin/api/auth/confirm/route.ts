/**
 * @purpose POST: confirm sign-in, use the token (AC-9)
 * @spec 012
 */
import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return adminAuth.confirm(request);
}
