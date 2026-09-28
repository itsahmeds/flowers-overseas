import { z } from "zod";

const Body = z.object({ name: z.string() });

export function use(value: unknown): string {
  return Body.parse(value).name;
}
