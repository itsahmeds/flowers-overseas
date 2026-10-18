/**
 * The sign-in core's env keys and the mailer's environment rule (spec 012 §2.2; TASK-217):
 * `authSecret()` and `mailerConfig()` (optional at boot, required at use), the boot refusals of
 * `MAILER=capture` in staging and production, and `GET /api/internal/mail-capture`'s gate.
 */
import { describe, expect, it } from "vitest";

import { authSecret, mailerConfig } from "../../src/lib/env.auth.ts";
import {
  DEVELOPMENT_AUTH_SECRET,
  EnvValidationError,
  validateRuntimeEnv,
} from "../../src/lib/env.schema.ts";
import { capturingMailer } from "../../src/modules/notifications/mailer.ts";
import { mailCaptureResponse } from "../../src/modules/notifications/mail-capture.ts";

const REAL = "a".repeat(64);

describe("authSecret()", () => {
  it("uses the development secret only in development and test", () => {
    expect(authSecret({ NODE_ENV: "test" })).toBe(DEVELOPMENT_AUTH_SECRET);
    expect(authSecret({ APP_ENV: "development" })).toBe(
      DEVELOPMENT_AUTH_SECRET,
    );
  });

  it.each(["preview", "staging", "production"])(
    "throws in %s without a secret, naming the key",
    (env) => {
      expect(() => authSecret({ APP_ENV: env })).toThrow(EnvValidationError);
      expect(() => authSecret({ APP_ENV: env })).toThrow(/AUTH_SECRET/u);
    },
  );

  it("refuses the development secret in a deployed environment or a production build", () => {
    expect(() =>
      authSecret({
        APP_ENV: "production",
        AUTH_SECRET: DEVELOPMENT_AUTH_SECRET,
      }),
    ).toThrow();
    expect(() =>
      authSecret({
        NODE_ENV: "production",
        AUTH_SECRET: DEVELOPMENT_AUTH_SECRET,
      }),
    ).toThrow();
  });

  it("returns a real secret anywhere, and refuses a short one", () => {
    expect(authSecret({ APP_ENV: "production", AUTH_SECRET: REAL })).toBe(REAL);
    expect(() =>
      authSecret({ APP_ENV: "production", AUTH_SECRET: "short" }),
    ).toThrow(/32/u);
  });

  it("never prints the value", () => {
    try {
      authSecret({ APP_ENV: "staging", AUTH_SECRET: "short-secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret-value");
    }
  });
});

describe("mailerConfig()", () => {
  it("captures in development, test and preview by default", () => {
    for (const env of ["development", "test", "preview"]) {
      expect(mailerConfig({ APP_ENV: env }).kind, env).toBe("capture");
    }
  });

  it("sends through Resend in staging and production by default, and needs both keys", () => {
    for (const env of ["staging", "production"]) {
      expect(() => mailerConfig({ APP_ENV: env }), env).toThrow(
        /RESEND_API_KEY/u,
      );
      expect(
        () => mailerConfig({ APP_ENV: env, RESEND_API_KEY: "re_x" }),
        env,
      ).toThrow(/EMAIL_FROM/u);
      expect(
        mailerConfig({
          APP_ENV: env,
          RESEND_API_KEY: "re_x",
          EMAIL_FROM: "Flowers Overseas <a@example.test>",
        }),
      ).toEqual({
        kind: "resend",
        apiKey: "re_x",
        from: "Flowers Overseas <a@example.test>",
      });
    }
  });

  it("refuses capture in staging and production, at use and at boot", () => {
    for (const env of ["staging", "production"]) {
      expect(() => mailerConfig({ APP_ENV: env, MAILER: "capture" })).toThrow(
        /capture/u,
      );
      const { issues } = validateRuntimeEnv({
        APP_ENV: env,
        MAILER: "capture",
      });
      expect(issues.map((issue) => issue.key)).toContain("MAILER");
    }
  });
});

describe("GET /api/internal/mail-capture", () => {
  const secret = "cron-secret-for-tests";
  const request = (headers: Record<string, string> = {}, query = "") =>
    new Request(`https://example.test/api/internal/mail-capture${query}`, {
      headers,
    });

  it("is a bare 404 in staging and production, secret or not", () => {
    for (const environment of ["staging", "production"] as const) {
      const response = mailCaptureResponse(
        request({ "x-internal-cron-secret": secret }),
        { secret, environment },
      );
      expect(response.status).toBe(404);
    }
  });

  it("is 401 without the secret, and returns the captured mail with it", async () => {
    const mailer = capturingMailer("Flowers Overseas <a@example.test>");
    mailer.clear();
    await mailer.send({
      tag: "admin_sign_in",
      to: "founder@example.test",
      subject: "s",
      text: "t",
      html: "<p>h</p>",
    });
    expect(
      mailCaptureResponse(request(), { secret, environment: "test" }).status,
    ).toBe(401);
    const ok = mailCaptureResponse(
      request({ "x-internal-cron-secret": secret }, "?to=founder@example.test"),
      { secret, environment: "test" },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = (await ok.json()) as { messages: { to: string }[] };
    expect(body.messages.map((m) => m.to)).toEqual(["founder@example.test"]);
    mailer.clear();
  });
});
