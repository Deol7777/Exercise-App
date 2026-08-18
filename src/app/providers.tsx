"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Client server-state (ADR 0014). Server components still render the first
 * paint and hand their data down as `initialData`; this cache is what keeps the
 * screen live after that, so logging a set updates one list instead of
 * refetching the page.
 *
 * The client is created in state, not at module scope: a module-level client
 * would be shared between requests on the server.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /** A workout only changes when this browser changes it. */
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
