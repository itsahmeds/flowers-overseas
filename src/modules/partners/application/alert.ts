/**
 * The founder's alert for each stored florist application (spec 011 §2 "The founder alert",
 * §5.2 "Mail", §13 Q8; AC-16; TASK-213).
 *
 * One email per stored application, to `FLORIST_APPLICATIONS_NOTIFY_EMAIL`, through the shared
 * core's `Mailer` (TASK-217) under the tag `florist_application_alert`, carrying every answer.
 * The template is here rather than under a top-level `emails/` directory, for the reason the two
 * sign-in emails give (`src/modules/partners/auth/sign-in-email.ts`): a new code root would need
 * every repository-wide scan widened, and no React Email dependency is added for one message. A
 * plain-text part and a minimal HTML part, every word from `emails.floristApplicationAlert.*` and
 * the form's own option labels, in English: the founder reads it, whatever the applicant's
 * language (which the email names).
 *
 * The applicant's address is the email's content, never its sender or reply path: the founder
 * replies personally (§13 Q12), and no copy goes to the applicant.
 *
 * Which alert runs is `applicationAlertFor()`: the mailer alert when the address is set; with no
 * address, nothing outside `production`, and in `production` an alert that fails, so the gap is a
 * Sentry warning (the application is still stored) rather than silence.
 */
import { createTranslator } from "next-intl";

import { TRADING_NAME } from "@/config/company.data";
import { activeCountries } from "@/config/countries";
import { type EnvSource, appEnvironment } from "@/lib/env.schema";
import { floristApplicationsNotifyEmail } from "@/lib/env.florists";
import { loadMessages } from "@/modules/i18n";
import { type Mailer, getMailer } from "@/modules/notifications";

import {
  type ApplicationAlert,
  type FloristApplication,
  noopApplicationAlert,
} from "./submit.ts";

/** The alert's language: the founder's. */
const ALERT_LOCALE = "en";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function translator() {
  return createTranslator({
    locale: ALERT_LOCALE,
    messages: loadMessages(ALERT_LOCALE, [
      "emails",
      "forFlorists",
      "destinations",
    ]),
  });
}

type AlertTranslator = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

/** The rows of the alert: a label and the answer, in the form's order. */
export function applicationAlertRows(
  application: FloristApplication,
  t: AlertTranslator,
): readonly (readonly [label: string, value: string])[] {
  const none = t("emails.floristApplicationAlert.none");
  const country = activeCountries().find(
    (row) => row.iso2 === application.country,
  );
  const weekends = {
    yes: "forFlorists.apply.field.weekends.yes",
    sometimes: "forFlorists.apply.field.weekends.sometimes",
    no: "forFlorists.apply.field.weekends.no",
  } as const;
  const contactBy = {
    email: "forFlorists.apply.field.contactBy.email",
    whatsapp: "forFlorists.apply.field.contactBy.whatsapp",
    phone: "forFlorists.apply.field.contactBy.phone",
  } as const;
  const language = {
    en: "forFlorists.apply.field.language.en",
    pl: "forFlorists.apply.field.language.pl",
    de: "forFlorists.apply.field.language.de",
  } as const;
  // Each key written out in full, so `pnpm i18n:check` sees it used.
  return [
    [t("emails.floristApplicationAlert.field.shop"), application.businessName],
    [
      t("emails.floristApplicationAlert.field.contact"),
      application.contactName,
    ],
    [t("emails.floristApplicationAlert.field.email"), application.email],
    [t("emails.floristApplicationAlert.field.phone"), application.phone],
    [
      t("emails.floristApplicationAlert.field.country"),
      country === undefined ? application.country : t(country.nameKey),
    ],
    [t("emails.floristApplicationAlert.field.town"), application.town],
    [t("emails.floristApplicationAlert.field.area"), application.deliveryArea],
    [
      t("emails.floristApplicationAlert.field.capacity"),
      String(application.capacityPerDay),
    ],
    [
      t("emails.floristApplicationAlert.field.weekends"),
      t(weekends[application.weekendDelivery]),
    ],
    [
      t("emails.floristApplicationAlert.field.registration"),
      application.registrationNumber ?? none,
    ],
    [
      t("emails.floristApplicationAlert.field.website"),
      application.website ?? none,
    ],
    [
      t("emails.floristApplicationAlert.field.contactBy"),
      t(contactBy[application.contactPreference]),
    ],
    [
      t("emails.floristApplicationAlert.field.language"),
      t(language[application.language]),
    ],
    [
      t("emails.floristApplicationAlert.field.notice"),
      application.privacyNoticeVersion,
    ],
  ];
}

/** Subject, plain text and HTML of one alert. */
export function renderApplicationAlertEmail(application: FloristApplication): {
  subject: string;
  text: string;
  html: string;
} {
  const t = translator() as unknown as AlertTranslator;
  const subject = t("emails.floristApplicationAlert.subject", {
    businessName: application.businessName,
  });
  const intro = t("emails.floristApplicationAlert.intro");
  const rows = applicationAlertRows(application, t);
  const text = [
    TRADING_NAME,
    "",
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
  ].join("\n");
  const html = [
    `<!doctype html><html lang="${ALERT_LOCALE}"><body>`,
    `<p><strong>${escapeHtml(TRADING_NAME)}</strong></p>`,
    `<p>${escapeHtml(intro)}</p>`,
    "<table>",
    ...rows.map(
      ([label, value]) =>
        `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    ),
    "</table>",
    "</body></html>",
  ].join("");
  return { subject, text, html };
}

/** The alert that emails `to` through `mailer`. */
export function mailerApplicationAlert(options: {
  readonly to: string;
  readonly mailer: Mailer;
}): ApplicationAlert {
  return {
    async notify(application) {
      await options.mailer.send({
        tag: "florist_application_alert",
        to: options.to,
        ...renderApplicationAlertEmail(application),
      });
    },
  };
}

/** No address in `production`: the alert fails, so `submitFloristApplication` reports it. */
const unconfiguredApplicationAlert: ApplicationAlert = Object.freeze({
  notify: () =>
    Promise.reject(new Error("FLORIST_APPLICATIONS_NOTIFY_EMAIL is not set")),
});

/**
 * The alert this environment uses (see the module note). Everything is resolved lazily inside
 * `notify`, so a configuration fault (a malformed address, a `resend` mailer with no key) is a
 * failed alert, which `submitFloristApplication` reports, and never a lost application.
 */
export function applicationAlertFor(
  source: EnvSource,
  mailer: () => Mailer = getMailer,
): ApplicationAlert {
  let to: string | undefined;
  try {
    to = floristApplicationsNotifyEmail(source);
  } catch {
    return unconfiguredApplicationAlert;
  }
  if (to !== undefined) {
    const address = to;
    return {
      async notify(application) {
        await mailerApplicationAlert({ to: address, mailer: mailer() }).notify(
          application,
        );
      },
    };
  }
  let environment: string;
  try {
    environment = appEnvironment(source);
  } catch {
    environment = "production";
  }
  return environment === "production"
    ? unconfiguredApplicationAlert
    : noopApplicationAlert;
}
