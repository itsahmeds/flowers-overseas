/**
 * @purpose POST: confirm the florist sign-in, use the token (AC-19)
 * @spec 011
 */
import { confirmFloristSignIn } from "@/lib/auth/florist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return confirmFloristSignIn(request);
}
