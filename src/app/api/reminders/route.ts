/**
 * `POST /api/reminders` — the occasion-reminder signup stub (spec 004 design round 6,
 * `docs/design/homepage-v1/README.md`; TASK-049).
 *
 * Thin by design (`plan/01` §5): the accepted content type, the schema, the sink seam, the status
 * codes and the "stores nothing, sends nothing, logs no address" rule live in `@/lib/reminders`,
 * where they are unit-testable without a server.
 *
 * The one thing this file owns is the **redirect target**: `localePath()` maps the submitted
 * locale code to that locale's home, and an unknown code yields `undefined`, which the handler
 * answers `400`. `routableLocale`, not `launchLocale`: the pseudo-locale documents of
 * `ENABLE_PSEUDO_LOCALES` have a footer with this form in it, and a preview where the form 400s
 * would hide a real regression behind a flag. So the `Location` header can only ever be a path this application builds — a
 * user-supplied path never reaches it and `Referer` is not read at all.
 *
 * `no-store` and `X-Robots-Tag: noindex` come from the handler's own headers as well as from
 * spec 001's `/api/` robots disallow.
 */
import { reminderResponse } from "@/lib/reminders";
import { localePath, routableLocale } from "@/modules/i18n";

/** Never cached, never prerendered: it is a write path for a form submission. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return reminderResponse(request, {
    homePath: (locale) =>
      routableLocale(locale) === undefined
        ? undefined
        : localePath(locale, "home"),
  });
}
