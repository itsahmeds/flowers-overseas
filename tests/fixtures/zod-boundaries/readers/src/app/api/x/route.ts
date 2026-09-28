import { z } from "zod";

import { readAll } from "../../../lib/read";

const Body = z.object({ name: z.string() });

// GREEN with the READERS entry: the reader's result, through `JSON.parse`, into the schema.
export async function POST(req: Request): Promise<Response> {
  const raw = await readAll(req);
  if (raw === null) return new Response(null, { status: 413 });
  const body = Body.parse(JSON.parse(raw));
  return new Response(body.name);
}
