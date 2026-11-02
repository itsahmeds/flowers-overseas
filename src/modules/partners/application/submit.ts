/**
 * `submitFloristApplication` and its two seams (spec 011 §2 "The write", "The founder alert",
 * §5.2 "Application", §8 "Logs and PII"; AC-11, AC-13, AC-15, AC-16; TASK-213).
 *
 * The order is the spec's: the **honeypot first** (a filled `hp` answers as success and touches
 * nothing), then `FloristApplicationInputSchema`, then the `ApplicationSink` (one row), then the
 * `ApplicationAlert` (one email). The alert runs only after the sink has committed, so a failed
 * alert never loses an application: it is a Sentry warning and the row stays (AC-16). A failed
 * sink is the send-failed state with every answer kept (AC-15).
 *
 * **Nothing submitted leaves through a log line or a Sentry event.** Logs are counters
 * (`florist_application_received: 1`); a failure is reported by a constant signal with no field,
 * and the caught error is never passed on, because a database error quotes the failing row
 * (`DETAIL: Failing row contains (...)`) and a mailer error may too.
 *
 * The seams follow `ReminderSink` (`src/lib/reminders.ts`): `dbApplicationSink` (`./sink.ts`) and
 * `mailerApplicationAlert` (`./alert.ts`) in the application, fakes in the unit tests.
 */
import type { Logger } from "@/lib/logger";

import {
  type ApplicationField,
  type FloristApplicationInput,
  FloristApplicationInputSchema,
  HONEYPOT_FIELD,
  applicationFieldErrors,
} from "./schema.ts";

/** What is stored and sent: the parsed answers and the notice the applicant was shown. */
export type FloristApplication = Omit<FloristApplicationInput, "hp"> & {
  readonly privacyNoticeVersion: string;
};

/** Stores one application. Throws when it could not. */
export interface ApplicationSink {
  accept(application: FloristApplication): Promise<void>;
}

/** Tells the founder about one stored application. Throws when it could not. */
export interface ApplicationAlert {
  notify(application: FloristApplication): Promise<void>;
}

/** No alert: where no address is configured outside production. */
export const noopApplicationAlert: ApplicationAlert = Object.freeze({
  notify: () => Promise.resolve(),
});

/** The constant signals a failure is reported under (carried as Sentry's `signal` tag). */
export const APPLICATION_SIGNALS = Object.freeze({
  sinkFailed: "florist_application_sink_failed",
  alertFailed: "florist_application_alert_failed",
} as const);

export interface SubmitDeps {
  readonly sink: ApplicationSink;
  readonly alert: ApplicationAlert;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
  /** `captureWarning` in the application: a constant signal, no field value. */
  readonly report: (signal: string) => void;
  /** The version of the notice at collection the page showed (`applicationNoticeVersion`). */
  readonly privacyNoticeVersion: string;
}

export type SubmitResult =
  | { readonly ok: true; readonly stored: boolean }
  | {
      readonly ok: false;
      readonly kind: "invalid" | "failed";
      readonly fieldErrors: Partial<Record<ApplicationField, string>>;
    };

export async function submitFloristApplication(
  input: Readonly<Record<string, string>>,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const { logger: log } = deps;

  // The honeypot, before the schema (§2): a bot that fills every field is told it succeeded.
  const honeypot = input[HONEYPOT_FIELD];
  if (honeypot !== undefined && honeypot !== "") {
    log.info({ florist_application_honeypot: 1 }, "florist application");
    return { ok: true, stored: false };
  }

  const parsed = FloristApplicationInputSchema.safeParse(input);
  if (!parsed.success) {
    log.info({ florist_application_invalid: 1 }, "florist application");
    return {
      ok: false,
      kind: "invalid",
      fieldErrors: applicationFieldErrors(parsed.error),
    };
  }

  const application: FloristApplication = {
    businessName: parsed.data.businessName,
    contactName: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    country: parsed.data.country,
    town: parsed.data.town,
    deliveryArea: parsed.data.deliveryArea,
    capacityPerDay: parsed.data.capacityPerDay,
    weekendDelivery: parsed.data.weekendDelivery,
    registrationNumber: parsed.data.registrationNumber,
    website: parsed.data.website,
    contactPreference: parsed.data.contactPreference,
    language: parsed.data.language,
    privacyNoticeVersion: deps.privacyNoticeVersion,
  };

  try {
    await deps.sink.accept(application);
  } catch {
    log.error({ florist_application_sink_failed: 1 }, "florist application");
    deps.report(APPLICATION_SIGNALS.sinkFailed);
    return { ok: false, kind: "failed", fieldErrors: {} };
  }
  log.info({ florist_application_received: 1 }, "florist application");

  try {
    await deps.alert.notify(application);
  } catch {
    log.warn({ florist_application_alert_failed: 1 }, "florist application");
    deps.report(APPLICATION_SIGNALS.alertFailed);
  }
  return { ok: true, stored: true };
}
