import { Link2, MoreHorizontal, Pencil, Power } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Cuenta } from '@/types/api';

import { useCuentaDetail } from '../hooks/use-cuenta-detail';

import { ClaseBadge } from './clase-badge';
import { CuentaFormSheet } from './cuenta-form-sheet';
import { DeactivateCuentaDialog } from './deactivate-cuenta-dialog';
import { MapearPuctDialog } from './mapear-puct-dialog';

interface CuentaDetailDrawerProps {
  cuentaId: string | null;
  onClose: () => void;
}

// Drawer lateral con los detalles de una Cuenta + acciones CRUD del slice
// Plan de cuentas: Editar (otro Sheet con CuentaForm), Mapear PUCT (Dialog
// con input) y Desactivar (AlertDialog de confirmación).
// Las cuentas esRequeridaSistema ocultan el botón Desactivar — el backend
// las protege con el error CUENTA_REQUERIDA_SISTEMA_INMUTABLE, pero la UI
// lo previene explícitamente para no invitar el intento.
export function CuentaDetailDrawer({
  cuentaId,
  onClose,
}: CuentaDetailDrawerProps): React.JSX.Element {
  const { data, isLoading, isError } = useCuentaDetail(cuentaId);
  const [editOpen, setEditOpen] = useState(false);
  const [mapearOpen, setMapearOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const cuenta = data ?? null;
  const puedeDesactivar =
    cuenta !== null && cuenta.activa && !cuenta.esRequeridaSistema;

  return (
    <>
      <Sheet
        open={cuentaId !== null}
        onOpenChange={(open) => !open && onClose()}
      >
        <SheetContent
          side="right"
          // max-w-xl (576px) + overflow-x-hidden: los 4 botones del footer
          // (Cerrar, Cambiar PUCT, Editar, Desactivar) no entran en 512px,
          // y max-w-xl les da margen sin invadir mobile.
          className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
        >
          <SheetHeader>
            <SheetTitle>Detalle de cuenta</SheetTitle>
            <SheetDescription>
              Información completa según el PUCT y la configuración del tenant.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 py-2 space-y-4">
            {isLoading ? <DetailSkeleton /> : null}
            {isError ? (
              <p className="text-sm text-destructive">
                No se pudo cargar el detalle de la cuenta.
              </p>
            ) : null}
            {cuenta !== null ? <DetailBody cuenta={cuenta} /> : null}
          </div>

          {/* Footer: patrón estándar de admin apps — primary CTA "Editar" +
              "Más acciones" en dropdown. Así entran limpio incluso en 576px.
              Cerrar queda a la izquierda separado del grupo de acciones. */}
          <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            {cuenta !== null ? (
              <div className="flex gap-2 sm:justify-end">
                {cuenta.activa ? (
                  <Button onClick={() => setEditOpen(true)} className="flex-1 sm:flex-none">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      aria-label="Más acciones"
                      className="sm:flex-none"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="ml-2 sm:hidden">Más</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => setMapearOpen(true)}
                      disabled={cuenta.esRequeridaSistema}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      {cuenta.codigoPuct !== null ? 'Cambiar PUCT' : 'Mapear PUCT'}
                    </DropdownMenuItem>
                    {puedeDesactivar ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeactivateOpen(true)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Power className="h-4 w-4 mr-2" />
                          Desactivar
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sub-drawers/dialogs — se montan fuera del Sheet principal para no
          encadenar overlays de Radix. Comparten el mismo `cuenta` del query. */}
      {cuenta !== null ? (
        <>
          <CuentaFormSheet
            mode="edit"
            initialData={cuenta}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <MapearPuctDialog
            cuenta={cuenta}
            open={mapearOpen}
            onOpenChange={setMapearOpen}
          />
          <DeactivateCuentaDialog
            cuenta={cuenta}
            open={deactivateOpen}
            onOpenChange={setDeactivateOpen}
          />
        </>
      ) : null}
    </>
  );
}

function DetailSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface DetailBodyProps {
  cuenta: Cuenta;
}

function DetailBody({ cuenta }: DetailBodyProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">
          {cuenta.codigoInterno}
        </span>
        <ClaseBadge clase={cuenta.claseCuenta} />
        {!cuenta.activa ? (
          <span className="text-xs text-muted-foreground italic">Inactiva</span>
        ) : null}
      </div>

      <h3 className="text-lg font-semibold">{cuenta.nombre}</h3>
      {cuenta.descripcion !== null ? (
        <p className="text-sm text-muted-foreground">{cuenta.descripcion}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="Nivel" value={String(cuenta.nivel)} />
        <Field
          label="Tipo"
          value={cuenta.esDetalle ? 'Detalle (hoja)' : 'Agrupador'}
        />
        <Field label="Subclase" value={cuenta.subClaseCuenta ?? '—'} />
        <Field label="Naturaleza" value={cuenta.naturaleza} />
        <Field label="Moneda funcional" value={cuenta.monedaFuncional} />
        <Field
          label="Multi-moneda"
          value={cuenta.permiteMultiMoneda ? 'Permite' : 'No permite'}
        />
        <Field
          label="Requiere contacto"
          value={cuenta.requiereContacto ? 'Sí' : 'No'}
        />
        <Field
          label="Contraria"
          value={cuenta.esContraria ? 'Sí' : 'No'}
        />
      </dl>

      <div className="border-t pt-3 space-y-3 text-sm">
        <div className="font-medium">PUCT</div>
        {cuenta.codigoPuct !== null ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Código" value={cuenta.codigoPuct} mono />
            <Field label="Versión" value={cuenta.versionPuctMapeado ?? '—'} />
            <Field
              label="Nombre snapshot"
              value={cuenta.nombrePuctSnapshot ?? '—'}
              span2
            />
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Esta cuenta no está mapeada al catálogo PUCT.
          </p>
        )}
      </div>

      {cuenta.esRequeridaSistema || cuenta.esSystemSeed ? (
        <div className="border-t pt-3 space-y-1 text-xs text-muted-foreground">
          {cuenta.esRequeridaSistema ? (
            <p>⚠ Cuenta requerida por el sistema — no se puede desactivar.</p>
          ) : null}
          {cuenta.esSystemSeed ? <p>Creada por el seed inicial.</p> : null}
        </div>
      ) : null}
    </>
  );
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
      <dd className={cn('mt-0.5', mono === true && 'font-mono')}>{value}</dd>
    </div>
  );
}
