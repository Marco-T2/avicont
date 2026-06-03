import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { BootstrapGate } from '@/components/bootstrap-gate';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthBroadcastSync } from '@/lib/use-auth-broadcast-sync';
import { router } from '@/routes/router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function App(): React.JSX.Element {
  // Sincroniza el logout entre pestañas del mismo navegador (§10.10).
  useAuthBroadcastSync();

  return (
    <QueryClientProvider client={queryClient}>
      {/* delayDuration=200ms: tooltips aparecen rápido pero no agresivamente.
          skipDelayDuration=0: al mover entre items con tooltip, el segundo
          aparece instantáneo (UX de admin app). */}
      <TooltipProvider delayDuration={200} skipDelayDuration={0}>
        <BootstrapGate>
          <RouterProvider router={router} />
        </BootstrapGate>
        {/* top-center unificado — en mobile (375px) el top-right se corta;
            top-center queda legible en ambos viewports sin media queries. */}
        <Toaster richColors position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
