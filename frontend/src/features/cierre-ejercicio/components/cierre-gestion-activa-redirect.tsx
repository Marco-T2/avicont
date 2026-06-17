import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Cross-feature: lista de gestiones fiscales para derivar la gestión activa más reciente.
// Misma lógica que periodos-fiscales-page.tsx:25-30 (year desc).
import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';

/**
 * Componente redirector: resuelve la gestión activa más reciente y navega a
 * `/gestiones/:id/cierre`. Si no hay gestiones, redirige a `/periodos-fiscales`.
 *
 * Montado en la ruta estática `/gestiones/cierre` para que el ítem del sidebar
 * tenga un `to` fijo (los nav items son constantes estáticas, no pueden derivar IDs).
 */
export function CierreGestionActivaRedirect(): React.JSX.Element {
  const navigate = useNavigate();

  // Cross-feature: gestiones fiscales para derivar la más reciente.
  // Misma query que PeriodosFiscalesPage (queryKey compartido, cero requests extra).
  const { data: gestiones, isLoading } = useGestiones();

  useEffect(() => {
    if (isLoading) return;

    if (gestiones === undefined || gestiones.length === 0) {
      void navigate('/periodos-fiscales', { replace: true });
      return;
    }

    // Misma lógica que periodos-fiscales-page.tsx:25-30: gestión más reciente (year desc).
    const gestion = [...gestiones].sort((a, b) => b.year - a.year)[0];
    if (gestion !== undefined) {
      void navigate(`/gestiones/${gestion.id}/cierre`, { replace: true });
    } else {
      void navigate('/periodos-fiscales', { replace: true });
    }
  }, [isLoading, gestiones, navigate]);

  // Mientras carga: fragmento vacío (no bloquear el render)
  return <></>;
}
