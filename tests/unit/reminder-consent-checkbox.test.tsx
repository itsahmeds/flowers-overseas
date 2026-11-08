/**
 * Spec 034 T-07 (render half; AC-7, AC-32; TASK-449): the box's server HTML is one native
 * checkbox named `basketReminder`, unticked unless the caller says the buyer ticked it, with a
 * visible label and the hint linked by `aria-describedby`. No script is needed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReminderConsentCheckbox } from "../../src/modules/ui/checkout/ReminderConsentCheckbox.tsx";

const render = (checked: boolean): string =>
  renderToStaticMarkup(
    <ReminderConsentCheckbox
      checked={checked}
      hint="One email, about 2 hours later."
      id="co-basketReminder"
      label="Email me once."
    />,
  );

describe("T-07 (AC-7) · ReminderConsentCheckbox", () => {
  it("renders one unticked native checkbox with a label and a described-by hint", () => {
    const html = render(false);
    expect(html.match(/<input/gu)).toHaveLength(1);
    expect(html).toMatch(/<input[^>]*type="checkbox"/u);
    expect(html).toMatch(/<input[^>]*name="basketReminder"/u);
    expect(html).toMatch(/<input[^>]*value="on"/u);
    expect(html).not.toMatch(/ checked=""/u);
    expect(html).not.toMatch(/ required=""/u);
    expect(html).toMatch(
      /<label[^>]*for="co-basketReminder"[^>]*>Email me once\.<\/label>/u,
    );
    expect(html).toMatch(/aria-describedby="co-basketReminder-hint"/u);
    expect(html).toMatch(
      /<small[^>]*id="co-basketReminder-hint"[^>]*>One email, about 2 hours later\.<\/small>/u,
    );
    expect(html).not.toMatch(/<script/u);
  });

  it("renders ticked only when the caller passes the buyer's own tick", () => {
    expect(render(true)).toMatch(/<input[^>]*checked=""/u);
  });
});
