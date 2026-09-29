import type { NextRequest } from "next/server";

// RED: the query string read off a URL, four ways, with no schema between.
export function fromNextUrl(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("a");
}

export function fromUrlBinding(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("b");
}

export function fromNewUrlDestructured(request: Request): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get("q");
}

export function fromNextUrlDestructured(request: NextRequest): string | null {
  const { searchParams } = request.nextUrl;
  return searchParams.get("q");
}
