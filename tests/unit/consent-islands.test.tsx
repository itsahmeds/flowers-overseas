/**
 * T-19 / AC-17, T-21 / AC-19 and T-22 / AC-20, the halves that need no browser (TASK-051): the
 * four banner states and the three settings states of §5.3, rendered with `react-dom/server`
 * against the **real** `messages/en.json` through `consentView()`.
 *
 * AC-20 is written here first and asserted from the markup, because "equal prominence" is a
 * property of the classes the component emits: the browser assertion in
 * `tests/e2e/consent-banner.spec.ts` then confirms that the emitted classes really do compute to
 * the same width, size, weight and colour. The states a browser is needed for — appearing after
 * hydration, the CLS delta, `Esc`, the cookie, the request — are that file's.
 */
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COOKIE_REGISTRY } from "../../src/config/cookies";
import { Button } from "../../src/modules/ui";
import { resolveCatalogue } from "../../src/modules/i18n/messages";
import {
  ConsentBannerView,
  ConsentSavedView,
} from "../../src/modules/ui/consent/ConsentBannerView";
import {
  consentBody,
  consentUpdate,
} from "../../src/modules/ui/consent/ConsentBannerIsland";
import { ConsentSettingsPanel } from "../../src/modules/ui/consent/ConsentSettingsPanel";
import type { ConsentChoices } from "../../src/modules/ui/consent/consentCookie";
import {
  type ConsentTranslate,
  consentView,
} from "../../src/modules/ui/consent/consentView";

const translate: ConsentTranslate = (() => {
  const t = createTranslator({
    locale: "en",
    messages: resolveCatalogue("en"),
    timeZone: "UTC",
  });
  return (key, values) =>
    t(key as Parameters<typeof t>[0], values as never) as unknown as string;
})();

const view = consentView(translate);
const noop = (): void => undefined;
const NO_CHOICES: ConsentChoices = { analytics: false, marketing: false };

function panel(choices: ConsentChoices): string {
  return renderToStaticMarkup(
    <ConsentSettingsPanel
      categories={view.categories}
      choices={choices}
      idPrefix="p1"
      onSave={noop}
      onToggle={noop}
      strings={view.strings}
    />,
  );
}

function banner(children?: string): string {
  return renderToStaticMarkup(
    <ConsentBannerView
      headlineId="h1"
      onAccept={noop}
      onOpenSettings={noop}
      onReject={noop}
      strings={view.strings}
    >
      {children === undefined ? undefined : (
        <span dangerouslySetInnerHTML={{ __html: children }} />
      )}
    </ConsentBannerView>,
  );
}

/** React escapes `'` and `&` in text nodes; the catalogue does not, so compare like for like. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** Every `class="…"` of a `<button>`, in document order. */
function buttonClasses(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*class="([^"]*)"[^>]*>/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("the `shown` state (§5.3, AC-17)", () => {
  const markup = banner();

  it("is a non-modal live region named by its own headline", () => {
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-labelledby="h1"');
    expect(markup).toContain('data-fo-consent="shown"');
    // Not a dialog, and no scrim: it blocks nothing and traps nothing (AC-17, §8's "no cookie
    // wall"). The artboard's dimmed, focus-trapped sketch is superseded by the spec — see the
    // header of `ConsentBannerView.tsx`.
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("aria-modal");
    expect(markup).not.toContain('tabindex="0"');
  });

  it("overlays rather than reflows, on the named z-layer above the suggestion banner", () => {
    expect(markup).toContain("fixed");
    expect(markup).toContain("layer-overlay");
    // A raw z-index would escape the named scale of AC-13.
    expect(markup).not.toMatch(/z-\[\d+\]/);
  });

  it("uses logical properties only (AC-5, `fo/no-physical-css`)", () => {
    for (const physical of ["left-0", "right-0", "ml-", "mr-", "pl-", "pr-"]) {
      expect(markup).not.toContain(physical);
    }
    expect(markup).toContain("start-0");
    expect(markup).toContain("end-0");
  });

  it("renders exactly the three controls, and no settings panel", () => {
    expect(markup).toContain('data-fo-consent-action="reject"');
    expect(markup).toContain('data-fo-consent-action="settings"');
    expect(markup).toContain('data-fo-consent-action="accept"');
    expect(markup).not.toContain("data-fo-consent-panel");
    expect(buttonClasses(markup)).toHaveLength(3);
  });

  it("shows the shipped copy, not a message key", () => {
    expect(markup).toContain(escapeHtml(view.strings.headline));
    expect(markup).toContain(escapeHtml(view.strings.reject));
    expect(markup).toContain(escapeHtml(view.strings.accept));
    expect(markup).not.toContain("consent.headline");
  });

  it("speaks in the first person and never calls a florist a third party (§14 A5)", () => {
    const text = markup.replace(/<[^>]*>/g, " ").toLowerCase();
    for (const forbidden of [
      "third party",
      "third-party",
      "partner",
      "vendor",
      "relay",
      "corridor",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(text).toContain("we");
  });
});

describe("equal prominence, from the markup (AC-20)", () => {
  const classes = buttonClasses(banner());

  it("gives the three controls identical classes", () => {
    expect(classes).toHaveLength(3);
    expect(new Set(classes).size).toBe(1);
  });

  it("gives none of them the accent fill reserved for the finder's Continue", () => {
    for (const value of classes) {
      expect(value).not.toContain("bg-accent");
      expect(value).toContain("bg-surface");
      expect(value).toContain("text-ink");
    }
  });

  it("lays them out in equal tracks, so a longer label cannot buy width", () => {
    expect(banner()).toContain("minmax(0,1fr)");
  });

  it("puts the refusal first, so the cheapest click never consents", () => {
    const order = [...banner().matchAll(/data-fo-consent-action="(\w+)"/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual(["reject", "settings", "accept"]);
  });
});

describe("the sheet's control skin matches the design system's `Button`", () => {
  /**
   * `ConsentBannerView` writes the canvas's `.btn.secondary` as one constant instead of importing
   * `Button` — 900 B Brotli of §14 A1's headroom for four fills the sheet does not use (see that
   * file's header). A duplicated skin is only acceptable if it cannot drift silently, which is
   * what this asserts: the same surface, ink, border, radius, weight, tracking and tap-target
   * height as `Button`'s `secondary` variant at both sizes.
   */
  const secondary = renderToStaticMarkup(
    <Button variant="secondary">{view.strings.accept}</Button>,
  );
  const secondarySmall = renderToStaticMarkup(
    <Button size="sm" variant="secondary">
      {view.strings.close}
    </Button>,
  );
  const control = buttonClasses(banner())[0] ?? "";
  const small = buttonClasses(
    renderToStaticMarkup(
      <ConsentSavedView
        headlineId="h1"
        onClose={noop}
        strings={view.strings}
      />,
    ),
  )[0];

  const SKIN = [
    "bg-surface",
    "text-ink",
    "border-border-strong",
    "rounded-sm",
    "font-medium",
    "tracking-[0.02em]",
    "hover:border-border-emphasis",
    "active:bg-surface-muted",
  ];

  it("shares every skin utility with `Button` at the default size", () => {
    for (const utility of [...SKIN, "min-h-[50px]", "px-[26px]", "text-md"]) {
      expect(secondary, utility).toContain(utility);
      expect(control, utility).toContain(utility);
    }
  });

  it("shares them at the small size too, which the `saved` state uses", () => {
    for (const utility of [...SKIN, "min-h-[44px]", "px-md", "text-sm"]) {
      expect(secondarySmall, utility).toContain(utility);
      expect(small, utility).toContain(utility);
    }
  });
});

describe("the `settings-open` state (§5.3, AC-20)", () => {
  const markup = banner(panel(NO_CHOICES));

  it("marks the sheet as settings-open and keeps the three controls", () => {
    expect(markup).toContain('data-fo-consent="settings"');
    expect(markup).toContain("data-fo-consent-panel");
    expect(markup).toContain('data-fo-consent-action="accept"');
  });
});

describe("the settings panel (§5.3, AC-20)", () => {
  const markup = panel(NO_CHOICES);

  it("pre-enables no non-essential category", () => {
    expect(markup).toContain('data-fo-consent-category="analytics"');
    expect(markup).toContain('data-fo-consent-category="marketing"');
    expect(markup).not.toContain("checked");
  });

  it("labels every toggle, with a real checkbox and no fake switch", () => {
    const inputs = [...markup.matchAll(/<input[^>]*id="([^"]*)"[^>]*>/g)];
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(markup).toContain(`for="${input[1] ?? ""}"`);
      expect(input[0]).toContain('type="checkbox"');
    }
    expect(markup).not.toContain('role="switch"');
  });

  it("shows the essential group as always-on with its reason and no input", () => {
    expect(markup).toContain("data-fo-consent-locked");
    expect(markup).toContain(escapeHtml(view.strings.settingsHeadline));
    expect(markup).not.toContain('data-fo-consent-category="essential"');
    expect(markup).not.toContain("disabled");
  });

  it("lists every register row with its purpose and its lifetime", () => {
    for (const entry of COOKIE_REGISTRY) {
      expect(markup, entry.name).toContain(entry.name);
      expect(markup, `${entry.name} purpose`).toContain(
        escapeHtml(translate(entry.purposeKey)),
      );
    }
    expect(markup).toContain("365 days");
    expect(markup).toContain("30 minutes");
    expect(markup).toContain("This visit only");
  });

  it("says what an empty category means instead of showing an empty table", () => {
    expect(markup).toContain(escapeHtml(translate("consent.categoryEmpty")));
  });

  it("reaches the `dirty` state by props alone: analytics on, marketing off", () => {
    const dirty = panel({ analytics: true, marketing: false });
    const inputs = [...dirty.matchAll(/<input[^>]*>/g)].map(
      (match) => match[0],
    );
    expect(inputs[0]).toContain("checked");
    expect(inputs[1]).not.toContain("checked");
  });
});

describe("the `saved` state (§5.3)", () => {
  const markup = renderToStaticMarkup(
    <ConsentSavedView headlineId="h1" onClose={noop} strings={view.strings} />,
  );

  it("confirms in a live region and offers a way to remove itself", () => {
    expect(markup).toContain('data-fo-consent="saved"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain(escapeHtml(view.strings.saved));
    expect(markup).toContain('data-fo-consent-action="close"');
  });

  it("tells the visitor where to change their mind (§8's withdrawal clause)", () => {
    expect(view.strings.saved.toLowerCase()).toContain("cookie settings");
  });
});

describe("what a decision sends (AC-19)", () => {
  it("grants analytics alone for an analytics-only choice", () => {
    expect(consentUpdate({ analytics: true, marketing: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  it("grants nothing for a refusal", () => {
    expect(
      Object.values(consentUpdate({ analytics: false, marketing: false })),
    ).toEqual(["denied", "denied", "denied", "denied"]);
  });

  it("grants all four for an acceptance", () => {
    expect(
      Object.values(consentUpdate({ analytics: true, marketing: true })),
    ).toEqual(["granted", "granted", "granted", "granted"]);
  });

  it("posts the five fields of `ConsentDecisionSchema` and nothing else (§8)", () => {
    const body = consentBody({
      v: 1,
      a: true,
      m: false,
      ts: "2026-09-09T10:00:00.000Z",
      cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
    });
    expect(Object.keys(body).sort()).toEqual([
      "analytics",
      "cid",
      "decidedAt",
      "marketing",
      "policyVersion",
    ]);
    // No page URL, no locale, no user agent, no referrer: nothing that identifies a person.
    expect(JSON.stringify(body)).not.toContain("http");
  });
});
