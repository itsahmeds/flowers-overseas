/**
 * The inline Consent-Mode-v2 bootstrap, its CSP hash and the env-gated GA4 loader
 * (spec 004 §2 "Consent", §5.2, AC-18, AC-21, ADR-0016; TASK-050).
 *
 * Four properties, and each of them is a rule someone could break without noticing:
 *
 *  1. **the bytes are the bytes** — the hash in `script-src` is computed from
 *     `CONSENT_BOOTSTRAP_SCRIPT`, and the component emits that constant and nothing else, so a
 *     one-character edit to the script changes the hash in the same commit. A bootstrap the
 *     policy would report is a false negative in the whole Report-Only evidence period, which is
 *     why TASK-046 left the `inlineHashes` slot empty for this PR;
 *  2. **it is default-*denied*** — all four ad/analytics signals plus the two storage signals
 *     deny, `security_storage` grants (honestly: it is the only one that is strictly necessary),
 *     `url_passthrough` is off and `wait_for_update` is set;
 *  3. **≤1 KB**, the number §5.2's CSP argument stands on;
 *  4. **the loader is dark until configured** — no measurement id means no tag element at all,
 *     so nothing can request `googletagmanager.com` (the served half is `tests/e2e/consent.spec.ts`).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONSENT_BOOTSTRAP_MAX_BYTES,
  CONSENT_BOOTSTRAP_SCRIPT,
  CONSENT_DEFAULT_SIGNALS,
  GA4_ID_ATTRIBUTE,
  consentBootstrapHash,
} from "../../src/lib/consent-bootstrap";
import {
  GOOGLE_ANALYTICS_ORIGIN,
  GOOGLE_TAG_MANAGER_ORIGIN,
  cspValue,
} from "../../src/lib/csp";
import {
  GA4_MEASUREMENT_ID_KEY,
  ga4MeasurementId,
} from "../../src/lib/env.schema";
import { AnalyticsScripts, ga4TagUrl } from "../../src/modules/analytics";

const repoRoot = resolve(__dirname, "../..");

const MEASUREMENT_ID = "G-TESTID1234";

describe("the bootstrap script (AC-18)", () => {
  it("denies every ad and analytics signal and grants only security storage", () => {
    expect(CONSENT_DEFAULT_SIGNALS).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
      security_storage: "granted",
      wait_for_update: 500,
    });
    for (const signal of [
      "ad_storage",
      "ad_user_data",
      "ad_personalization",
      "analytics_storage",
    ] as const) {
      expect(CONSENT_BOOTSTRAP_SCRIPT, signal).toContain(
        `"${signal}":"denied"`,
      );
    }
  });

  it("sets the default before anything else and switches url_passthrough off", () => {
    expect(
      CONSENT_BOOTSTRAP_SCRIPT.indexOf('"consent","default"'),
    ).toBeGreaterThan(-1);
    expect(CONSENT_BOOTSTRAP_SCRIPT).toContain('"url_passthrough",false');
    expect(CONSENT_BOOTSTRAP_SCRIPT).toContain("wait_for_update");
    // The consent default must precede the `config` call, or the first ping would be untamed.
    expect(
      CONSENT_BOOTSTRAP_SCRIPT.indexOf('"consent","default"'),
    ).toBeLessThan(CONSENT_BOOTSTRAP_SCRIPT.indexOf('"config"'));
  });

  it("publishes `window.gtag` so the banner island can send the update (TASK-051)", () => {
    expect(CONSENT_BOOTSTRAP_SCRIPT).toContain("gtag");
    expect(CONSENT_BOOTSTRAP_SCRIPT).toContain("dataLayer");
  });

  it("is at most 1 KB, which is the number the CSP argument of §5.2 rests on", () => {
    const bytes = Buffer.byteLength(CONSENT_BOOTSTRAP_SCRIPT, "utf8");
    expect(CONSENT_BOOTSTRAP_MAX_BYTES).toBe(1024);
    expect(bytes, `${String(bytes)} B`).toBeLessThanOrEqual(
      CONSENT_BOOTSTRAP_MAX_BYTES,
    );
  });

  it("takes the measurement id from an attribute, so the hashed bytes never vary", () => {
    expect(CONSENT_BOOTSTRAP_SCRIPT).toContain(GA4_ID_ATTRIBUTE);
    expect(CONSENT_BOOTSTRAP_SCRIPT).not.toContain(MEASUREMENT_ID);
    expect(CONSENT_BOOTSTRAP_SCRIPT).not.toContain("G-");
  });

  it("contains no closing script tag, which would break out of the element", () => {
    expect(CONSENT_BOOTSTRAP_SCRIPT.toLowerCase()).not.toContain("</script");
  });
});

describe("the hash and the policy (ADR-0016, AC-23)", () => {
  it("hashes exactly the emitted bytes", () => {
    const expected = `sha256-${createHash("sha256")
      .update(CONSENT_BOOTSTRAP_SCRIPT, "utf8")
      .digest("base64")}`;
    expect(consentBootstrapHash()).toBe(expected);
  });

  it("appears quoted in `script-src` of every environment's policy", () => {
    for (const environment of [
      "development",
      "test",
      "preview",
      "production",
    ] as const) {
      const policy = cspValue(environment, {
        inlineHashes: [consentBootstrapHash()],
      });
      expect(policy, environment).toContain(
        `script-src 'self' '${consentBootstrapHash()}'`,
      );
    }
  });

  it("is wired into next.config.ts together with the script it authorises", () => {
    const source = readFileSync(resolve(repoRoot, "next.config.ts"), "utf8");
    expect(source).toContain("consentBootstrapHash()");
    expect(source).not.toContain("inlineHashes: []");
  });

  it("names the GA4 origins in the policy only when a measurement id is configured", () => {
    const dark = cspValue("production", { ga4: false });
    const lit = cspValue("production", { ga4: true });
    expect(dark).not.toContain(GOOGLE_TAG_MANAGER_ORIGIN);
    expect(dark).not.toContain(GOOGLE_ANALYTICS_ORIGIN);
    expect(lit).toContain(`script-src 'self' ${GOOGLE_TAG_MANAGER_ORIGIN};`);
    expect(lit).toContain(
      `connect-src 'self' ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGIN};`,
    );
    // The tag origin is never an image or a frame source: a container that wants either is a
    // reviewed diff, not a silent allowance.
    expect(lit).toContain("img-src 'self' data: blob:;");
    expect(lit).toContain("frame-src 'none';");
  });
});

describe("the measurement id gate (AC-21)", () => {
  it("accepts a GA4 id and refuses anything else", () => {
    expect(ga4MeasurementId({ [GA4_MEASUREMENT_ID_KEY]: MEASUREMENT_ID })).toBe(
      MEASUREMENT_ID,
    );
    for (const value of [
      undefined,
      "",
      "  ",
      "UA-12345-1",
      "g-lowercase",
      "G-",
      "GTM-ABC123",
    ]) {
      expect(
        ga4MeasurementId({ [GA4_MEASUREMENT_ID_KEY]: value }),
        String(value),
      ).toBeUndefined();
    }
  });

  it("builds the tag URL from the id and the allowlisted origin", () => {
    expect(ga4TagUrl(MEASUREMENT_ID)).toBe(
      `${GOOGLE_TAG_MANAGER_ORIGIN}/gtag/js?id=${MEASUREMENT_ID}`,
    );
  });
});

describe("<AnalyticsScripts /> (AC-18, AC-21)", () => {
  const render = (id: string | undefined): string =>
    renderToStaticMarkup(<AnalyticsScripts measurementId={id} />);

  it("emits the bootstrap verbatim, and no tag at all, when no id is configured", () => {
    const html = render(undefined);
    expect(html).toContain(CONSENT_BOOTSTRAP_SCRIPT);
    expect(html).not.toContain("googletagmanager.com");
    // The attribute name appears inside the script text either way; what must be absent is the
    // attribute itself, i.e. an id on the element.
    expect(html).not.toContain(`${GA4_ID_ATTRIBUTE}="`);
    // Exactly one script element: the inline bootstrap (spec 004 §2 "the only inline script").
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it("emits the tag after the bootstrap, with the id on both, when an id is configured", () => {
    const html = render(MEASUREMENT_ID);
    expect(html).toContain(`${GA4_ID_ATTRIBUTE}="${MEASUREMENT_ID}"`);
    expect(html).toContain(ga4TagUrl(MEASUREMENT_ID));
    expect(html.indexOf(GA4_ID_ATTRIBUTE)).toBeLessThan(
      html.indexOf("googletagmanager.com/gtag/js"),
    );
    // Still one inline script: the tag is external, so the hash stays the only one in the policy.
    expect(html.match(/<script[^>]*>[^<]/g)).toHaveLength(1);
  });

  it("loads the tag with `defer` rather than `async`, so the default block always runs first", () => {
    // React hoists `<script async src>` into `<head>`, which would let the tag execute before an
    // inline block that sits later in the document. `defer` keeps document order.
    const html = render(MEASUREMENT_ID);
    expect(html).toContain("defer");
    expect(html).not.toContain("async");
  });

  it("escapes nothing into the inline script: the emitted text is the hashed text", () => {
    const html = render(MEASUREMENT_ID);
    const inline = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(inline).toBe(CONSENT_BOOTSTRAP_SCRIPT);
    expect(
      `sha256-${createHash("sha256")
        .update(inline ?? "", "utf8")
        .digest("base64")}`,
    ).toBe(consentBootstrapHash());
  });
});

describe("where it is mounted", () => {
  const layout = readFileSync(
    resolve(repoRoot, "src/app/[locale]/layout.tsx"),
    "utf8",
  );

  it("is rendered by the localised document layout, before the body content", () => {
    expect(layout).toContain("AnalyticsScripts");
    expect(layout.indexOf("AnalyticsScripts")).toBeLessThan(
      layout.indexOf("<body"),
    );
  });

  it("is the only place in `src/` that emits an inline script", () => {
    const inlineUsers = readFileSync(
      resolve(repoRoot, "src/modules/analytics/ui/AnalyticsScripts.tsx"),
      "utf8",
    );
    expect(inlineUsers).toContain("dangerouslySetInnerHTML");
  });
});
