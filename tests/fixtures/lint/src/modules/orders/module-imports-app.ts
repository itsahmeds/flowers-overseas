// Invalid fixture: modules/ importing app/ (spec 001 AC-9; plan/01 §5 "app/ imports from
// modules/, never the reverse").
import { x } from "@/app/page";

export const y = x;
