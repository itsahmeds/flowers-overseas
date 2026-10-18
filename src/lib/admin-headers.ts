/**
 * The headers of every `/admin` response (spec 012 §2.2 "Never indexable, never discoverable",
 * §5.4, AC-5; TASK-217).
 *
 * `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store, private` on every response under
 * `/admin` — pages, sign-in, 401/403/404, server actions, `/admin/api/**`, auth endpoints — set in
 * `next.config.ts`'s `headers()` so that no response class escapes it. Listed after the
 * environment-wide `noindex` rule, so on a non-production host the admin value is the one sent.
 * Next sets its own `private, no-cache, no-store, max-age=0, must-revalidate` on a dynamic page,
 * which carries both directives; the core's own responses set exactly this pair
 * (`AUTH_RESPONSE_HEADERS`).
 */
export const ADMIN_ROBOTS_HEADER = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
} as const;

export const ADMIN_CACHE_HEADER = {
  key: "Cache-Control",
  value: "no-store, private",
} as const;

export interface AdminHeaderRule {
  readonly source: string;
  readonly headers: { key: string; value: string }[];
}

export function adminHeaderRules(): AdminHeaderRule[] {
  const headers = [{ ...ADMIN_ROBOTS_HEADER }, { ...ADMIN_CACHE_HEADER }];
  return [
    { source: "/admin", headers },
    { source: "/admin/:path*", headers },
  ];
}
