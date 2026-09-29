// The audit's plant (standards audit row 6): a body cast to a type, never parsed. RED.
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { name: string };
  return new Response(body.name);
}
