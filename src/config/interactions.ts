/**
 * The premium interactions' build-time switches (spec 042 §5.2, §12; the kill switch).
 *
 * One plain boolean per idea, read at build time by the component or module that draws it: no
 * runtime flag, no database read on the render path (spec 042 §12; spec 012's flags are for
 * corridor, locale and payment rollout and live in the database). Turning an idea off is a
 * one-line PR. Each idea's task adds its own key when it lands; a key that nothing reads is not
 * added ahead of its task.
 *
 *  - `morph` (idea 1, motion 14; TASK-307): the product card's photograph carries the buyer into
 *    the product page from `lg` up (spec 042 §5.3.1, AC-7 to AC-9). Off, the product page emits no
 *    opt-in and the motion module arms nothing, so every card link navigates as it did before.
 */
export const INTERACTIONS = {
  morph: true,
} as const satisfies Readonly<Record<string, boolean>>;
