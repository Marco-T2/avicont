import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { OrgStatus, PlatformOrg } from '@/types/api';

import { useUpdateOrgStatus } from '../hooks/use-update-org-status';

interface OrgStatusDialogProps {
  org: PlatformOrg | null;
  targetStatus: OrgStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StatusCopy {
  titulo: string;
  descripcion: (nombre: string) => string;
  accion: string;
  gerundio: string;
  // SUSPENDED/ARCHIVED son reversibles (se puede reactivar) → sin botón rojo (§14.3).
  destructivo: boolean;
}

const STATUS_COPY: Record<OrgStatus, StatusCopy> = {
  SUSPENDED: {
    titulo: '¿Suspender esta organización?',
    descripcion: (nombre) =>
      `«${nombre}» quedará suspendida: sus miembros no podrán operar hasta que la reactives.`,
    accion: 'Suspender',
    gerundio: 'Suspendiendo…',
    destructivo: false,
  },
  ARCHIVED: {
    titulo: '¿Archivar esta organización?',
    descripcion: (nombre) =>
      `«${nombre}» quedará archivada y sus miembros perderán el acceso. Podés reactivarla más adelante.`,
    accion: 'Archivar',
    gerundio: 'Archivando…',
    destructivo: false,
  },
  ACTIVE: {
    titulo: '¿Reactivar esta organización?',
    descripcion: (nombre) =>
      `«${nombre}» volverá a estar activa y sus miembros podrán operar normalmente.`,
    accion: 'Reactivar',
    gerundio: 'Reactivando…',
    destructivo: false,
  },
};

/**
 * Confirmación de cambio de status de una org (super-admin, PR-3). AlertDialog
 * con copy según el status destino (suspender / archivar / reactivar). El botón
 * de acción usa preventDefault para controlar el cierre manual desde onSuccess
 * (patrón §14.3). Los toasts los emite useUpdateOrgStatus (Anti-F-13).
 */
export function OrgStatusDialog({
  org,
  targetStatus,
  open,
  onOpenChange,
}: OrgStatusDialogProps): React.JSX.Element {
  const mutation = useUpdateOrgStatus();
  const copy = STATUS_COPY[targetStatus];

  function handleConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    if (org === null) return;
    mutation.mutate(
      { id: org.id, status: targetStatus },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.titulo}</AlertDialogTitle>
          <AlertDialogDescription>
            {copy.descripcion(org?.name ?? '')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className={cn(
              copy.destructivo &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {copy.gerundio}
              </>
            ) : (
              copy.accion
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
