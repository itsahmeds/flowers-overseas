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
  Button,
  BUTTON_STATES,
  BUTTON_VARIANTS,
  Chip,
  Cluster,
  Container,
  Grid,
  Photo,
  Placeholder,
  Row,
  SkipLink,
  Stack,
  Text,
  VisuallyHidden,
} from "../../src/modules/ui/index.ts";

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
    renderToStaticMarkup(
      <Container width="prose" inline="none">
        x
      </Container>,
    ),
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

  it("meets the 44 px tap target at both sizes (§5.3)", () => {
    expect(renderToStaticMarkup(<Button>x</Button>)).toContain("min-h-[50px]");
    expect(renderToStaticMarkup(<Button size="sm">x</Button>)).toContain(
      "min-h-[44px]",
    );
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
    expect(plain).toContain("hover:bg-ink-muted");
    expect(hover).toMatch(/class="[^"]*\bbg-ink-muted\b/);
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
