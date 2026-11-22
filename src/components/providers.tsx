"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NewBatchDraftProvider } from "@/components/batches/draft-provider";
import { ReferenceUploadsProvider } from "@/components/videos/upload-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {/* Las subidas de vídeo siguen aunque se cambie de pantalla dentro de la aplicación. */}
        <ReferenceUploadsProvider>
          {/* El borrador de «Nuevo lote» (con sus archivos) tampoco se pierde al cambiar de pantalla. */}
          <NewBatchDraftProvider>{children}</NewBatchDraftProvider>
        </ReferenceUploadsProvider>
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
