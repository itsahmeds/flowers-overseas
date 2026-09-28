// A body bound once, then handed to a function in another file. RED (`use(b)`
// is neither a schema nor a same-file function) — unless `src/lib/check.ts#use` is in PARSERS.
import { use } from "../../../lib/check";

export async function POST(req: Request): Promise<Response> {
  const b: unknown = await req.json();
  use(b);
  return new Response(null, { status: 204 });
}
