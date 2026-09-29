import { z } from "zod";

const Body = z.object({ name: z.string() });

function read(value: unknown): string {
  return Body.parse(value).name;
}

// GREEN through the one-call follow: `read` is defined above and parses its parameter.
export async function POST(req: Request): Promise<Response> {
  return new Response(read(await req.json()));
}
