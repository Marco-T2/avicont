import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { BootstrapGate } from '@/components/bootstrap-gate';
import { Toaster } from '@/components/ui/sonner';
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
  return (
    <QueryClientProvider client={queryClient}>
      <BootstrapGate>
        <RouterProvider router={router} />
      </BootstrapGate>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

export default App;
