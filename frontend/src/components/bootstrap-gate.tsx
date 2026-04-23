import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

import { bootstrapAuth } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

interface BootstrapGateProps {
  children: React.ReactNode;
}

// Wrapper que corre el refresh automático al arranque (repone accessToken
// si hay cookie válida) y aplica el tema guardado ANTES de renderizar el
// resto del árbol. Evita flash de ruta incorrecta.
export function BootstrapGate({ children }: BootstrapGateProps): React.JSX.Element {
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const applyTheme = useThemeStore((s) => s.applyTheme);

  useEffect(() => {
    applyTheme();
    void bootstrapAuth();
  }, [applyTheme]);

  if (bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
