/**
 * The v2 error letter (`docs/design/wireframes/errors-{desktop,mobile}.dc.html`; TASK-179): the
 * 404 renders its status, heading, sentence and actions **inside** the letter, while the chooser
 * (still a v1 artboard) renders the column exactly as before. And the letter carries none of the
 * airmail edge, which spec 004 §14 A21 clause 2 allows in three places only.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NoticeDocument } from "../../src/modules/ui/layout/NoticeDocument";
import * as shell from "../../src/modules/ui/layout/noticeShell";

function letterOf(html: string): string {
  return html.slice(html.indexOf("data-fo-notice-letter"));
}

describe("the 404 letter", () => {
  it("puts the status, the one heading, the sentence and the actions inside the letter", () => {
    const html = renderToStaticMarkup(
      <NoticeDocument
        body="That page does not exist."
        heading="Page not found"
        letter
        lockupHref="/en"
        meta="404"
        wordmark="Flowers Overseas"
      >
        <span data-fo-action>Home</span>
      </NoticeDocument>,
    );
    expect(html.match(/data-fo-notice-letter/gu)).toHaveLength(1);
    const letter = letterOf(html);
    expect(letter).toContain(">404<");
    expect(letter).toMatch(/<h1[^>]*>Page not found<\/h1>/u);
    expect(letter).toContain(">That page does not exist.<");
    expect(letter).toContain('<span data-fo-action="true">Home</span>');
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(html).toContain(shell.NOTICE_LETTER_MAIN);
  });

  it("leaves the chooser's column unchanged when `letter` is not passed", () => {
    const html = renderToStaticMarkup(
      <NoticeDocument body="b" heading="h" wordmark="Flowers Overseas" />,
    );
    expect(html).not.toContain("data-fo-notice-letter");
    expect(html).toContain(`class="${shell.NOTICE_MAIN}"`);
  });

  it("uses no airmail edge (A21 clause 2: three places only)", () => {
    const letterConstants = Object.entries(shell)
      .filter(([name]) => name.startsWith("NOTICE_LETTER"))
      .map(([, value]) => String(value));
    expect(letterConstants.length).toBeGreaterThan(0);
    for (const value of letterConstants) {
      expect(value).not.toMatch(/airmail/u);
    }
  });
});
