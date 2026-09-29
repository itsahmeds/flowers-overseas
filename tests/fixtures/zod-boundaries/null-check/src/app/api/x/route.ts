import { z } from "zod";

const Body = z.object({ name: z.string() });

// GREEN: one `const`, compared with `null`, then parsed.
export async function POST(req: Request): Promise<Response> {
  const b: unknown = await req.json();
  if (b === null) return new Response(null, { status: 400 });
  const result = Body.safeParse(b);
  return new Response(result.success ? result.data.name : null);
}
