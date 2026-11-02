/**
 * The florist application's post, from `FormData` to the next screen (spec 011 §2, §5.2, §8;
 * TASK-213): T-12 (schema half: one case per field), T-13 (honeypot, limiter, 65 KB body,
 * unknown field), T-15 (a throwing sink: answers kept, the Sentry event carries no value), T-16
 * (exactly one alert per stored application, none otherwise; a throwing mailer leaves the row and
 * reports a warning with no value), and the unit half of T-11 (what the sink receives).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage,
  getCurrentScope: () => ({ setTag: () => undefined }),
}));

const { captureWarning } = await import("../../src/lib/sentry.ts");
const { createRateLimiter } = await import("../../src/lib/csp-report.ts");
const { APPLICATION_BODY_LIMIT, applicationBodyGate, applicationPaths } =
  await import("../../src/lib/application-gate.ts");
const { applicationPost, APPLICATION_RATE_LIMIT } =
  await import("../../src/modules/partners/application/form.ts");
const { INITIAL_APPLY_STATE } =
  await import("../../src/modules/partners/application/state.ts");
const { APPLICATION_ERROR_KEYS, FloristApplicationInputSchema } =
  await import("../../src/modules/partners/application/schema.ts");
const { APPLICATION_SIGNALS } =
  await import("../../src/modules/partners/application/submit.ts");
const {
  applicationAlertFor,
  mailerApplicationAlert,
  renderApplicationAlertEmail,
} = await import("../../src/modules/partners/application/alert.ts");
const { applicationNoticeVersion } =
  await import("../../src/modules/partners/application/notice.ts");
const { applicationRow } =
  await import("../../src/modules/partners/application/sink.ts");
const { capturingMailer } =
  await import("../../src/modules/notifications/mailer.ts");
const { mailTags } = await import("../../src/modules/notifications/mailer.ts");

type FloristApplication = Parameters<typeof renderApplicationAlertEmail>[0];

/** A valid post, as the form sends it. Synthetic: no real shop or person. */
const VALID = Object.freeze({
  businessName: "Kwiaciarnia Przykładowa",
  contactName: "Ola Testowa",
  email: "ola@example.test",
  phone: "+48 512 000 000",
  country: "PL",
  town: "Kraków",
  capacityPerDay: "12",
  deliveryArea: "Stare Miasto, Kazimierz",
  weekendDelivery: "sometimes",
  registrationNumber: "",
  website: "https://www.instagram.com/kwiaciarnia.example",
  contactPreference: "whatsapp",
  language: "pl",
  hp: "",
});

/** Every value of `VALID` worth looking for in a log line or an event. */
const SUBMITTED_VALUES = [
  "Kwiaciarnia",
  "Ola Testowa",
  "ola@example.test",
  "512 000 000",
  "Kraków",
  "Kazimierz",
  "instagram.com",
];

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  // React's own bookkeeping field on a JavaScript-off post: dropped, never "unknown".
  data.append("$ACTION_KEY", "k0");
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

interface Harness {
  readonly stored: FloristApplication[];
  readonly lines: unknown[];
  readonly reports: string[];
  readonly mail: ReturnType<typeof capturingMailer>;
  deps(
    overrides?: Record<string, unknown>,
  ): Parameters<typeof applicationPost>[2];
}

function harness(): Harness {
  const stored: FloristApplication[] = [];
  const lines: unknown[] = [];
  const reports: string[] = [];
  const mail = capturingMailer("alerts@example.test");
  mail.clear();
  const log = (fields: unknown, message?: string): void => {
    lines.push({ fields, message });
  };
  return {
    stored,
    lines,
    reports,
    mail,
    deps: (overrides = {}) => ({
      sink: {
        accept: (application: FloristApplication) => {
          stored.push(application);
          return Promise.resolve();
        },
      },
      alert: mailerApplicationAlert({
        to: "founder@example.test",
        mailer: mail,
      }),
      logger: { info: log, warn: log, error: log } as never,
      report: (signal: string) => {
        reports.push(signal);
        captureWarning(signal);
      },
      privacyNoticeVersion: "apply-notice-0123456789abcdef",
      limiter: createRateLimiter(100, 60_000),
      ...overrides,
    }),
  };
}

beforeEach(() => {
  captureMessage.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("T-11 (unit half) / AC-11: a valid post", () => {
  it("stores one application with every answer and the notice version, then lands on the sent page", async () => {
    const h = harness();
    const outcome = await applicationPost(
      form(VALID),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    expect(outcome).toEqual({ kind: "sent" });
    expect(h.stored).toHaveLength(1);
    expect(h.stored[0]).toEqual({
      businessName: "Kwiaciarnia Przykładowa",
      contactName: "Ola Testowa",
      email: "ola@example.test",
      phone: "+48 512 000 000",
      country: "PL",
      town: "Kraków",
      capacityPerDay: 12,
      deliveryArea: "Stare Miasto, Kazimierz",
      weekendDelivery: "sometimes",
      registrationNumber: undefined,
      website: "https://www.instagram.com/kwiaciarnia.example",
      contactPreference: "whatsapp",
      language: "pl",
      privacyNoticeVersion: "apply-notice-0123456789abcdef",
    });
  });

  it("maps the answers onto the row's columns, the Instagram answer into instagram_url", () => {
    const h = harness();
    const parsed = FloristApplicationInputSchema.parse(VALID);
    const row = applicationRow({
      ...parsed,
      privacyNoticeVersion: "apply-notice-0123456789abcdef",
    });
    expect(row).toMatchObject({
      businessName: "Kwiaciarnia Przykładowa",
      contactName: "Ola Testowa",
      contactEmail: "ola@example.test",
      contactPhone: "+48 512 000 000",
      city: "Kraków",
      coverageNote: "Stare Miasto, Kazimierz",
      capacityPerDay: 12,
      weekendDelivery: "sometimes",
      registrationNumber: null,
      instagramUrl: "https://www.instagram.com/kwiaciarnia.example",
      websiteUrl: null,
      preferredChannel: "whatsapp",
      languageCode: "pl",
      privacyNoticeVersion: "apply-notice-0123456789abcdef",
    });
    const site = applicationRow({
      ...parsed,
      website: "https://kwiaciarnia.example",
      privacyNoticeVersion: "v",
    });
    expect([site.instagramUrl, site.websiteUrl]).toEqual([
      null,
      "https://kwiaciarnia.example",
    ]);
    expect(h.stored).toHaveLength(0);
  });

  it("names the page's notice: a fixed, bounded version per locale's wording", () => {
    const en = applicationNoticeVersion("en");
    expect(en).toMatch(/^apply-notice-[0-9a-f]{16}$/u);
    expect(en.length).toBeLessThanOrEqual(64);
    expect(applicationNoticeVersion("en")).toBe(en);
    // `en-gb` extends `en` and shows the same words; German shows other words.
    expect(applicationNoticeVersion("en-gb")).toBe(en);
    expect(applicationNoticeVersion("de")).not.toBe(en);
  });
});

describe("T-12 (schema half) / AC-12: one refusal per field, each with its own message key", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["businessName", "   "],
    ["contactName", ""],
    ["email", "piotr.nowak@example"],
    ["phone", "call me"],
    ["country", "GB"],
    ["town", ""],
    ["capacityPerDay", "0"],
    ["capacityPerDay", "501"],
    ["capacityPerDay", "2.5"],
    ["deliveryArea", ""],
    ["weekendDelivery", "often"],
    ["registrationNumber", "x".repeat(101)],
    ["website", "ftp://kwiaciarnia.example"],
    ["website", "not a url"],
    ["contactPreference", "fax"],
    ["language", "fr"],
  ];

  it.each(cases)("%s = %j", async (field, value) => {
    const h = harness();
    const outcome = await applicationPost(
      form({ ...VALID, [field]: value }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    expect(outcome.kind).toBe("render");
    if (outcome.kind !== "render") return;
    expect(outcome.state.status).toBe("invalid");
    expect(outcome.state.errors).toEqual({
      [field]:
        APPLICATION_ERROR_KEYS[field as keyof typeof APPLICATION_ERROR_KEYS],
    });
    // Every answer kept, the refused one included, so the applicant corrects rather than retypes.
    expect(outcome.state.values).toMatchObject({
      ...Object.fromEntries(
        Object.entries(VALID).filter(([key]) => key !== "hp"),
      ),
      [field]: value.slice(0, 1000),
    });
    expect(h.stored).toHaveLength(0);
    expect(h.mail.messages()).toHaveLength(0);
  });

  it("refuses a missing radio answer with that field's key, not zod's English", async () => {
    const h = harness();
    const rest: Record<string, string> = { ...VALID };
    delete rest["weekendDelivery"];
    const outcome = await applicationPost(
      form(rest),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    expect(outcome).toMatchObject({
      kind: "render",
      state: {
        status: "invalid",
        errors: { weekendDelivery: "forFlorists.apply.error.weekends" },
      },
    });
  });

  it("counts attempts, so a second refusal with the same errors moves focus again", async () => {
    const h = harness();
    const first = await applicationPost(
      form({ ...VALID, email: "x" }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    if (first.kind !== "render") throw new Error("expected a render");
    const second = await applicationPost(
      form({ ...VALID, email: "x" }),
      first.state,
      h.deps(),
    );
    if (second.kind !== "render") throw new Error("expected a render");
    expect([first.state.attempt, second.state.attempt]).toEqual([1, 2]);
  });
});

describe("T-13 / AC-13: honeypot, limit, body bound, unknown field", () => {
  it("a filled honeypot lands on the sent page and stores and sends nothing", async () => {
    const h = harness();
    const outcome = await applicationPost(
      form({ ...VALID, hp: "https://spam.example" }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    expect(outcome).toEqual({ kind: "sent" });
    expect(h.stored).toHaveLength(0);
    expect(h.mail.messages()).toHaveLength(0);
  });

  it("past the per-instance limit: the too-many state, answers kept, nothing stored", async () => {
    const h = harness();
    const deps = h.deps({ limiter: createRateLimiter(2, 60_000, () => 0) });
    for (let post = 0; post < 2; post += 1) {
      expect(
        await applicationPost(form(VALID), INITIAL_APPLY_STATE, deps),
      ).toEqual({
        kind: "sent",
      });
    }
    const third = await applicationPost(form(VALID), INITIAL_APPLY_STATE, deps);
    expect(third).toMatchObject({
      kind: "render",
      state: {
        status: "tooMany",
        errors: {},
        values: { businessName: VALID.businessName, email: VALID.email },
      },
    });
    expect(h.stored).toHaveLength(2);
    expect(h.mail.messages()).toHaveLength(2);
    expect(APPLICATION_RATE_LIMIT).toBe(10);
  });

  it("a field the schema does not know writes nothing", async () => {
    const h = harness();
    const outcome = await applicationPost(
      form({ ...VALID, iban: "PL61109010140000071219812874" }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    expect(outcome).toMatchObject({
      kind: "render",
      state: { status: "invalid" },
    });
    expect(h.stored).toHaveLength(0);
    if (outcome.kind === "render") {
      expect(outcome.state.values).not.toHaveProperty("iban");
    }
  });

  it("a field posted twice, or a file part, writes nothing", async () => {
    const h = harness();
    const twice = form(VALID);
    twice.append("email", "second@example.test");
    const file = form(VALID);
    file.append("photo", new Blob(["x"]), "x.jpg");
    for (const data of [twice, file]) {
      const outcome = await applicationPost(
        data,
        INITIAL_APPLY_STATE,
        h.deps(),
      );
      expect(outcome).toMatchObject({
        kind: "render",
        state: { status: "invalid" },
      });
    }
    expect(h.stored).toHaveLength(0);
  });

  it("the proxy answers 413 to a post declaring more than 64 KB to an apply path, in every locale", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { proxy } = await import("../../src/proxy.ts");
    const paths = [...applicationPaths()];
    expect(paths).toEqual(
      expect.arrayContaining([
        "/en/for-florists/apply",
        "/en-gb/for-florists/apply",
        "/de/fuer-floristen/bewerben",
        "/pl/dla-kwiaciarni/zglos-sie",
      ]),
    );
    for (const path of paths) {
      const response = proxy(
        new NextRequest(
          new Request(`https://example.test${path}`, {
            method: "POST",
            headers: { "content-length": String(65 * 1024) },
          }),
        ),
      );
      expect(response.status, path).toBe(413);
    }
    vi.restoreAllMocks();
  });

  it("bounds at exactly 64 KB, and only posts to an apply path", () => {
    const at = (
      contentLength: string | null,
      method = "POST",
      pathname = "/en/for-florists/apply",
    ) => applicationBodyGate({ method, pathname, contentLength });
    expect(APPLICATION_BODY_LIMIT).toBe(65_536);
    expect(at("65536")).toBe("pass");
    expect(at("65537")).toBe("too_large");
    expect(at(String(65 * 1024))).toBe("too_large");
    expect(at(String(65 * 1024), "GET")).toBe("pass");
    expect(at(String(65 * 1024), "POST", "/en/for-florists/apply/sent")).toBe(
      "pass",
    );
    expect(at(String(65 * 1024), "POST", "/en/checkout")).toBe("pass");
    expect(at(null)).toBe("pass");
    expect(at("nonsense")).toBe("pass");
  });
});

describe("T-15 / AC-15: the sink throws", () => {
  it("re-renders with every answer and the failed state; the Sentry event and the logs carry no value", async () => {
    const h = harness();
    const outcome = await applicationPost(
      form(VALID),
      INITIAL_APPLY_STATE,
      h.deps({
        sink: {
          accept: () =>
            Promise.reject(
              new Error(
                `new row violates check constraint; DETAIL: Failing row contains (${VALID.businessName}, ${VALID.email})`,
              ),
            ),
        },
      }),
    );
    expect(outcome).toMatchObject({
      kind: "render",
      state: { status: "failed", errors: {} },
    });
    if (outcome.kind !== "render") return;
    expect(outcome.state.values).toEqual(
      Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== "hp")),
    );
    expect(h.reports).toEqual([APPLICATION_SIGNALS.sinkFailed]);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const event = JSON.stringify(captureMessage.mock.calls);
    expect(event).toContain(APPLICATION_SIGNALS.sinkFailed);
    for (const value of SUBMITTED_VALUES) {
      expect(event, value).not.toContain(value);
      expect(JSON.stringify(h.lines), value).not.toContain(value);
    }
    expect(h.mail.messages()).toHaveLength(0);
  });
});

describe("T-16 / AC-16: the founder alert", () => {
  it("sends exactly one alert per stored application, to the configured address, with its answers", async () => {
    const h = harness();
    await applicationPost(form(VALID), INITIAL_APPLY_STATE, h.deps());
    const sent = h.mail.messages();
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail?.tag).toBe("florist_application_alert");
    expect(mail?.to).toBe("founder@example.test");
    expect(mail?.subject).toBe(
      "New florist application: Kwiaciarnia Przykładowa",
    );
    for (const line of [
      "Shop: Kwiaciarnia Przykładowa",
      "Contact name: Ola Testowa",
      "Email: ola@example.test",
      "Phone or WhatsApp: +48 512 000 000",
      "Country: Poland",
      "Town or city: Kraków",
      "Where they deliver: Stare Miasto, Kazimierz",
      "Orders a day: 12",
      "Weekend delivery: Sometimes",
      "Registration number: Not given",
      "Instagram or website: https://www.instagram.com/kwiaciarnia.example",
      "Contact by: WhatsApp",
      "Language: Polski",
      "Privacy notice shown: apply-notice-0123456789abcdef",
    ]) {
      expect(mail?.text, line).toContain(line);
    }
    // The HTML part escapes what the applicant typed.
    const html = renderApplicationAlertEmail({
      ...FloristApplicationInputSchema.parse(VALID),
      businessName: "<b>Róże & Co</b>",
      privacyNoticeVersion: "v",
    }).html;
    expect(html).toContain("&lt;b&gt;Róże &amp; Co&lt;/b&gt;");
    expect(html).not.toContain("<b>Róże");
  });

  it("sends none for a honeypot, an invalid or a failed submission", async () => {
    const h = harness();
    await applicationPost(
      form({ ...VALID, hp: "x" }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    await applicationPost(
      form({ ...VALID, email: "x" }),
      INITIAL_APPLY_STATE,
      h.deps(),
    );
    await applicationPost(
      form(VALID),
      INITIAL_APPLY_STATE,
      h.deps({ sink: { accept: () => Promise.reject(new Error("down")) } }),
    );
    expect(h.mail.messages()).toHaveLength(0);
  });

  it("a throwing mailer: the row is stored, the visitor lands on the sent page, a warning with no value", async () => {
    const h = harness();
    const outcome = await applicationPost(
      form(VALID),
      INITIAL_APPLY_STATE,
      h.deps({
        alert: mailerApplicationAlert({
          to: "founder@example.test",
          mailer: {
            send: () =>
              Promise.reject(
                new Error(`rejected ${VALID.email} for ${VALID.businessName}`),
              ),
          },
        }),
      }),
    );
    expect(outcome).toEqual({ kind: "sent" });
    expect(h.stored).toHaveLength(1);
    expect(h.reports).toEqual([APPLICATION_SIGNALS.alertFailed]);
    expect(captureMessage).toHaveBeenCalledWith(
      APPLICATION_SIGNALS.alertFailed,
      expect.objectContaining({ level: "warning" }),
    );
    const event = JSON.stringify(captureMessage.mock.calls);
    for (const value of SUBMITTED_VALUES) {
      expect(event, value).not.toContain(value);
      expect(JSON.stringify(h.lines), value).not.toContain(value);
    }
  });

  it("registers the tag in the mailer's closed list", () => {
    expect(mailTags).toContain("florist_application_alert");
  });
});

describe("applicationAlertFor: which alert the environment runs", () => {
  const application = {
    ...FloristApplicationInputSchema.parse(VALID),
    privacyNoticeVersion: "v",
  };

  it("mails the configured address", async () => {
    const mail = capturingMailer("alerts@example.test");
    mail.clear();
    await applicationAlertFor(
      {
        APP_ENV: "production",
        FLORIST_APPLICATIONS_NOTIFY_EMAIL: "founder@example.test",
      },
      () => mail,
    ).notify(application);
    expect(mail.messages().map((m) => m.to)).toEqual(["founder@example.test"]);
  });

  it("with no address: fails in production (so it is reported), sends nothing elsewhere", async () => {
    const mail = capturingMailer("alerts@example.test");
    mail.clear();
    await expect(
      applicationAlertFor({ APP_ENV: "production" }, () => mail).notify(
        application,
      ),
    ).rejects.toThrow(/FLORIST_APPLICATIONS_NOTIFY_EMAIL/u);
    await expect(
      applicationAlertFor({ APP_ENV: "staging" }, () => mail).notify(
        application,
      ),
    ).resolves.toBeUndefined();
    expect(mail.messages()).toHaveLength(0);
  });

  it("a malformed address, or a mailer that cannot be built, fails the alert and never the post", async () => {
    await expect(
      applicationAlertFor({
        APP_ENV: "production",
        FLORIST_APPLICATIONS_NOTIFY_EMAIL: "not an address",
      }).notify(application),
    ).rejects.toThrow();
    await expect(
      applicationAlertFor(
        {
          APP_ENV: "production",
          FLORIST_APPLICATIONS_NOTIFY_EMAIL: "founder@example.test",
        },
        () => {
          throw new Error("RESEND_API_KEY missing");
        },
      ).notify(application),
    ).rejects.toThrow(/RESEND_API_KEY/u);
  });
});
