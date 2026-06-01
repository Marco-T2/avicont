import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { mensajePeriodosFiscales } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';

import { useCerrarGestion } from '../hooks/use-cerrar-gestion';
import { useGestionDetalle } from '../hooks/use-gestion-detalle';

interface CerrarGestionButtonProps {
  gestionId: string | null;
}

// Botón de cierre de gestión. Se renderiza solo cuando los 12 períodos
// están CERRADO. Si hay algún período ABIERTO, el botón no se muestra
// (el backend igual rechazaría con GESTION_CON_PERIODOS_ABIERTOS).
export function CerrarGestionButton({
  gestionId,
}: CerrarGestionButtonProps): React.JSX.Element | null {
  const mutation = useCerrarGestion();
  const { data: gestion, isLoading } = useGestionDetalle(gestionId ?? undefined);

  if (gestionId === null) return null;
  if (isLoading || gestion === undefined) return null;

  // Mostrar el botón solo si todos los períodos están CERRADO.
  const todos12Cerrados =
    gestion.periodos.length === 12 &&
    gestion.periodos.every((p) => p.status === 'CERRADO');

  if (!todos12Cerrados) return null;

  function handleCerrar(): void {
    mutation.mutate(gestionId!, {
      onSuccess: () => {
        toast.success(`Gestión ${gestion?.year ?? ''} cerrada correctamente`);
      },
      onError: (err) => {
        toast.error(mensajePeriodosFiscales(err));
      },
    });
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.gestiones.cerrar}
      deniedReason="No tenés permiso para cerrar gestiones"
      variant="outline"
      disabled={mutation.isPending}
      onClick={handleCerrar}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cerrando gestión…
        </>
      ) : (
        'Cerrar gestión'
      )}
    </PermissionButton>
  );
}
