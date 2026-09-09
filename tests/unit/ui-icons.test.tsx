/**
 * AC-5's mirroring intent, and the brand mark pinned to its production SVG (TASK-045).
 *
 * Two things a screenshot cannot tell you, and one it can. The screenshot half — arrow and chevron
 * flipped under `dir="rtl"`, shield and wordmark not — is the `/ar-XB` visual baseline (T-07,
 * owned with the RTL layout by TASK-054). What is asserted here is the *system*: that the
 * mirroring decision lives on the icon and is applied by `Icon`, so no call site can get it wrong,
 * and that `Mark` and `content/brand/mark.svg` cannot drift apart.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Icon,
  ICON_NAMES,
  MIRRORED_IN_RTL,
  Mark,
} from "../../src/modules/ui/index.ts";

const repoRoot = resolve(__dirname, "../..");

describe("the icon set (AC-5)", () => {
  it("draws every icon on the 24 grid with a 1.6 stroke and currentColor", () => {
    for (const name of ICON_NAMES) {
      const html = renderToStaticMarkup(<Icon name={name} />);
      expect(html, name).toContain('viewBox="0 0 24 24"');
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).toContain('stroke-width="1.6"');
      expect(html, name).toContain('fill="none"');
    }
  });

  it("applies `mirror-in-rtl` to exactly the direction-carrying icons", () => {
    expect([...MIRRORED_IN_RTL].sort()).toEqual(["arrow-end", "chevron-end"]);
    for (const name of ICON_NAMES) {
      const html = renderToStaticMarkup(<Icon name={name} />);
      expect(html.includes("mirror-in-rtl"), name).toBe(
        MIRRORED_IN_RTL.has(name),
      );
    }
    // Two AC-5 names on the "never mirrored" side of the list.
    expect(MIRRORED_IN_RTL.has("shield-check")).toBe(false);
    expect(MIRRORED_IN_RTL.has("calendar")).toBe(false);
  });

  /**
   * The set is the canvas's, and nothing more (`/review 27` required change 2).
   *
   * Spec §3 rules out "an icon system beyond the … icons the chrome needs", so every icon must be
   * traceable to an element of the founder-approved canvas — geometry included, since a redrawn
   * icon that no longer matches the design is the same problem one step later. The two
   * direction-carrying icons are the documented exception: AC-5's `mirror-in-rtl` contract is only
   * observable if a mirrored pair exists.
   */
  it("draws only icons the approved canvas uses (spec §3)", () => {
    const canvas = ["homepage-desktop", "homepage-mobile", "identity"]
      .map((name) =>
        readFileSync(
          resolve(repoRoot, `docs/design/homepage-v1/${name}.dc.html`),
          "utf8",
        ),
      )
      .join("\n");
    const unapproved: string[] = [];
    for (const name of ICON_NAMES) {
      if (MIRRORED_IN_RTL.has(name)) continue;
      const html = renderToStaticMarkup(<Icon name={name} />);
      // Every geometry attribute of the icon, as the canvas would have written it.
      const geometry = [
        ...html.matchAll(/\s(d|cx|cy|r|x|y|width|height|rx)="([^"]+)"/g),
      ]
        .filter((match) => !["width", "height"].includes(match[1] ?? ""))
        .map((match) => `${match[1] ?? ""}="${match[2] ?? ""}"`);
      expect(geometry.length, name).toBeGreaterThan(0);
      if (geometry.some((attribute) => !canvas.includes(attribute))) {
        unapproved.push(name);
      }
    }
    expect(unapproved).toEqual([]);
  });

  it("is decorative by default and named only when asked", () => {
    const decorative = renderToStaticMarkup(<Icon name="basket" />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("role=");
    const named = renderToStaticMarkup(<Icon name="basket" label="Basket" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Basket"');
    expect(named).not.toContain("aria-hidden");
  });
});

describe("the brand mark (§13 Q1)", () => {
  const svg = readFileSync(resolve(repoRoot, "content/brand/mark.svg"), "utf8");
  const html = renderToStaticMarkup(<Mark />);

  it("renders the same geometry as content/brand/mark.svg", () => {
    // Every path and circle of the production asset, coordinate for coordinate.
    const geometry = [
      ...svg.matchAll(/(?:d|cx|cy|r|transform)="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(geometry.length).toBeGreaterThan(10);
    for (const value of geometry) {
      expect(html, value).toContain(`"${value}"`);
    }
    expect(html).toContain('viewBox="0 0 48 48"');
  });

  it("takes its two colours from tokens, while the file keeps hex for use outside the app", () => {
    // The component: tokens only, so a palette swap moves the mark too and `fo/no-raw-color` has
    // nothing to object to.
    expect(html).toContain("var(--color-accent)");
    expect(html).toContain("var(--color-ink)");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // The file: hex equivalents, because a favicon, an email and a partner pack have no tokens.
    expect(svg).toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("is never mirrored in RTL, and is decorative unless named", () => {
    expect(html).not.toContain("mirror-in-rtl");
    expect(html).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<Mark label="Flowers Overseas" />)).toContain(
      'aria-label="Flowers Overseas"',
    );
  });
});
