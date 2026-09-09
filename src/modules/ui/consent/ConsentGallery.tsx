"use client";

/**
 * The consent states in `/dev/components` (spec 004 §2 "Component gallery", §5.3, AC-28; the
 * TASK-051 row's "four banner + three settings states in `/dev/components`").
 *
 * Four banner states — `hidden`, `shown`, `settings-open`, `saved` — and three settings states —
 * `default`, `dirty`, `saved` — rendered **inert**: every handler is a no-op, so the gallery
 * writes no cookie, sends no request and calls no `gtag` while the visual and axe suites walk it.
 * `hidden` is the honest one: the state renders nothing, and the gallery says so in its caption
 * rather than drawing a box that does not exist.
 *
 * A Client Component because the views take function props, which a Server Component may not
 * serialise; it lives in the design system rather than in `src/app/` so `app/` stays thin
 * (`plan/01` §5) and so the gallery cannot drift from the components it documents. The captions
 * arrive as props from `src/app/(dev)/dev/components/catalog.ts`, where every developer-facing
 * string in this route lives — see that file's header for why they are not message keys.
 */
import type { ReactElement, ReactNode } from "react";

import { ConsentBannerView, ConsentSavedView } from "./ConsentBannerView";
import { ConsentSettingsPanel } from "./ConsentSettingsPanel";
import type { ConsentChoices } from "./consentCookie";
import type { ConsentView } from "./consentTypes";

/** The seven states, in the order §5.3 lists them. */
export const CONSENT_GALLERY_STATES = [
  "hidden",
  "shown",
  "settings-default",
  "settings-dirty",
  "saved",
] as const;
export type ConsentGalleryState = (typeof CONSENT_GALLERY_STATES)[number];

export interface ConsentGalleryProps {
  readonly view: ConsentView;
  /** One caption per state, from the gallery's catalogue. */
  readonly states: readonly {
    readonly id: ConsentGalleryState;
    readonly caption: string;
  }[];
}

const noop = (): void => undefined;
const OFF: ConsentChoices = { analytics: false, marketing: false };
const DIRTY: ConsentChoices = { analytics: true, marketing: false };

export function ConsentGallery({
  view,
  states,
}: ConsentGalleryProps): ReactElement {
  const panel = (choices: ConsentChoices, id: string): ReactElement => (
    <ConsentSettingsPanel
      categories={view.categories}
      choices={choices}
      idPrefix={id}
      onSave={noop}
      onToggle={noop}
      strings={view.strings}
    />
  );

  const render = (state: ConsentGalleryState): ReactNode => {
    if (state === "hidden") return null;
    if (state === "saved") {
      return (
        <ConsentSavedView
          headlineId="gallery-consent-saved"
          inline
          onClose={noop}
          strings={view.strings}
        />
      );
    }
    return (
      <ConsentBannerView
        headlineId={`gallery-consent-${state}`}
        inline
        onAccept={noop}
        onOpenSettings={noop}
        onReject={noop}
        strings={view.strings}
      >
        {state === "shown"
          ? undefined
          : panel(
              state === "settings-dirty" ? DIRTY : OFF,
              `gallery-consent-${state}`,
            )}
      </ConsentBannerView>
    );
  };

  return (
    <div className="gap-lg grid" data-fo-consent-gallery="">
      {states.map((state) => (
        <div className="gap-sm grid" key={state.id}>
          <p className="text-ink-subtle text-xs">{state.caption}</p>
          {render(state.id)}
        </div>
      ))}
    </div>
  );
}
