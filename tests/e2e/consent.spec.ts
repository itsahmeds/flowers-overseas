/**
 * T-20 / AC-18, T-23 / AC-21 and T-24 / AC-22 (TASK-050): the consent plumbing as a browser sees
 * it, on a real deployment.
 *
 * The banner itself is TASK-051, so nothing here presses a button. What is asserted is everything
 * that must already be true **before** any decision — which is the half of the consent regime a UI
 * cannot fix if the document gets it wrong:
 *
 *  - `dataLayer` carries a Consent Mode v2 **default** entry with the four ad/analytics signals
 *    `denied` and `url_passthrough` off, on every localised document (AC-18);
 *  - **no third-party request is made at all**, and in particular none to `googletagmanager.com`,
 *    because `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is unset in CI, locally and on previews (AC-18,
 *    AC-21). Vercel's own preview-feedback script is the one allowed exception, by exact origin
 *    and only on a non-local target, exactly as `shell.spec.ts` allows it;
 *  - every cookie the session accumulates is in the register (AC-22);
 *  - the inline bootstrap's sha256 is the hash in the served CSP `script-src` (ADR-0016) — the
 *    hash is computed here from the bytes the browser received, so a build that changed the script
 *    without the policy fails on the deployment rather than in a unit test;
 *  - `POST /api/consent` answers the contract of §5.2 and is uncacheable and unindexable.
 */
import { createHash } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { COOKIE_REGISTRY, isRegisteredCookie } from "../../src/config/cookies";
import { CONSENT_BOOTSTRAP_ID } from "../../src/lib/consent-bootstrap";

/** The four launch locales; the bootstrap is on every localised document. */
const LOCALE_PATHS = ["/en", "/en-gb", "/de", "/pl"] as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** A Consent Mode default entry as `gtag('consent','default',…)` pushes it. */
interface ConsentDefault {
  readonly signals: Record<string, unknown>;
  readonly passthrough: unknown;
}

/** Read the `dataLayer` the inline bootstrap built, without depending on gtag.js. */
async function readConsentDefault(page: Page): Promise<ConsentDefault> {
  return page.evaluate(() => {
    const layer =
      (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    const entries = layer.map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );
    const consentDefault = entries.find(
      (entry) => entry[0] === "consent" && entry[1] === "default",
    );
    const passthrough = entries.find(
      (entry) => entry[0] === "set" && entry[1] === "url_passthrough",
    );
    return {
      signals: (consentDefault?.[2] ?? {}) as Record<string, unknown>,
      passthrough: passthrough?.[2],
    };
  });
}

test.describe("Consent Mode v2 defaults (AC-18)", () => {
  for (const path of LOCALE_PATHS) {
    test(`\`${path}\` denies every ad and analytics signal before any decision`, async ({
      page,
    }) => {
      await page.goto(path);

      const { signals, passthrough } = await readConsentDefault(page);
      for (const signal of [
        "ad_storage",
        "ad_user_data",
        "ad_personalization",
        "analytics_storage",
        "functionality_storage",
        "personalization_storage",
      ]) {
        expect(signals[signal], `${path} ${signal}`).toBe("denied");
      }
      // Honest, and the only one: it covers storage that is strictly necessary.
      expect(signals["security_storage"]).toBe("granted");
      expect(signals["wait_for_update"]).toBe(500);
      expect(passthrough).toBe(false);
    });
  }

  test("publishes `window.gtag` for the banner island to call (TASK-051)", async ({
    page,
  }) => {
    await page.goto("/en");
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { gtag?: unknown }).gtag,
      ),
    ).toBe("function");
  });

  test("ships exactly one inline script, and it is the bootstrap", async ({
    page,
  }) => {
    await page.goto("/en");

    const inline = await page
      .locator("script:not([src])")
      .evaluateAll((scripts) =>
        scripts
          .map((script) => ({ id: script.id, text: script.textContent ?? "" }))
          // Next's own bootstrap uses `<script>self.__next_f...` blocks; they are the framework's
          // flight payload, not application script, and they carry no `id`. What must be unique is
          // *our* inline block, which is the one the CSP hash covers.
          .filter((script) => !script.text.startsWith("self.__next_f")),
      );

    const ours = inline.filter((script) => script.id === CONSENT_BOOTSTRAP_ID);
    expect(ours).toHaveLength(1);
    expect(ours[0]?.text.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(ours[0]?.text ?? "", "utf8")).toBeLessThanOrEqual(
      1024,
    );
  });

  test("the served CSP names the sha256 of the bytes the browser received (ADR-0016)", async ({
    page,
  }) => {
    const response = await page.goto("/en");
    const policy =
      response?.headers()["content-security-policy-report-only"] ??
      response?.headers()["content-security-policy"] ??
      "";

    const text = await page
      .locator(`script#${CONSENT_BOOTSTRAP_ID}`)
      .evaluate((script) => script.textContent ?? "");
    const hash = `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;

    expect(policy).toContain(`'${hash}'`);
    // Exactly one hash: a second inline script would need a second, reviewed, token.
    expect(policy.split("sha256-")).toHaveLength(2);
  });
});

test.describe("the GA4 loader is dark until configured (AC-21)", () => {
  for (const path of ["/", "/en"] as const) {
    test(`\`${path}\` makes no request to googletagmanager.com and carries no tag`, async ({
      page,
      baseURL,
    }) => {
      const requested: string[] = [];
      page.on("request", (request) => requested.push(request.url()));

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(
        requested.filter((url) => url.includes("googletagmanager.com")),
      ).toEqual([]);
      expect(
        requested.filter((url) => url.includes("google-analytics.com")),
      ).toEqual([]);
      await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(
        0,
      );

      // And no third-party origin at all (AC-18). `vercel.live` on a non-local target is the
      // platform's preview-feedback script, allowed by exact origin like in `shell.spec.ts`.
      const base = new URL(baseURL ?? "http://localhost:3000");
      const allowed = new Set(
        LOCAL_HOSTNAMES.has(base.hostname) ? [] : ["https://vercel.live"],
      );
      const thirdParty = requested
        .map((url) => new URL(url).origin)
        .filter((origin) => origin !== base.origin && !allowed.has(origin));
      expect([...new Set(thirdParty)]).toEqual([]);
    });
  }

  test("the policy carries no analytics origin while no id is configured", async ({
    request,
  }) => {
    const policy = (await request.get("/en")).headers()[
      "content-security-policy-report-only"
    ];
    expect(policy).not.toContain("googletagmanager.com");
    expect(policy).not.toContain("google-analytics.com");
  });
});

test.describe("no cookie outside the register (AC-22)", () => {
  test("a session across `/` and all four locales stores only registered cookies", async ({
    page,
    context,
  }) => {
    for (const path of ["/", ...LOCALE_PATHS]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }

    const cookies = await context.cookies();
    const unregistered = cookies
      .map((cookie) => cookie.name)
      // Vercel Deployment Protection sets `_vercel_jwt` on a protected preview; it is the
      // platform's, recorded in `ropa.md` row 2, and out of the application register's scope
      // (`cookie-register.md`). Everything else must be declared.
      .filter((name) => !name.startsWith("_vercel"))
      .filter((name) => !isRegisteredCookie(name));

    expect(unregistered).toEqual([]);
    // Before any decision nothing is set at all: `fo_locale` needs a click and `fo_consent`
    // needs an answer (spec 003 AC-12, spec 004 §2). The post-accept half runs in TASK-051.
    expect(
      cookies
        .map((cookie) => cookie.name)
        .filter((name) => name.startsWith("fo_")),
    ).toEqual([]);
  });

  test("every register entry a Phase 0 session can produce is essential", () => {
    // A sanity clause on the data rather than on the browser: if a future spec marks an
    // analytics cookie as `set` without a banner, this fails before the e2e above can.
    for (const entry of COOKIE_REGISTRY.filter((row) => row.status === "set")) {
      expect(entry.category, entry.name).toBe("essential");
    }
  });
});

test.describe("POST /api/consent (AC-19, §5.2)", () => {
  const decision = {
    cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
    policyVersion: 1,
    analytics: true,
    marketing: false,
    decidedAt: "2026-09-09T10:00:00.000Z",
  };

  test("records a valid decision with 204, uncacheable and unindexable", async ({
    request,
  }) => {
    const response = await request.post("/api/consent", {
      headers: { "content-type": "application/json" },
      data: decision,
    });

    expect(response.status()).toBe(204);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("refuses a wrong method, a wrong content type and an invalid body", async ({
    request,
  }) => {
    expect((await request.get("/api/consent")).status()).toBe(405);
    expect(
      (
        await request.post("/api/consent", {
          headers: { "content-type": "text/plain" },
          data: JSON.stringify(decision),
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await request.post("/api/consent", {
          headers: { "content-type": "application/json" },
          data: { ...decision, cid: "not-a-uuid" },
        })
      ).status(),
    ).toBe(400);
  });

  test("is inside the `/api/` robots disallow and never redirects", async ({
    request,
  }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /");
    const response = await request.post("/api/consent", {
      headers: { "content-type": "application/json" },
      data: decision,
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toBeUndefined();
  });
});
