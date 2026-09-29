import { z } from "zod";

const Search = z.object({ page: z.string().optional() });

// The shape of `listingRequest` → `parseSearch` → `.parse`: one same-file call away. GREEN.
export function request(raw: unknown): string {
  return parse(raw).page ?? "";
}

function parse(raw: unknown): z.infer<typeof Search> {
  return Search.parse(raw);
}
