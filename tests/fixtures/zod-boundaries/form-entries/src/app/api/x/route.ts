import { z } from "zod";

const Form = z.object({ email: z.string() });

// GREEN: a form post, through `Object.fromEntries`, into the schema.
export async function POST(req: Request): Promise<Response> {
  const form = Form.parse(Object.fromEntries(await req.formData()));
  return new Response(form.email.length > 0 ? null : "", { status: 204 });
}
