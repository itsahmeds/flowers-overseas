// RED: the body reaches `String()`, not a schema.
export async function handle(request: Request): Promise<Response> {
  const data: unknown = await request.json();
  return new Response(String(data));
}
