/**
 * `ActorSchema` (spec 010 §2 "Actors", §5.2; §14 A1.5; TASK-202).
 *
 * `buyer`, `partner:{uuid}`, `admin:{uuid}` or `system:{name}`, where a system name uses
 * lowercase letters, `_` and `.` only: **no hyphen**, so `system:demo-guard` is refused and the
 * catalogue's `system:demo_guard` is the only spelling. `transition` and `appendEvent` parse the
 * actor before any read or write (A1.5's rejection order starts here).
 */
import { z } from "zod";

/** §5.2's regex, verbatim. */
export const ACTOR_PATTERN =
  /^(buyer|partner:[0-9a-f-]{36}|admin:[0-9a-f-]{36}|system:[a-z_.]+)$/;

export const ActorSchema = z.string().regex(ACTOR_PATTERN).brand<"Actor">();

export type Actor = z.infer<typeof ActorSchema>;

/** The four classes `order_transition.allowed_actors` holds (spec 002 §14 A6.2). */
export const ACTOR_CLASSES = ["buyer", "partner", "admin", "system"] as const;

export type ActorClass = (typeof ACTOR_CLASSES)[number];

/** This spec's system actors (§2). */
export const DEMO_GUARD_ACTOR = ActorSchema.parse("system:demo_guard");
export const DEMO_ROUTER_ACTOR = ActorSchema.parse("system:demo_router");
export const BUYER_ACTOR = ActorSchema.parse("buyer");

/**
 * The class A1.5 compares with `allowed_actors`: the part before `:`, and the whole value for
 * `buyer`. Never the whole string (that would refuse every legal case).
 */
export function actorClass(actor: Actor): ActorClass {
  const head = actor.split(":", 1)[0];
  const found = ACTOR_CLASSES.find((candidate) => candidate === head);
  // ActorSchema admits only the four heads, so this cannot be reached with a parsed actor.
  if (found === undefined) throw new TypeError("unparsed actor");
  return found;
}
