import type { ReactNode } from "react";
import "./globals.css";

/**
 * Root shell. `lang="en"` is the one locale literal in the repo; spec 003 replaces it with the URL locale
 * (spec 001 §7). Metadata, noindex, not-found and error shells arrive with TASK-006.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
