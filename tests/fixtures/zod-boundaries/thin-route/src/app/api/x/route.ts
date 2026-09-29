// Thin by design: the read is in `lib/`, and that is where the test must look.
import { handle } from "../../../lib/handler";

export function POST(request: Request): Promise<Response> {
  return handle(request);
}
