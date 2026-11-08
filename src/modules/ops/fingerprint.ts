/**
 * The alert fingerprint, pure (spec 025 §5.4 "Fingerprint"; AC-2; TASK-488):
 * `name:(order_id | component[:sub-key])`, for example `routing.no_partner:<uuid>`,
 * `webhook.error_rate:stripe`, `site.page_failing:site:sitemap`. One open row per fingerprint and
 * environment is the deduplication rule.
 */
import type { AlertComponent, AlertName } from "./registry.ts";

export type AlertSubject =
  | { readonly orderId: string }
  | { readonly component: AlertComponent; readonly subKey?: string };

export function fingerprintOf(name: AlertName, subject: AlertSubject): string {
  if ("orderId" in subject) return `${name}:${subject.orderId}`;
  return subject.subKey === undefined
    ? `${name}:${subject.component}`
    : `${name}:${subject.component}:${subject.subKey}`;
}
