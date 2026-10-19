/**
 * `POST /api/checkout/start` (spec 010 §5.2, AC-6; TASK-203): the product page's entry into
 * checkout. Thin by design (`plan/01` §5): the contract is `startCheckout` in
 * `src/modules/checkout/start.ts`. `GET` answers 405; every answer is `no-store` and `noindex`.
 */
import { checkoutMethodNotAllowed, startCheckout } from "@/modules/checkout";

/** Never cached, never prerendered: it writes a draft and sets a cookie. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return startCheckout(request);
}

export function GET(): Response {
  return checkoutMethodNotAllowed();
}
