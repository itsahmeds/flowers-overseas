/**
 * @purpose POST: store the florist's language (AC-32)
 * @spec 011
 */
import { setFloristLanguage } from "@/lib/auth/florist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return setFloristLanguage(request);
}
