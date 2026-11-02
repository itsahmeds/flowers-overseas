/**
 * The florist application's server action (spec 011 §2 "The application form", §5.2 "Server
 * action"; AC-11, AC-12, AC-13, AC-15, AC-16; TASK-213).
 *
 * Thin, as `plan/01` §5 asks of `app/`: the apply page binds the page's locale as the first
 * argument (`submitFloristApplicationAction.bind(null, locale)`) and hands the action to the form
 * island's `useActionState`, which works with JavaScript off (the form posts to its own URL and
 * the page re-renders with the returned state). Everything that decides is
 * `applicationPost` (`src/modules/partners/application/form.ts`); this file wires the
 * application's seams into it and turns `sent` into the redirect, a `303` with no query string.
 *
 * With `applicationForm: "off"` the page draws no form, and a post forged against the action
 * anyway writes nothing. Next's server actions keep their own `Origin` check.
 */
"use server";

import { redirect } from "next/navigation";

import { floristsConfig } from "@/config/florists";
import {
  APPLICATION_RATE_LIMIT,
  APPLICATION_WINDOW_MS,
  applicationPost,
} from "@/modules/partners/application/form";
import { applicationAlertFor } from "@/modules/partners/application/alert";
import { applicationNoticeVersion } from "@/modules/partners/application/notice";
import { dbApplicationSink } from "@/modules/partners/application/sink";
import type { ApplyFormState } from "@/modules/partners/application/state";
import { createRateLimiter } from "@/lib/csp-report";
import { logger } from "@/lib/logger";
import { captureWarning } from "@/lib/sentry";
import { infoPageExists, infoPagePath } from "@/modules/content";
import { routableLocale } from "@/modules/i18n";

/** One window per running instance: global on Railway's single replica (ADR-0018). */
const limiter = createRateLimiter(
  APPLICATION_RATE_LIMIT,
  APPLICATION_WINDOW_MS,
);

export async function submitFloristApplicationAction(
  locale: string,
  previous: ApplyFormState,
  form: FormData,
): Promise<ApplyFormState> {
  if (
    floristsConfig.applicationForm !== "on" ||
    routableLocale(locale) === undefined ||
    !infoPageExists("florist-apply", locale)
  ) {
    return previous;
  }
  const outcome = await applicationPost(form, previous, {
    sink: dbApplicationSink(),
    alert: applicationAlertFor(process.env),
    logger,
    report: (signal) => {
      captureWarning(signal);
    },
    privacyNoticeVersion: applicationNoticeVersion(locale),
    limiter,
  });
  if (outcome.kind === "sent") {
    redirect(infoPagePath("florist-apply-sent", locale));
  }
  return outcome.state;
}
