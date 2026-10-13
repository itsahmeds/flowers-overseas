/**
 * The primitives' contracts (spec 004 §2 "Layout primitives and chrome", §5.3; TASK-045).
 *
 * Not a snapshot of markup — a set of assertions about the promises later 004 tasks are going to
 * rely on, each of which would otherwise be a comment:
 *
 *  - **logical CSS only** (AC-5): no primitive may emit a physical utility, in any prop
 *    combination. `fo/no-physical-css` reads the source; this reads the *output*, which is where a
 *    computed class name would slip through.
 *  - **no raw colour** (AC-1): the same, for colours.
 *  - the accessibility wiring `Button` and `Photo` are supposed to do for their callers, so a call
 *    site cannot forget it.
 *
 * No `Field` and no `Price`: both were written here and removed as spec §3/§8 non-goals
 * (`/review 27` required change 2), and `tests/unit/ui-barrel.test.ts` asserts their absence.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Breadcrumbs,
  Button,
  BUTTON_STATES,
  BUTTON_VARIANTS,
  Chip,
  Cluster,
  Container,
  Display,
  Eyebrow,
  Fact,
  FactsList,
  Grid,
  NoticeBar,
  Photo,
  Placeholder,
  Price,
  Row,
  SkipLink,
  Stack,
  Text,
  TextLink,
  VisuallyHidden,
  Wordmark,
} from "../../src/modules/ui/index.ts";
import {
  WORDMARK_PATH,
  WORDMARK_VIEW_BOX,
} from "../../src/modules/ui/icons/wordmark-paths.ts";

/** Physical utilities `fo/no-physical-css` bans; asserted against rendered class names. */
const PHYSICAL = [
  /\bml-/,
  /\bmr-/,
  /\bpl-/,
  /\bpr-/,
  /\bleft-/,
  /\bright-/,
  /\btext-left\b/,
  /\btext-right\b/,
  /\bborder-l\b/,
  /\bborder-r\b/,
  /\brounded-l/,
  /\brounded-r/,
];

const RAW_COLOUR = [
  /#[0-9a-fA-F]{3,8}\b/,
  /(?<![a-z])(?:rgba?|hsla?|oklch)\s*\(/,
];

/** Every primitive rendered across its prop matrix, so the sweeps below see all of it. */
const RENDERED: readonly [string, string][] = [
  ["Container/page", renderToStaticMarkup(<Container>x</Container>)],
  [
    "Container/prose",
    renderToStaticMarkup(<Container width="prose">x</Container>),
  ],
  [
    "Container/narrow",
    renderToStaticMarkup(<Container width="narrow">x</Container>),
  ],
  [
    "Stack",
    renderToStaticMarkup(
      <Stack gap="2xl" padBlock="xl" align="center">
        x
      </Stack>,
    ),
  ],
  [
    "Row",
    renderToStaticMarkup(
      <Row gap="lg" align="baseline" justify="between">
        x
      </Row>,
    ),
  ],
  ["Cluster", renderToStaticMarkup(<Cluster gap="xs">x</Cluster>)],
  ["Grid/1-2", renderToStaticMarkup(<Grid columns="1-2">x</Grid>)],
  ["Grid/2-4", renderToStaticMarkup(<Grid columns="2-4">x</Grid>)],
  ["Grid/1-3", renderToStaticMarkup(<Grid columns="1-3">x</Grid>)],
  ["Grid/2-3", renderToStaticMarkup(<Grid columns="2-3">x</Grid>)],
  ["Grid/1-aside", renderToStaticMarkup(<Grid columns="1-aside">x</Grid>)],
  ["VisuallyHidden", renderToStaticMarkup(<VisuallyHidden>x</VisuallyHidden>)],
  ["SkipLink", renderToStaticMarkup(<SkipLink>x</SkipLink>)],
  [
    "Text",
    renderToStaticMarkup(
      <Text tone="danger" size="xs" measure>
        x
      </Text>,
    ),
  ],
  ["Chip/accent", renderToStaticMarkup(<Chip tone="accent">x</Chip>)],
  [
    "Chip/muted",
    renderToStaticMarkup(
      <Chip tone="muted" href="#a">
        x
      </Chip>,
    ),
  ],
  ["Photo", renderToStaticMarkup(<Photo ratio="hero" caption="x" />)],
  ["Placeholder", renderToStaticMarkup(<Placeholder width="lg" />)],
  ...BUTTON_VARIANTS.flatMap((variant): [string, string][] => [
    [
      `Button/${variant}`,
      renderToStaticMarkup(<Button variant={variant}>x</Button>),
    ],
    [
      `Button/${variant}/hover`,
      renderToStaticMarkup(
        <Button variant={variant} forceState="hover">
          x
        </Button>,
      ),
    ],
    [
      `Button/${variant}/disabled`,
      renderToStaticMarkup(
        <Button variant={variant} disabled fullWidth size="sm">
          x
        </Button>,
      ),
    ],
  ]),
];

describe("every primitive, in every prop combination", () => {
  it.each(RENDERED)(
    "%s emits no physical CSS utility (AC-5)",
    (_name, html) => {
      for (const pattern of PHYSICAL) {
        expect(html, `${_name} matched ${String(pattern)}`).not.toMatch(
          pattern,
        );
      }
    },
  );

  it.each(RENDERED)("%s emits no raw colour (AC-1)", (_name, html) => {
    for (const pattern of RAW_COLOUR) {
      expect(html, `${_name} matched ${String(pattern)}`).not.toMatch(pattern);
    }
  });
});

describe("Button", () => {
  it("declares the eight states the gallery renders", () => {
    expect([...BUTTON_STATES]).toEqual([
      "default",
      "hover",
      "active",
      "focus-visible",
      "disabled",
      "busy",
      "full-width",
      "with-icon",
    ]);
  });

  it("meets the 44 px tap target at every size, from the control tokens (§5.3, v2)", () => {
    // `--control-md` 54, `--control-sm` 44, `--control-send` 60 (tokens.css).
    expect(renderToStaticMarkup(<Button>x</Button>)).toContain(
      "min-h-(--control-md)",
    );
    expect(renderToStaticMarkup(<Button size="sm">x</Button>)).toContain(
      "min-h-(--control-sm)",
    );
    const send = renderToStaticMarkup(
      <Button size="send" variant="accent">
        x
      </Button>,
    );
    expect(send).toContain("min-h-(--control-send)");
    expect(send).toContain("w-full");
  });

  it("draws v2's pills: poppy primary, ink-outline secondary, cornflower quiet", () => {
    const primary = renderToStaticMarkup(<Button>x</Button>);
    expect(primary).toMatch(/class="[^"]*\brounded-full\b/);
    expect(primary).toMatch(/class="[^"]*\bbg-accent\b[^"]*\btext-on-accent\b/);
    expect(primary).toMatch(/class="[^"]*\bfont-bold\b/);
    const secondary = renderToStaticMarkup(
      <Button variant="secondary">x</Button>,
    );
    expect(secondary).toContain("shadow-[inset_0_0_0_1.5px_var(--color-ink)]");
    expect(secondary).not.toMatch(/\bbg-accent\b/);
    const quiet = renderToStaticMarkup(<Button variant="quiet">x</Button>);
    expect(quiet).toMatch(/class="[^"]*\btext-link\b/);
    expect(quiet).toMatch(/class="[^"]*\bpx-0\b/);
    expect(quiet).not.toMatch(/\bpx-\[28px\]/);
    // A disabled button wears the one disabled skin, whatever its variant, and no pointer state.
    const disabled = renderToStaticMarkup(<Button disabled>x</Button>);
    expect(disabled).toContain("bg-surface-muted");
    expect(disabled).not.toContain("hover:");
  });

  it("marks a disabled button both ways, and keeps a busy one focusable", () => {
    const disabled = renderToStaticMarkup(<Button disabled>x</Button>);
    expect(disabled).toContain("disabled=");
    expect(disabled).toContain('aria-disabled="true"');
    const busy = renderToStaticMarkup(<Button busy>x</Button>);
    expect(busy).toContain('aria-busy="true"');
    expect(busy).not.toContain("disabled=");
  });

  it("renders an `<a>` when it navigates (WCAG 4.1.2)", () => {
    const link = renderToStaticMarkup(<Button href="/en">x</Button>);
    expect(link).toMatch(/^<a /);
    expect(link).toContain('href="/en"');
  });

  it("renders the pointer states statically for the gallery, with the same classes", () => {
    const hover = renderToStaticMarkup(<Button forceState="hover">x</Button>);
    const plain = renderToStaticMarkup(<Button>x</Button>);
    // The forced class is the hover class without the `hover:` variant.
    expect(plain).toContain("hover:bg-accent-strong");
    expect(plain).not.toMatch(/class="[^"]*(?<!:)\bbg-accent-strong\b/);
    expect(hover).toMatch(/class="[^"]*(?<![:\w-])bg-accent-strong\b/);
  });
});

describe("v2 type, links and chips (§14 A21; TASK-175)", () => {
  it("renders each display size at its v2 ramp step", () => {
    const cases = [
      ["hero", "text-hero-fluid"],
      ["display", "text-display-fluid"],
      ["title", "text-title-fluid"],
      ["display-s", "text-3xl-fluid"],
      ["2xl", "text-2xl-fluid"],
      ["xl", "text-md"],
    ] as const;
    for (const [size, step] of cases) {
      const html = renderToStaticMarkup(<Display size={size}>x</Display>);
      expect(html, size).toMatch(
        new RegExp(`class="display ${step.replace(/[()]/g, "\\$&")}"`),
      );
    }
    expect(renderToStaticMarkup(<Text>x</Text>)).toContain(
      "text-body-s md:text-body",
    );
  });

  it("draws the eyebrow in cornflower and links in the two link voices", () => {
    expect(renderToStaticMarkup(<Eyebrow>x</Eyebrow>)).toContain(
      'class="eyebrow',
    );
    const standalone = renderToStaticMarkup(<TextLink href="/en">x</TextLink>);
    expect(standalone).toMatch(/^<a href="\/en" class="link"/);
    const inline = renderToStaticMarkup(
      <TextLink href="/en" variant="inline">
        x
      </TextLink>,
    );
    expect(inline).toContain('class="link-inline"');
    // The arrow is the icon set's mirrored arrow, never a literal glyph.
    const arrow = renderToStaticMarkup(
      <TextLink href="/en" arrow>
        x
      </TextLink>,
    );
    expect(arrow).toContain("mirror-in-rtl");
    expect(arrow).not.toContain("→");
  });

  it("draws the current chip in the selected fill and the status chip's live dot in leaf", () => {
    const current = renderToStaticMarkup(
      <Chip href="/en/flowers" aria-current="page">
        Roses
      </Chip>,
    );
    expect(current).toContain('aria-current="page"');
    expect(current).toContain("aria-[current=page]:bg-selected");
    expect(
      renderToStaticMarkup(
        <Chip tone="muted" live>
          x
        </Chip>,
      ),
    ).toContain("before:bg-stem");
    expect(renderToStaticMarkup(<Chip tone="muted">x</Chip>)).toContain(
      "before:bg-ink-subtle",
    );
    expect(renderToStaticMarkup(<Chip tone="accent">x</Chip>)).toContain(
      "bg-accent text-on-accent",
    );
  });
});

describe("Price (§14 A21 clause 6's slot; TASK-175)", () => {
  it("renders the formatted amount it is given, with the all-in qualifier, and no equivalents line without data", () => {
    const html = renderToStaticMarkup(
      <Price amount="€55.90" qualifier="Price includes delivery and VAT" />,
    );
    expect(html).toContain("<bdi>€55.90</bdi>");
    expect(html).toContain("Price includes delivery and VAT");
    expect(html).toContain('data-fo-price="card"');
    expect(html).not.toContain("data-fo-price-equivalents");
    // An empty string is "no data" too: nothing is reserved.
    expect(
      renderToStaticMarkup(<Price amount="€55.90" equivalents="" />),
    ).not.toContain("data-fo-price-equivalents");
  });

  it("renders the equivalents line under the amount only when it is given, in subtle ink", () => {
    const line = "about £47.32 · 238.58 PLN at the rate of 8 September";
    const html = renderToStaticMarkup(
      <Price amount="€55.90" equivalents={line} />,
    );
    const equivalents =
      /<span class="([^"]*)" data-fo-price-equivalents="true">([^<]*)<\/span>/.exec(
        html,
      );
    expect(equivalents?.[2]).toBe(line);
    expect(equivalents?.[1]).toContain("text-ink-subtle");
    expect(equivalents?.[1]).toContain("text-xs");
    // After the amount, never before it.
    expect(html.indexOf(line)).toBeGreaterThan(html.indexOf("€55.90"));
  });

  it("sets the product-page price in the display face with the qualifier in leaf, and a from-price in poppy", () => {
    const page = renderToStaticMarkup(
      <Price
        variant="page"
        amount="€55.90"
        qualifier="Includes VAT and delivery"
      />,
    );
    expect(page).toMatch(/class="num display text-xl text-ink"/);
    expect(page).toContain("text-included");
    const from = renderToStaticMarkup(
      <Price variant="from" amount="from €35.90" />,
    );
    expect(from).toContain("text-accent");
    expect(from).not.toContain("data-fo-price-equivalents");
  });

  it("refuses equivalents on a from-price, by type and at runtime (A21 clause 6 (b); breaker hole 3)", () => {
    const fromWithEquivalents = renderToStaticMarkup(
      // @ts-expect-error — a from-price never carries equivalents (A21 clause 6 (b)).
      <Price variant="from" amount="from €35.90" equivalents="about £30.00" />,
    );
    expect(fromWithEquivalents).not.toContain("data-fo-price-equivalents");
    expect(fromWithEquivalents).not.toContain("about £30.00");
  });

  it("is phrasing content only, so it nests inside a paragraph or a link", () => {
    const html = renderToStaticMarkup(
      <Price amount="€55.90" qualifier="all in" equivalents="about £47.32" />,
    );
    expect(html).not.toMatch(/<(div|p)\b/);
  });
});

describe("FactsList, Breadcrumbs, NoticeBar and the wordmark (TASK-175)", () => {
  it("renders a definition list of rows, with an honest blank in ink-2", () => {
    const html = renderToStaticMarkup(
      <FactsList>
        <Fact label="Order by">14:00</Fact>
        <Fact label="Delivery days" none>
          none to state
        </Fact>
      </FactsList>,
    );
    expect(html).toMatch(/^<dl /);
    // Every child of the <dl> is a row <div> holding one <dt> and one <dd>.
    expect(html.match(/<div class="[^"]*"><dt /g)).toHaveLength(2);
    expect(html).toMatch(/<dd class="m-0 text-ink">14:00<\/dd>/);
    expect(html).toMatch(/<dd class="m-0 text-ink-muted">none to state<\/dd>/);
    expect(html).toContain("md:grid-cols-[200px_minmax(0,1fr)]");
    expect(
      renderToStaticMarkup(
        <Fact label="Order by" density="narrow">
          x
        </Fact>,
      ),
    ).toContain("md:grid-cols-[130px_minmax(0,1fr)]");
  });

  it("links every crumb with a page, writes a crumb without one as text, and marks the current page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        label="Breadcrumb"
        crumbs={[
          { key: "home", label: "Home", href: "/en" },
          { key: "hub", label: "Flowers" },
          { key: "here", label: "Roses", href: "/en/roses", current: true },
        ]}
      />,
    );
    expect(html).toContain('<nav aria-label="Breadcrumb"');
    // The trail itself; the phone's back link after it is TASK-195's (`ui-phone-chrome.test.tsx`).
    const trail = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    expect(trail.match(/<a /g)).toHaveLength(1);
    expect(trail).toContain('href="/en"');
    expect(html).not.toContain('href="/en/roses"');
    expect(html).toContain(
      '<span aria-current="page" class="text-ink">Roses</span>',
    );
    expect(html).toContain("<span>Flowers</span>");
    expect(trail.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("draws the notice bar on the inverse surface, its phrase in sunflower", () => {
    const html = renderToStaticMarkup(
      <NoticeBar utilities={<a href="#help">Help</a>}>
        A note from us: <strong>dates soon</strong>
      </NoticeBar>,
    );
    expect(html).toContain("surface-inverse");
    expect(html).toContain("[&amp;_strong]:text-on-inverse-accent");
    expect(html).toContain('href="#help"');
    expect(renderToStaticMarkup(<NoticeBar>x</NoticeBar>)).not.toContain(
      "md:flex [&amp;_a]",
    );
  });

  it("renders the wordmark as outlined paths in the logo ink, named only when asked", () => {
    const html = renderToStaticMarkup(<Wordmark className="h-[25px]" />);
    expect(html).toContain(`viewBox="${WORDMARK_VIEW_BOX}"`);
    expect(html).toContain('fill="var(--color-logo-ink)"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<text\b/);
    expect(WORDMARK_PATH.length).toBeGreaterThan(1000);
    const named = renderToStaticMarkup(<Wordmark label="Flowers Overseas" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Flowers Overseas"');
  });

  it("rounds photographs as v2 draws them, the hero at 28 px and the arch", () => {
    expect(renderToStaticMarkup(<Photo ratio="card" />)).toContain(
      "rounded-photo-s md:rounded-photo",
    );
    expect(renderToStaticMarkup(<Photo ratio="hero" />)).toContain(
      "rounded-hero",
    );
    expect(renderToStaticMarkup(<Photo ratio="arch" />)).toContain(
      "rounded-arch",
    );
  });
});

describe("Photo and Placeholder (plan/10 §3 honesty rule)", () => {
  it("renders the gradient placeholder and never an `<img>`", () => {
    const html = renderToStaticMarkup(
      <Photo ratio="hero" caption="Photo slot · hero" />,
    );
    expect(html).toContain("photo");
    expect(html).toContain("Photo slot · hero");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
  });

  it("hides the data stub from assistive technology and shows no number", () => {
    const html = renderToStaticMarkup(<Placeholder />);
    expect(html).toContain('aria-hidden="true"');
    // No text content at all: the stub stands in for a number nobody may invent (Phase 0 AC 6).
    expect(html).toMatch(/><\/span>$/);
  });
});

describe("SkipLink and VisuallyHidden", () => {
  it("hides the skip link until it is focused, then paints it above every layer", () => {
    const html = renderToStaticMarkup(<SkipLink>Skip to content</SkipLink>);
    expect(html).toContain("sr-only");
    expect(html).toContain("focus-visible:not-sr-only");
    expect(html).toContain("focus-visible:layer-overlay");
    expect(html).toContain('href="#main"');
  });

  it("keeps visually hidden text in the accessibility tree", () => {
    const html = renderToStaticMarkup(
      <VisuallyHidden>Prices in euro</VisuallyHidden>,
    );
    expect(html).toContain("sr-only");
    expect(html).not.toContain("hidden=");
    expect(html).toContain("Prices in euro");
  });
});
