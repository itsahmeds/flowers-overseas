/**
 * The florist templates V1 to V5, plugged into the pipeline's template registry (spec 016 §5.2;
 * `../templates.ts`; TASK-332).
 *
 * Each renderer reads the assignment's facts at send time through the delivery's transaction, in
 * the member's language (`input.locale`, `partner_member.locale_code`), and renders with the
 * member's one-tap link (`input.link`, minted by the pipeline; null for V4, which carries none).
 * V4 on `assignment.timed_out` is the timed-out state of the template; every other V4 trigger is
 * a withdrawal. Registration is idempotent, so a process (or a test) may call it more than once.
 */
import {
  type NotificationRenderInput,
  notificationTemplate,
  registerNotificationTemplate,
  type RenderedNotification,
} from "../templates";

import { FloristFactsMissing, loadFloristMessageFacts } from "./facts";
import {
  FLORIST_TEMPLATES,
  type FloristTemplate,
  floristLanguageOf,
  renderFloristEmail,
} from "./florist";

/** Renders one florist template for one member. */
export async function renderFloristNotification(
  template: FloristTemplate,
  input: NotificationRenderInput,
): Promise<RenderedNotification> {
  if (input.assignmentId === null) {
    throw new FloristFactsMissing(`${template} has no assignment`);
  }
  const language = floristLanguageOf(input.locale);
  const facts = await loadFloristMessageFacts(
    input.executor,
    input.assignmentId,
    language,
  );
  return renderFloristEmail(template, facts, {
    language,
    link: input.link,
    timedOut: input.trigger === "assignment.timed_out",
  });
}

/** Registers V1 to V5 with the pipeline, once. */
export function registerFloristEmailTemplates(): void {
  for (const template of FLORIST_TEMPLATES) {
    if (notificationTemplate(template) !== undefined) continue;
    registerNotificationTemplate(template, (input) =>
      renderFloristNotification(template, input),
    );
  }
}
