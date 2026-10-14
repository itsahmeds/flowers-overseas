/**
 * T-48 (unit half) / AC-44 (TASK-194): the motion module's decisions and the server markup it
 * reads.
 *
 *  - motion 1 waits only for a navigation of this tab to another page of the site;
 *  - motion 11 and 12 never hide what starts in the first viewport;
 *  - motion 3's `pending` button ships with no busy state and its bloom transparent, so the
 *    server's HTML shows no loader; the bloom sits outside the label's box, so the width holds.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../../src/modules/ui";
import {
  startsBelowFold,
  startsNavigation,
  type ClickFacts,
} from "../../src/modules/ui/motion/motion-model.ts";

const HERE = "https://flowersoverseas.com/en/poland/flowers?page=1";
const CLICK: ClickFacts = {
  button: 0,
  defaultPrevented: false,
  modified: false,
  href: "https://flowersoverseas.com/en/poland",
  target: "",
  download: false,
};

describe("motion 1: which click may show the bloom", () => {
  it("is a plain click on a link to another page of this site", () => {
    expect(startsNavigation(CLICK, HERE)).toBe(true);
    expect(
      startsNavigation({ ...CLICK, href: "/en/poland/flowers?page=2" }, HERE),
    ).toBe(true);
    expect(startsNavigation({ ...CLICK, target: "_self" }, HERE)).toBe(true);
  });

  it("is never a new tab, a download, a modified or handled click, or not a link", () => {
    expect(startsNavigation({ ...CLICK, href: null }, HERE)).toBe(false);
    expect(startsNavigation({ ...CLICK, target: "_blank" }, HERE)).toBe(false);
    expect(startsNavigation({ ...CLICK, download: true }, HERE)).toBe(false);
    expect(startsNavigation({ ...CLICK, modified: true }, HERE)).toBe(false);
    expect(startsNavigation({ ...CLICK, button: 1 }, HERE)).toBe(false);
    expect(startsNavigation({ ...CLICK, defaultPrevented: true }, HERE)).toBe(
      false,
    );
  });

  it("is never another origin, a `tel:` link or a jump inside this page", () => {
    expect(
      startsNavigation({ ...CLICK, href: "https://example.com/" }, HERE),
    ).toBe(false);
    expect(startsNavigation({ ...CLICK, href: "tel:+48123456789" }, HERE)).toBe(
      false,
    );
    expect(
      startsNavigation(
        { ...CLICK, href: "/en/poland/flowers?page=1#send" },
        HERE,
      ),
    ).toBe(false);
    // Another page with a fragment is still a navigation.
    expect(startsNavigation({ ...CLICK, href: "/en#send" }, HERE)).toBe(true);
  });
});

describe("motion 11 and 12: nothing in the first viewport takes a hidden start", () => {
  it("hides only what starts at or below the viewport's foot", () => {
    expect(startsBelowFold(900, 900)).toBe(true);
    expect(startsBelowFold(1400, 900)).toBe(true);
    expect(startsBelowFold(899, 900)).toBe(false);
    expect(startsBelowFold(0, 900)).toBe(false);
    expect(startsBelowFold(-300, 900)).toBe(false);
  });
});

describe("motion 3: the pending button's server markup", () => {
  const html = renderToStaticMarkup(
    <Button type="submit" variant="accent" pending>
      Continue
    </Button>,
  );

  it("marks the button for the module and ships it idle", () => {
    expect(html).toContain("data-fo-pending");
    expect(html).not.toContain("aria-busy");
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("puts the 22 px bloom outside the label's box, transparent and decorative", () => {
    const bloom =
      /<span aria-hidden="true" class="([^"]+)" data-fo-pending-bloom/.exec(
        html,
      );
    expect(bloom?.[1]).toContain("absolute");
    expect(bloom?.[1]).toContain("start-full");
    expect(bloom?.[1]).toContain("size-[22px]");
    expect(bloom?.[1]).toContain("opacity-0");
    expect(html).toContain('data-fo-bloom="stem"');
    expect(html.match(/data-fo-bloom="petal"/g)).toHaveLength(5);
  });

  it("renders no bloom slot without `pending`, or on a link", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).not.toContain(
      "data-fo-pending",
    );
    expect(
      renderToStaticMarkup(
        <Button href="/en" pending>
          Go
        </Button>,
      ),
    ).not.toContain("data-fo-pending");
  });
});

describe("motion 6: a pill presses to 0.98 and transitions transform only", () => {
  const html = renderToStaticMarkup(<Button>Send</Button>);
  it("carries `transition-transform` and the press scale, never `transition-colors`", () => {
    expect(html).toContain("transition-transform");
    expect(html).toContain("motion-safe:active:scale-[0.98]");
    expect(html).not.toContain("transition-colors");
  });
});
