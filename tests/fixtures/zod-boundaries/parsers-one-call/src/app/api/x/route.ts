import { request } from "../../../lib/params";

// GREEN: `src/lib/params.ts#request` is in PARSERS.
export async function POST(req: Request): Promise<Response> {
  return new Response(request(await req.json()));
}
