import { z } from "zod";

const Search = z.object({ page: z.string().optional() });

// RED as a PARSERS entry: the only `.parse` is two same-file calls away.
export function request(raw: unknown): string {
  return middle(raw);
}

function middle(raw: unknown): string {
  return inner(raw).page ?? "";
}

function inner(raw: unknown): z.infer<typeof Search> {
  return Search.parse(raw);
}
