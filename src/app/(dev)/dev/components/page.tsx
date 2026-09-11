import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { devUiEnabled } from "@/lib/env.schema";
import { documentFallbackLocale, localePath } from "@/modules/i18n";
import {
  Button,
  BUTTON_VARIANTS,
  consentView,
  type ConsentTranslate,
  Chip,
  Container,
  DestinationList,
  Cluster,
  CONTRAST_PAIRS,
  Display,
  Grid,
  Icon,
  ICON_NAMES,
  FinderCard,
  HomeFaq,
  HomeHero,
  HowItWorks,
  OccasionDates,
  OccasionTiles,
  Label,
  Mark,
  Media,
  MediaAsset,
  MediaProvenanceNote,
  MEDIA_SLOTS,
  mediaSlot,
  MIRRORED_IN_RTL,
  Photo,
  PHOTO_RATIOS,
  ProofRow,
  Placeholder,
  TrustStrip,
  footerView,
  type FooterView,
  Row,
  SiteFooter,
  SiteHeader,
  SkipLink,
  Stack,
  Text,
  VisuallyHidden,
} from "@/modules/ui";

// By path, and only here: `ConsentGallery` is a Client Component that imports both consent views
// statically, so exporting it from `@/modules/ui` would put those views and `Button` into the
// document JavaScript of every route that touches the barrel — `/` included, which renders no
// consent sheet (+1 990 B Brotli, measured, against §14 A1's 1 434 B of headroom). The gallery is
// the one route that is neither public nor budgeted, so it is the one place this import belongs.
import { ConsentGallery } from "@/modules/ui/consent/ConsentGallery";

import {
  BODY_SAMPLES,
  BUTTON_BUSY_LABEL,
  BUTTON_LABEL,
  BUTTON_LINK_LABEL,
  CHIP_LINK_LABEL,
  CHIP_SAMPLES,
  COLOUR_RAMPS,
  CONSENT_STATES,
  FOOTER_REGISTERED_COMPANY,
  FOOTER_STATES,
  GALLERY_AI_ASSET,
  GALLERY_ALTLESS_LOCALE,
  GALLERY_INTRO,
  GALLERY_MEDIA_MANIFEST,
  GALLERY_NO_BYTES_ASSET,
  GALLERY_PENDING_ASSET,
  GALLERY_PHOTO_ASSET,
  GALLERY_TITLE,
  HEADER_STATES,
  HOME_SECTION_STATES,
  HOME_STATES,
  LABEL_SAMPLE,
  MEDIA_ASSET_STATES,
  MEDIA_SLOT_CAPTION,
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

/**
 * The `FooterView` each of the five §5.3 states is rendered from (TASK-049). `links-populated`
 * and `company-registered` are the two states no Phase-0 page can reach: the first publishes one
 * target, the second fills the five registry fields of an **example** company — the numbers are
 * zeros and the names carry "(example)", because this document is dev-only and `noindex` and an
 * invented registry number must not be readable as a fact anywhere (§8).
 */
function footerStateView(
  state: (typeof FOOTER_STATES)[number]["id"],
  locale: string,
): FooterView {
  const base = footerView(locale);
  if (state === "links-populated") {
    return {
      ...base,
      columns: base.columns.map((group) => ({
        ...group,
        links: group.links.map((link) =>
          link.id === "destinations"
            ? { ...link, href: localePath(locale, "destinations") }
            : link,
        ),
      })),
    };
  }
  if (state === "company-registered") {
    return {
      ...base,
      company: {
        ...base.company,
        identity: {
          legalName: FOOTER_REGISTERED_COMPANY.legalName,
          registryName: FOOTER_REGISTERED_COMPANY.registryName,
          registrationNumber: FOOTER_REGISTERED_COMPANY.registrationNumber,
          vatId: FOOTER_REGISTERED_COMPANY.vatId,
          address: [
            ...FOOTER_REGISTERED_COMPANY.address.lines,
            FOOTER_REGISTERED_COMPANY.address.postalCode,
            FOOTER_REGISTERED_COMPANY.address.city,
          ].join(", "),
        },
      },
    };
  }
  return base;
}

export default function DevComponentsPage(): ReactElement {
  if (!devUiEnabled(process.env)) notFound();
  // The gallery has no locale of its own (see `(dev)/layout.tsx`): the chrome renders in the
  // x-default locale, exactly as `/` and the 404 do. `SiteHeader` reads its copy through
  // next-intl like every other component, so that locale is published to the request here rather
  // than the header growing a "no locale" branch it would never take in production.
  const galleryLocale = documentFallbackLocale().code;
  setRequestLocale(galleryLocale);
  const translate = useTranslations();
  // The same narrowing `SiteFooter` and `ConsentBanner` make: register-supplied keys are strings,
  // the translator's parameter is the catalogue's key union, and `pnpm i18n:check` proves each
  // one resolves.
  const narrowedTranslate: ConsentTranslate = (key, values) =>
    translate(key as Parameters<typeof translate>[0], values);

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
          <Text size="xs" tone="subtle">
            {MEDIA_SLOT_CAPTION}
          </Text>
          <Grid columns="2-4" gap="md">
            {MEDIA_SLOTS.map((slot) => (
              <Stack gap="xs" key={slot}>
                <Media
                  alt=""
                  caption={`${slot} \u00b7 ${mediaSlot(slot).sizes}`}
                  slot={slot}
                />
                <Text size="xs" tone="subtle">
                  {`${slot} \u00b7 ${mediaSlot(slot).sizes} \u00b7 ${mediaSlot(slot).ratio}`}
                </Text>
              </Stack>
            ))}
          </Grid>
        </Section>

        {/*
          The asset path's states (spec 006 §5.3; TASK-079). This section is the only surface in
          the repository that can show them: the committed dataset has 31 asset rows and **no**
          derived bytes and no alt text, so every real call site renders the placeholder. The
          fixture manifest in `catalog.ts` is that dataset with the ladder and the alt text
          TASK-080's imagery adds, passed per call rather than installed globally, so no request
          mutates module state.
        */}
        <Section title={SECTIONS[11]}>
          <Stack gap="lg">
            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.image}
              </Text>
              <Grid columns="2-4" gap="md">
                <MediaAsset
                  assetId={GALLERY_AI_ASSET}
                  locale={galleryLocale}
                  manifest={GALLERY_MEDIA_MANIFEST}
                />
              </Grid>
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.priority}
              </Text>
              <MediaAsset
                assetId={GALLERY_PHOTO_ASSET}
                locale={galleryLocale}
                manifest={GALLERY_MEDIA_MANIFEST}
                priority
              />
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.placeholderUnapproved}
              </Text>
              <Grid columns="2-4" gap="md">
                <MediaAsset
                  assetId={GALLERY_PENDING_ASSET}
                  locale={galleryLocale}
                  manifest={GALLERY_MEDIA_MANIFEST}
                />
              </Grid>
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.placeholderNoAlt}
              </Text>
              <Grid columns="2-4" gap="md">
                {/* A locale the fixture has no alt row for: the box, not an English alt. */}
                <MediaAsset
                  assetId={GALLERY_AI_ASSET}
                  locale={GALLERY_ALTLESS_LOCALE}
                  manifest={GALLERY_MEDIA_MANIFEST}
                />
              </Grid>
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.placeholderNoBytes}
              </Text>
              <Grid columns="2-4" gap="md">
                <MediaAsset
                  assetId={GALLERY_NO_BYTES_ASSET}
                  locale={galleryLocale}
                  manifest={GALLERY_MEDIA_MANIFEST}
                />
              </Grid>
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.placeholderCommitted}
              </Text>
              <Grid columns="2-4" gap="md">
                {/* The committed manifest, with no `manifest` prop: the Phase-0 state. */}
                <MediaAsset assetId={GALLERY_AI_ASSET} locale={galleryLocale} />
              </Grid>
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.provenance}
              </Text>
              <MediaProvenanceNote
                assetIds={[GALLERY_AI_ASSET]}
                locale={galleryLocale}
                manifest={GALLERY_MEDIA_MANIFEST}
              />
            </Stack>

            <Stack gap="sm">
              <Text measure size="sm" tone="muted">
                {MEDIA_ASSET_STATES.provenanceHidden}
              </Text>
              <MediaProvenanceNote
                assetIds={[GALLERY_PHOTO_ASSET]}
                locale={galleryLocale}
                manifest={GALLERY_MEDIA_MANIFEST}
              />
            </Stack>
          </Stack>
        </Section>

        <Section title={SECTIONS[12]}>
          <Stack gap="lg">
            {(
              [
                [
                  "hero",
                  <HomeHero
                    headingLevel="h2"
                    key="hero"
                    locale={galleryLocale}
                  />,
                ],
                ["finder", <FinderCard key="finder" locale={galleryLocale} />],
                [
                  "destinations",
                  <DestinationList key="destinations" locale={galleryLocale} />,
                ],
                ["proof", <ProofRow key="proof" />],
              ] as const
            ).map(([state, element]) => (
              <Stack gap="sm" key={state}>
                <Text measure size="sm" tone="muted">
                  {HOME_STATES[state]}
                </Text>
                <div className="border-rule border">{element}</div>
              </Stack>
            ))}
          </Stack>
        </Section>

        <Section title={SECTIONS[12]}>
          <Stack gap="lg">
            {(
              [
                [
                  "dates",
                  <OccasionDates
                    headingLevel="h3"
                    key="dates"
                    locale={galleryLocale}
                  />,
                ],
                [
                  "occasions",
                  <OccasionTiles
                    headingLevel="h3"
                    key="occasions"
                    locale={galleryLocale}
                  />,
                ],
                [
                  "howItWorks",
                  <HowItWorks headingLevel="h3" key="howItWorks" />,
                ],
                ["faq", <HomeFaq headingLevel="h3" key="faq" />],
                ["trust", <TrustStrip headingLevel="h3" key="trust" />],
              ] as const
            ).map(([state, element]) => (
              <Stack gap="sm" key={state}>
                <Text measure size="sm" tone="muted">
                  {HOME_SECTION_STATES[state]}
                </Text>
                <div className="border-rule border">{element}</div>
              </Stack>
            ))}
          </Stack>
        </Section>

        {/* The header is full-bleed by design, so it is rendered outside the section's padding
            through a negative-free wrapper: the box below is the header at this viewport's
            breakpoint, not a scaled copy of it. */}
        <Section title={SECTIONS[13]}>
          <Stack gap="sm">
            <Text size="xs" tone="subtle">
              {HEADER_STATES.heading}
            </Text>
            <div className="border-rule border">
              <SiteHeader locale={galleryLocale} />
            </div>
            <Text measure size="sm" tone="muted">
              {HEADER_STATES.note}
            </Text>
          </Stack>
        </Section>

        <Section title={SECTIONS[14]}>
          {/* Inert by construction: `ConsentGallery` passes no-op handlers, so walking this page
              writes no cookie, sends no request and calls no `gtag` (TASK-051). */}
          <ConsentGallery
            states={CONSENT_STATES}
            view={consentView(narrowedTranslate)}
          />
        </Section>

        <Section title={SECTIONS[15]}>
          {FOOTER_STATES.map((state) => (
            <Stack key={state.id} gap="sm">
              <Text size="xs" tone="subtle">
                {state.caption}
              </Text>
              <SiteFooter
                locale={galleryLocale}
                idPrefix={`gallery-${state.id}`}
                view={footerStateView(state.id, galleryLocale)}
                marks={[]}
              />
            </Stack>
          ))}
        </Section>

        <Section title={SECTIONS[16]}>
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
