import { z } from "zod";

const Search = z.object({ page: z.string().optional() });

export function inner(raw: unknown): z.infer<typeof Search> {
  return Search.parse(raw);
}
