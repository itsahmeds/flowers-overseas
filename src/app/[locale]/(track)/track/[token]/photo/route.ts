/**
 * @purpose Tracking photo proxy
 * @spec 018
 *
 * `GET /{locale}/track/{token}/photo` (spec 018 §5.3, AC-6, AC-12; TASK-338): the buyer's delivery
 * photo through a token-checked proxy, so the private bucket is never named in a page and the
 * page's CSP needs only `img-src 'self'` (§5.4). The work is `photoResponse()`.
 *
 * The private bucket's storage is the R2 adapter of spec 006 (TASK-082), which does not exist yet:
 * until it does, `storage` is `undefined` and every request answers 404, which is also what a
 * missing photo answers. Wiring it is one line here.
 */
import type { Storage } from "@/lib/storage";

import { photoResponse } from "../tracking-routes";

export const dynamic = "force-dynamic";

/** The private bucket's storage (TASK-082 replaces this with the R2 adapter). */
const PRIVATE_STORAGE: Storage | undefined = undefined;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; token: string }> },
): Promise<Response> {
  const { token } = await params;
  return photoResponse(token, { storage: PRIVATE_STORAGE });
}
