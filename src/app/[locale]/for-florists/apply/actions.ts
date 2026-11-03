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
import { z } from "zod";

import { floristsConfig } from "@/config/florists";
import {
  APPLICATION_RATE_LIMIT,
  APPLICATION_WINDOW_MS,
  applicationPost,
} from "@/modules/partners/application/form";
import { applicationAlertFor } from "@/modules/partners/application/alert";
import { applicationNoticeVersion } from "@/modules/partners/application/notice";
import { dbApplicationSink } from "@/modules/partners/application/sink";
import { ApplyFormStateSchema } from "@/modules/partners/application/schema";
import {
  type ApplyFormState,
  INITIAL_APPLY_STATE,
} from "@/modules/partners/application/state";
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

/** The bound locale, parsed like every other input: one the site routes, or the post is refused. */
const BoundLocaleSchema = z
  .string()
  .refine((locale) => routableLocale(locale) !== undefined);

export async function submitFloristApplicationAction(
  locale: unknown,
  previous: unknown,
  form: unknown,
): Promise<ApplyFormState> {
  const state = ApplyFormStateSchema.catch(INITIAL_APPLY_STATE).parse(previous);
  const bound = BoundLocaleSchema.safeParse(locale);
  if (
    floristsConfig.applicationForm !== "on" ||
    !bound.success ||
    !infoPageExists("florist-apply", bound.data)
  ) {
    return state;
  }
  const outcome = await applicationPost(form, state, {
    sink: dbApplicationSink(),
    alert: applicationAlertFor(process.env),
    logger,
    report: (signal) => {
      captureWarning(signal);
    },
    privacyNoticeVersion: applicationNoticeVersion(bound.data),
    limiter,
  });
  if (outcome.kind === "sent") {
    redirect(infoPagePath("florist-apply-sent", bound.data));
  }
  return outcome.state;
}
