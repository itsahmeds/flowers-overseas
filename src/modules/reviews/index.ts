/** Public barrel for `reviews` (review invitations, the review form's commands, moderation, the florist rating). Owned by: spec 022a. */

/**
 * Spec 022a §2, §5.2 (TASK-368): the module starts with the `review.created` payload schema;
 * the invitation (TASK-370), the form's commands (TASK-371) and moderation and the rating
 * (TASK-372) join it. Importing this barrel registers `ReviewCreatedV1` in spec 010's registry.
 */
export { ReviewCreatedV1 } from "./events";
