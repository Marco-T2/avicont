import { Loader2, Pencil, Power, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { backendErrorMessage } from '@/lib/error-messages';
import { cn } from '@/lib/utils';
import type { Contacto } from '@/types/api';

import { useContactoDetail } from '../hooks/use-contacto-detail';
import { useReactivarContacto } from '../hooks/use-contacto-mutations';

import { ContactoFormSheet } from './contacto-form-sheet';
import { DesactivarContactoDialog } from './desactivar-contacto-dialog';

interface ContactoDetailDrawerProps {
  // null cuando no hay selección — la query queda disabled y no dispara request.
  contactoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Drawer lateral con el detalle de un Contacto + acciones del slice.
// A diferencia del detail drawer de plan-cuentas, las acciones se BIFURCAN
// según `activo`:
//   - activo  → Editar (ContactoFormSheet mode=edit) + Desactivar (AlertDialog).
//   - inactivo → Reactivar, que llama la mutación DIRECTO (sin confirmación):
//     reactivar es idempotente y no destructivo, no requiere un AlertDialog.
// No se expone DELETE (decisión Q1, fuera de scope del slice 1).
export function ContactoDetailDrawer({
  contactoId,
  open,
  onOpenChange,
}: ContactoDetailDrawerProps): React.JSX.Element {
  const { data, isLoading, isError } = useContactoDetail(contactoId);
  const reactivarMutation = useReactivarContacto();
  const [editOpen, setEditOpen] = useState(false);
  const [desactivarOpen, setDesactivarOpen] = useState(false);

  const contacto = data ?? null;

  function handleReactivar(): void {
    if (contacto === null) return;
    reactivarMutation.mutate(contacto.id, {
      onSuccess: () => {
        toast.success(`Contacto "${contacto.razonSocial}" reactivado`);
      },
      onError: (err) => {
        toast.error(
          backendErrorMessage(err, 'No se pudo reactivar el contacto'),
        );
      },
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
        >
          <SheetHeader>
            <SheetTitle>Detalle de contacto</SheetTitle>
            <SheetDescription>
              Información completa del cliente o proveedor.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 py-2 space-y-4">
            {isLoading ? <DetailSkeleton /> : null}
            {isError ? (
              <p className="text-sm text-destructive">
                No se pudo cargar el detalle del contacto.
              </p>
            ) : null}
            {contacto !== null ? <DetailBody contacto={contacto} /> : null}
          </div>

          {/* Footer: Cerrar a la izquierda; acciones a la derecha, bifurcadas
              según el estado del contacto. */}
          <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            {contacto !== null ? (
              <div className="flex gap-2 sm:justify-end">
                {contacto.activo ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setDesactivarOpen(true)}
                      className="flex-1 sm:flex-none text-destructive hover:text-destructive"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Desactivar
                    </Button>
                    <Button
                      onClick={() => setEditOpen(true)}
                      className="flex-1 sm:flex-none"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleReactivar}
                    disabled={reactivarMutation.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    {reactivarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Reactivar
                  </Button>
                )}
              </div>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sub-drawer/dialog — se montan fuera del Sheet principal para no
          encadenar overlays de Radix. Comparten el `contacto` del query.
          Solo se montan cuando el contacto está activo, que es el único estado
          desde el que se puede editar o desactivar. */}
      {contacto !== null && contacto.activo ? (
        <>
          <ContactoFormSheet
            mode="edit"
            initialData={contacto}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <DesactivarContactoDialog
            contacto={contacto}
            open={desactivarOpen}
            onOpenChange={setDesactivarOpen}
          />
        </>
      ) : null}
    </>
  );
}

function DetailSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface DetailBodyProps {
  contacto: Contacto;
}

function DetailBody({ contacto }: DetailBodyProps): React.JSX.Element {
  const rol = rolLabel(contacto);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">{rol}</Badge>
        {contacto.activo ? (
          <Badge variant="outline">Activo</Badge>
        ) : (
          <span className="text-xs text-muted-foreground italic">Inactivo</span>
        )}
      </div>

      <h3 className="text-lg font-semibold">{contacto.razonSocial}</h3>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field
          label="Nombre comercial"
          value={contacto.nombreComercial ?? '—'}
          span2
        />
        <Field label="Documento" value={contacto.documento ?? '—'} mono />
        <Field label="Email" value={contacto.email ?? '—'} />
        <Field label="Teléfono" value={contacto.telefono ?? '—'} />
        <Field label="Dirección" value={contacto.direccion ?? '—'} span2 />
      </dl>
    </>
  );
}

function rolLabel(contacto: Contacto): string {
  if (contacto.esCliente && contacto.esProveedor) return 'Cliente y proveedor';
  if (contacto.esCliente) return 'Cliente';
  if (contacto.esProveedor) return 'Proveedor';
  return 'Sin rol';
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  span2?: boolean;
}

function Field({ label, value, mono, span2 }: FieldProps): React.JSX.Element {
  return (
    <div className={cn(span2 === true && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words', mono === true && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
