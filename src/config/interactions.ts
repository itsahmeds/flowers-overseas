/**
 * @purpose Spec 042's build-time switches, one per idea
 * @spec 042
 *
 * The premium interactions' kill switches (spec 042 §5.2, §12).
 *
 * One typed boolean per idea, read at build time by the component that draws it. There is no
 * runtime flag and no database read on the render path: spec 012's flags are for corridor, locale
 * and payment rollout, and a cached page that read one would depend on the database (spec 042 §12,
 * `manifest.ts`'s rule). Turning an idea off is a one-line PR that sets its value to `false`;
 * rolling it back for good is a revert of the idea's PR.
 *
 * Each idea's PR adds its own key (`morph`, `cardPreviewMotion`, `secondPhoto`, `softLoading`,
 * `galleryDots`, `routeLine`, and the `secondPhotoExcluded` list of §5.3.3), so no key is here
 * before the code that reads it.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */

export interface Interactions {
  /**
   * Idea 2 (§5.3.2, AC-10; TASK-308): the card preview's 200 ms crossfade from the sample to the
   * buyer's first words (`PrintedCardPreview`). Off, the swap is instant; the one shared preview,
   * its Caveat lines and its mirroring stay.
   */
  readonly cardPreviewMotion: boolean;
  /**
   * Idea 6 (§5.3.6, AC-19): the dashed route from an unlabelled "you" dot to the destination,
   * drawn once beside the corridor page's H1 from `md` up (`CorridorRouteLine`).
   */
  readonly routeLine: boolean;
}

export const interactions: Interactions = {
  cardPreviewMotion: true,
  routeLine: true,
};
