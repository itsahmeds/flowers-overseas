/**
 * The placeholder shell (spec 001 §5.3, §7, AC-15, TASK-006).
 *
 * Rendered to a string with `react-dom/server` so `lang`, `dir`, the absence of text nodes and
 * the robots metadata are asserted without a browser. T-16 (TASK-008) re-checks the served HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AppError from "../../src/app/error";
import RootLayout, { metadata } from "../../src/app/layout";
import NotFound from "../../src/app/not-found";
import HomePage from "../../src/app/page";

describe("root layout", () => {
  const html = renderToStaticMarkup(<RootLayout>{<HomePage />}</RootLayout>);

  it('renders <html lang="en" dir="ltr">', () => {
    expect(html).toContain('<html lang="en" dir="ltr">');
  });

  it("renders no text node anywhere in the shell", () => {
    expect(html.replace(/<[^>]*>/g, "").trim()).toBe("");
  });

  it("loads no font and no third-party script", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link");
  });

  it("declares robots noindex,nofollow exactly as AC-15 words it", () => {
    expect(metadata.robots).toBe("noindex,nofollow");
  });

  it("sets no title: spec 001 ships no copy", () => {
    expect(metadata.title).toBeUndefined();
  });
});

describe("404 and 500 shells (§5.3)", () => {
  it("renders the same empty main with no text", () => {
    for (const markup of [
      renderToStaticMarkup(<NotFound />),
      renderToStaticMarkup(<AppError />),
    ]) {
      expect(markup).toBe("<main></main>");
    }
  });
});
