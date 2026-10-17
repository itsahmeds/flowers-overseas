/**
 * @purpose The admin instance's Auth.js handlers at /admin/api/auth (spec 012 §5.2)
 *
 * Thin: the instance is `@/lib/auth/admin`. The core uses Auth.js's email callback in process
 * (`confirm`); these handlers answer Auth.js's own endpoints (`session`, `csrf`, `providers`).
 */
import type { NextRequest } from "next/server";

import { adminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<Response> {
  return adminAuth.handlers.GET(request);
}

export function POST(request: NextRequest): Promise<Response> {
  return adminAuth.handlers.POST(request);
}
