/**
 * Admin partner URLs (spec 030b §14.4; TASK-442's C1 and C2 reminders).
 *
 * Admin's own module, so the one place outside `src/app/admin/` that names an admin partner path
 * (spec 012 AC-6: no public source names `/admin`). The job worker's founder emails link here.
 */

/** A florist's Contracts tab: the partner code only, URL-encoded. */
export function partnerContractsHref(partnerCode: string): string {
  return `/admin/partners/${encodeURIComponent(partnerCode)}/contracts`;
}
