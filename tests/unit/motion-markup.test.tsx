/**
 * T-48 (unit half) / AC-44 (TASK-194): the server markup the motion module reads. The module's
 * own decisions (which click waits, what starts below the fold) are browser behaviour and are
 * asserted in `tests/e2e/motion.spec.ts`.
 *
 *  - motion 3's `pending` button ships with no busy state and its bloom transparent, so the
 *    server's HTML shows no loader; the bloom sits outside the label's box, so the width holds;
 *  - motion 12 on the listing pages: every listing subsection (under the grid) is a section the
 *    module may fade up, and the page's own data hook still lands beside it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListingSubsection } from "../../src/modules/catalog/ui/ListingChrome.tsx";
import { Button } from "../../src/modules/ui";

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

describe("motion 12 on the listing pages: each subsection under the grid", () => {
  it("carries `data-fo-reveal` beside the page's own hook, and no start state", () => {
    const html = renderToStaticMarkup(
      <ListingSubsection
        dataHook={{ "data-fo-shop-intro": true }}
        heading="How it reaches Poland"
        id="intro"
      >
        <p>Body</p>
      </ListingSubsection>,
    );
    expect(html).toMatch(/<section[^>]* data-fo-reveal=""[^>]*>/u);
    expect(html).toContain('data-fo-shop-intro="true"');
    expect(html).not.toContain("pending");
  });
});
