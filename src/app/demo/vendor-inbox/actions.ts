/**
 * @purpose The florist action posts' shared plumbing: answers, notices, the member's context
 * @spec 011
 *
 * Every action (accept, decline, out for delivery, the photo) is a no-JS form post to a route
 * under `{base}/api/orders/{assignmentId}/…` that answers `303` to a page (TASK-215). A refusal
 * comes back as one of three notices on the order page (`?notice=answered|changed|expired`), a
 * refused photo as one of two errors on the photo step (`?error=wrong_type|too_large`): codes,
 * never a value, so no URL carries anything about the order or the person.
 */
import type { FloristContext } from "@/lib/auth/florist";
import type {
  FloristActionErrorCode,
  FloristCommandContext,
} from "@/modules/orders/florist-actions";

export const ACTION_HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
} as const;

/** `303 See Other` to a florist page. */
export function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...ACTION_HEADERS, location },
  });
}

/** The three notices an order page can show after a refused action. */
export const ORDER_NOTICES = ["answered", "changed", "expired"] as const;
export type OrderNotice = (typeof ORDER_NOTICES)[number];

/** The notice of a refusal; `null` for a hidden assignment (the order page is then a 404). */
export function noticeOf(code: FloristActionErrorCode): OrderNotice | null {
  switch (code) {
    case "ASSIGNMENT_ALREADY_ANSWERED":
      return "answered";
    case "ASSIGNMENT_EXPIRED":
      return "expired";
    case "ORDER_STATE_CHANGED":
      return "changed";
    case "ASSIGNMENT_NOT_FOUND":
      return null;
  }
}

/** A query value among `allowed`, or `undefined`. */
export function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | string[] | undefined,
): T | undefined {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** `path?{key}={value}`, or `path` alone. */
export function withQuery(
  path: string,
  key: string,
  value: string | null,
): string {
  return value === null ? path : `${path}?${key}=${value}`;
}

/** The member as the commands take them. */
export function commandContextOf(
  context: FloristContext,
  requestId?: string,
): FloristCommandContext {
  return {
    userId: context.userId,
    partnerIds: context.memberships.map((membership) => membership.partnerId),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

/** A small url-encoded form, read with a bound (the action posts carry one or two fields). */
export const SMALL_FORM_MAX_BYTES = 4 * 1024;
