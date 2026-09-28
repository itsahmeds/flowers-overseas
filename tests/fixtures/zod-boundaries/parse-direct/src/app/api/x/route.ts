import { z } from "zod";

const Body = z.object({ name: z.string() });

// GREEN: the body goes straight into the schema.
export async function POST(req: Request): Promise<Response> {
  const body = Body.parse(await req.json());
  return new Response(body.name);
}
