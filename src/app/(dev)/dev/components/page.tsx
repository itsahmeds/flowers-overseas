import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { devUiEnabled } from "@/lib/env.schema";
import {
  Button,
  BUTTON_VARIANTS,
  Chip,
  Container,
  Cluster,
  CONTRAST_PAIRS,
  Display,
  Grid,
  Icon,
  ICON_NAMES,
  Label,
  Mark,
  MIRRORED_IN_RTL,
  Photo,
  PHOTO_RATIOS,
  Placeholder,
  Row,
  SkipLink,
  Stack,
  Text,
  VisuallyHidden,
} from "@/modules/ui";

import {
  BODY_SAMPLES,
  BUTTON_BUSY_LABEL,
  BUTTON_LABEL,
  BUTTON_LINK_LABEL,
  CHIP_LINK_LABEL,
  CHIP_SAMPLES,
  COLOUR_RAMPS,
  GALLERY_INTRO,
  GALLERY_TITLE,
  LABEL_SAMPLE,
  LAYER_TOKENS,
  MIRROR_NOTE,
  MIRROR_TAG,
  MOTION_TOKENS,
  PHOTO_CAPTIONS,
  PRIMITIVE_CAPTIONS,
  RADIUS_STEPS,
  SECTIONS,
  SHADOW_STEPS,
  sectionId,
  SPACE_STEPS,
  TYPE_SAMPLES,
} from "./catalog";

/**
 * `/dev/components` — the component gallery (spec 004 §2 "Component gallery — decided, not asked",
 * §13 Q10, AC-28; TASK-045).
 *
 * **Rendering: static, flag-gated, `noindex`** (§5.4). It renders every token ramp and every
 * component state this task ships, so that:
 *
 *  - one Playwright screenshot covers states no Phase-0 page reaches (disabled, error, busy,
 *    empty) — which is why the visual suite gets a real gate here instead of four blank pages;
 *  - one axe run covers every component at once (AC-26's sixth surface);
 *  - a reviewer can see a component's whole state matrix without building a page for it.
 *
 * **404 when `ENABLE_DEV_UI` is off**, and the zod env schema fails the build when it is on while
 * `VERCEL_ENV=production` (`src/lib/env.schema.ts`, AC-28). `notFound()` — not a redirect
 * (ADR-0006) — so the flag-off answer is a real 404 document in the x-default locale.
 *
 * The gallery's own strings are developer-facing identifiers and live in `./catalog.ts`; the
 * reasoning is in that file's header.
 *
 * Each later 004 task appends its component's states here (§2). The three pointer states a
 * screenshot cannot reach (`hover`, `active`, `focus-visible`) are rendered through the
 * primitives' `forceState` prop, which applies the *same* utilities the pseudo-classes do — §2's
 * "hover-equivalent".
 */
export const metadata: Metadata = {
  robots: "noindex,nofollow",
  title: GALLERY_TITLE,
  description: GALLERY_INTRO,
};

/** A titled block with the canvas's label voice and a hairline, so sections read as printed. */
function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const id = sectionId(title);
  return (
    <Stack as="section" gap="lg" padBlock="xl" className="border-rule border-b">
      <Label as="h2" id={id}>
        {title}
      </Label>
      {children}
    </Stack>
  );
}

/** A row of a component's states, each named by its state id. */
function StateRow({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Stack gap="sm">
      <Text size="xs" tone="subtle">
        {name}
      </Text>
      <Cluster gap="md" align="center">
        {children}
      </Cluster>
    </Stack>
  );
}

export default function DevComponentsPage(): ReactElement {
  if (!devUiEnabled(process.env)) notFound();

  return (
    <>
      <SkipLink>{GALLERY_TITLE}</SkipLink>
      <Container as="main" id="main" width="page">
        <Stack gap="lg" padBlock="xl">
          <Display as="h1" size="display-s">
            {GALLERY_TITLE}
          </Display>
          <Text measure tone="muted">
            {GALLERY_INTRO}
          </Text>
          <Cluster gap="sm">
            {SECTIONS.map((section) => (
              <Chip key={section} tone="muted" href={`#${sectionId(section)}`}>
                {section}
              </Chip>
            ))}
          </Cluster>
        </Stack>

        <Section title={SECTIONS[0]}>
          {COLOUR_RAMPS.map((ramp) => (
            <Stack key={ramp.name} gap="sm">
              <Text size="sm" tone="muted">
                {ramp.name}
              </Text>
              <Grid columns="2-4" gap="sm">
                {ramp.swatches.map((swatch) => (
                  <Stack
                    key={swatch.token}
                    gap="none"
                    className={`border-rule p-sm min-h-[96px] justify-end border ${swatch.className}`}
                  >
                    <Text size="xs" className={swatch.inkClassName}>
                      {swatch.token}
                    </Text>
                  </Stack>
                ))}
              </Grid>
            </Stack>
          ))}
        </Section>

        <Section title={SECTIONS[1]}>
          <Stack gap="md">
            {TYPE_SAMPLES.map((sample) => (
              <Stack key={sample.token} gap="xs">
                <Text size="xs" tone="subtle">
                  {sample.token}
                </Text>
                <Display
                  as="p"
                  size={
                    sample.token === "--text-display"
                      ? "display"
                      : sample.token === "--text-display-s"
                        ? "display-s"
                        : sample.token === "--text-2xl"
                          ? "2xl"
                          : "xl"
                  }
                >
                  {sample.sample}
                </Display>
              </Stack>
            ))}
            {BODY_SAMPLES.map((sample) => (
              <Stack key={sample.token} gap="xs">
                <Text size="xs" tone="subtle">
                  {sample.token}
                </Text>
                <Text
                  measure
                  size={
                    sample.token === "--text-lg"
                      ? "lg"
                      : sample.token === "--text-md"
                        ? "md"
                        : sample.token === "--text-sm"
                          ? "sm"
                          : "xs"
                  }
                >
                  {sample.sample}
                </Text>
              </Stack>
            ))}
            <Label>{LABEL_SAMPLE}</Label>
          </Stack>
        </Section>

        <Section title={SECTIONS[2]}>
          <Stack gap="sm">
            {SPACE_STEPS.map((step) => (
              <Row key={step.token} gap="sm" align="center">
                <span
                  className={`bg-accent block h-[8px] ${step.className}`}
                  aria-hidden
                />
                <Text size="xs" tone="subtle">
                  {step.token}
                </Text>
              </Row>
            ))}
          </Stack>
        </Section>

        <Section title={SECTIONS[3]}>
          <Cluster gap="md">
            {RADIUS_STEPS.map((step) => (
              <Stack key={step.token} gap="xs" align="center">
                <span
                  aria-hidden
                  className={`bg-surface-muted block size-[56px] ${step.className}`}
                />
                <Text size="xs" tone="subtle">
                  {step.token}
                </Text>
              </Stack>
            ))}
          </Cluster>
          <Cluster gap="md">
            {SHADOW_STEPS.map((step) => (
              <Stack key={step.token} gap="xs" align="center">
                <span
                  aria-hidden
                  className={`bg-surface block size-[56px] rounded-md ${step.className}`}
                />
                <Text size="xs" tone="subtle">
                  {step.token}
                </Text>
              </Stack>
            ))}
          </Cluster>
          <Stack gap="xs">
            {[...MOTION_TOKENS, ...LAYER_TOKENS].map((token) => (
              <Text key={token} size="xs" tone="subtle">
                {token}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title={SECTIONS[4]}>
          <Cluster gap="lg">
            {ICON_NAMES.map((name) => (
              <Stack
                key={name}
                gap="xs"
                align="center"
                className="min-w-[72px]"
              >
                <Icon name={name} size={24} />
                <Text size="xs" tone="subtle">
                  {name}
                </Text>
                {MIRRORED_IN_RTL.has(name) ? (
                  <Text size="xs" tone="accent">
                    {MIRROR_TAG}
                  </Text>
                ) : null}
              </Stack>
            ))}
          </Cluster>
          <Text size="sm" tone="muted" measure>
            {MIRROR_NOTE}
          </Text>
        </Section>

        <Section title={SECTIONS[5]}>
          <Cluster gap="lg" align="center">
            <Mark size={56} />
            <Mark size={40} />
            <Mark size={24} />
            <Display as="p" size="xl">
              {GALLERY_TITLE}
            </Display>
          </Cluster>
        </Section>

        <Section title={SECTIONS[6]}>
          <Grid columns="1-2" gap="md">
            <Stack gap="sm" className="border-rule p-md border">
              <Text size="xs" tone="subtle">
                {PRIMITIVE_CAPTIONS.stack}
              </Text>
              <Placeholder width="lg" />
              <Placeholder width="md" />
              <Placeholder width="sm" />
            </Stack>
            <Stack gap="sm" className="border-rule p-md border">
              <Text size="xs" tone="subtle">
                {PRIMITIVE_CAPTIONS.rowClusterGrid}
              </Text>
              <Row gap="sm">
                <Placeholder />
                <Placeholder />
              </Row>
              <Cluster gap="xs">
                <Placeholder width="sm" />
                <Placeholder width="sm" />
                <Placeholder width="sm" />
                <Placeholder width="sm" />
              </Cluster>
              <Grid columns="2-4" gap="xs">
                <Placeholder width="sm" />
                <Placeholder width="sm" />
                <Placeholder width="sm" />
                <Placeholder width="sm" />
              </Grid>
            </Stack>
          </Grid>
          <Text size="sm" tone="muted">
            {PRIMITIVE_CAPTIONS.visuallyHiddenLead}
            <VisuallyHidden>{GALLERY_INTRO}</VisuallyHidden>
            {PRIMITIVE_CAPTIONS.visuallyHiddenTrail}
          </Text>
        </Section>

        <Section title={SECTIONS[7]}>
          {BUTTON_VARIANTS.map((variant) => (
            <Stack key={variant} gap="sm">
              <Text size="sm" tone="muted">
                {variant}
              </Text>
              <StateRow name="default · hover · active · focus-visible">
                <Button variant={variant}>{BUTTON_LABEL}</Button>
                <Button variant={variant} forceState="hover">
                  {BUTTON_LABEL}
                </Button>
                <Button variant={variant} forceState="active">
                  {BUTTON_LABEL}
                </Button>
                <Button variant={variant} forceState="focus-visible">
                  {BUTTON_LABEL}
                </Button>
              </StateRow>
              <StateRow name="disabled · busy · with-icon · link · small">
                <Button variant={variant} disabled>
                  {BUTTON_LABEL}
                </Button>
                <Button variant={variant} busy>
                  {BUTTON_BUSY_LABEL}
                </Button>
                <Button
                  variant={variant}
                  iconStart={<Icon name="arrow-end" size={18} />}
                >
                  {BUTTON_LABEL}
                </Button>
                <Button variant={variant} href="#main">
                  {BUTTON_LINK_LABEL}
                </Button>
                <Button variant={variant} size="sm">
                  {BUTTON_LABEL}
                </Button>
              </StateRow>
              <StateRow name="full-width">
                <Button variant={variant} fullWidth>
                  {BUTTON_LABEL}
                </Button>
              </StateRow>
            </Stack>
          ))}
        </Section>

        <Section title={SECTIONS[8]}>
          <Cluster gap="md">
            {CHIP_SAMPLES.map((chip) => (
              <Chip key={chip.text} tone={chip.tone} aria-label={chip.label}>
                {chip.text}
              </Chip>
            ))}
            <Chip href="#main">{CHIP_LINK_LABEL}</Chip>
          </Cluster>
        </Section>

        <Section title={SECTIONS[9]}>
          <Grid columns="2-4" gap="md">
            {PHOTO_RATIOS.map((ratio) => (
              <Photo
                key={ratio}
                ratio={ratio}
                caption={PHOTO_CAPTIONS[ratio]}
              />
            ))}
          </Grid>
          <Photo ratio="landscape" />
        </Section>

        <Section title={SECTIONS[10]}>
          <Stack gap="xs">
            {CONTRAST_PAIRS.map((pair) => (
              <Row
                key={`${pair.foreground}-${pair.background}-${pair.kind}`}
                gap="sm"
                align="center"
              >
                <Text size="xs" tone="subtle">
                  {`${pair.foreground} on ${pair.background} · ${pair.kind} · ${pair.usage}`}
                </Text>
              </Row>
            ))}
          </Stack>
        </Section>
      </Container>
    </>
  );
}
