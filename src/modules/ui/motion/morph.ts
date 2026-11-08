/**
 * Motion 14, the photo morph (spec 042 §5.3.1, AC-7, AC-8; spec 004 §14 A-founder-2026-10-20a;
 * TASK-307; `docs/design/system/motion-interactions.dc.html`, motion 14).
 *
 * A product card's photograph glides into the product page's hero on a cross-document view
 * transition, from `lg` up, under `prefers-reduced-motion: no-preference`, and only when the
 * navigation was started by activating that card's link. Everything that moves is CSS
 * (`src/app/globals.css`, motion 14); this file toggles one stylesheet's `media`, gives the
 * activated card's photograph box a name and a size in `pageswap`, and undoes both on `pageshow`.
 *
 * **Who opts in, and when.** A cross-document view transition needs both documents to carry
 * `@view-transition { navigation: auto }`. The product page carries it in its own server HTML,
 * inside `MORPH_MEDIA`, with its hero's name (`Gallery`, `<style data-fo-morph>`). The page the
 * card is on carries no opt-in until a plain click on a card link: then this module turns its rule
 * on (`media` = `MORPH_MEDIA`, so reduced motion and a viewport below `lg` still say no). So a
 * header, breadcrumb or pagination link, a first load, a reload, a typed URL and every click before
 * this deferred module has loaded start no transition (AC-8). Once loaded, it turns the product
 * page's own rule off as well, so Back and Forward between two product pages never morph.
 *
 * **One name, on the activated card only** (spec 004 A-founder-2026-10-20a clause 4). `pageswap`
 * names the card's photograph box, never a static name per card: one product can sit in two home
 * rails, and two boxes with one name abort the transition. The name is the photograph's asset id
 * (`morphName`), which the card's box and the product page's hero already carry in their HTML, so
 * no card gains a byte. Any other navigation is skipped here.
 *
 * **Transform only** (clause 2). A view transition's group animates from the old box's size to the
 * new box's, and CSS cannot write keyframes for a start box only the browser knows. So before the
 * capture the card's box takes the hero's width (`--fo-morph-hero` in `globals.css`, the product
 * page's frame and 12-column grid at this viewport's width, which this module passes in), is
 * scaled back down to its own width about its inline-start top corner (`--fo-morph-k`), and gives
 * the difference back with a negative block-end margin: the card looks and lays out as before. Both
 * ends of the group are then one size, so the only thing that changes across the flight is
 * `transform`, a translate and one uniform scale (the artboard's "The flight").
 */

/** The two conditions every part of the morph sits inside (`@media`, a stylesheet's `media`). */
export const MORPH_MEDIA =
  "(prefers-reduced-motion:no-preference) and (min-width:64rem)";

/** An asset id the product page will name its hero by: plain kebab-case, nothing a sheet parses. */
export const MORPH_ASSET_ID = /^[a-z0-9-]+$/;

/** The view-transition name of a photograph, on the card and on the product page's hero alike. */
export function morphName(assetId: string): string {
  return `photo-${assetId}`;
}

/**
 * The product page's half, as the text of its `<style data-fo-morph>` (server only; `Gallery`):
 * inside `MORPH_MEDIA`, the document opts in and the hero's photograph carries its name. The
 * `<img>` is named rather than its box, so a hero not yet decoded at the reveal is transparent and
 * the card's photograph carries the flight; it takes the box's corner, since the box's clip is not
 * part of the snapshot. `undefined` for an id outside `MORPH_ASSET_ID`: no rule, no morph.
 */
export function morphHeroRule(assetId: string): string | undefined {
  return MORPH_ASSET_ID.test(assetId)
    ? `@media ${MORPH_MEDIA}{@view-transition{navigation:auto}[data-fo-gallery-image=hero] img{view-transition-name:${morphName(assetId)};border-radius:var(--radius-photo)}}`
    : undefined;
}

/**
 * Starts motion 14 on this document and returns the click hook: the card link a plain click
 * activated, or `null` for any other link.
 */
export function armMorph(
  d: Document,
): (link: HTMLAnchorElement | null) => void {
  let from: HTMLAnchorElement | null = null;
  let undo = (): void => {};
  const optIn =
    d.querySelector<HTMLStyleElement>("style[data-fo-morph]") ??
    d.head.appendChild(d.createElement("style"));
  optIn.textContent ||= "@view-transition{navigation:auto}";
  const arm = (link: HTMLAnchorElement | null): void => {
    from = link;
    optIn.media = link ? MORPH_MEDIA : "not all";
  };
  arm(null);

  addEventListener("pageswap", (event) => {
    const transition = event.viewTransition;
    const activation = event.activation;
    // The photograph box the card shows at this width (a hub's lead card carries two copies).
    const box = [
      ...(from?.querySelectorAll<HTMLElement>("[data-fo-media-asset]") ?? []),
    ].find((photo) => photo.offsetWidth);
    if (!transition) return;
    if (
      !box ||
      activation?.navigationType !== "push" ||
      activation.entry.url !== from?.href
    ) {
      transition.skipTransition();
      return;
    }
    const style = box.style;
    const prior = style.cssText;
    const width = box.offsetWidth;
    style.viewTransitionName = morphName(box.dataset.foMediaAsset ?? "");
    style.setProperty(
      "--fo-morph-vw",
      `${String(d.documentElement.clientWidth)}px`,
    );
    box.setAttribute("data-fo-morph-from", "");
    style.setProperty("--fo-morph-k", String(width / box.offsetWidth));
    undo = () => {
      style.cssText = prior;
      box.removeAttribute("data-fo-morph-from");
    };
  });

  // The back/forward cache brings the page back as it was left: the card's own box, no opt-in.
  addEventListener("pageshow", () => {
    undo();
    arm(null);
  });
  return arm;
}
