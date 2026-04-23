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
import { cn } from '@/lib/utils';
import type { Cuenta } from '@/types/api';

import { useCuentaDetail } from '../hooks/use-cuenta-detail';

import { ClaseBadge } from './clase-badge';

interface CuentaDetailDrawerProps {
  cuentaId: string | null;
  onClose: () => void;
}

// Drawer lateral con los detalles de una Cuenta. Se abre cuando `cuentaId`
// es distinto de null; al cerrarse, el caller setea cuentaId=null.
// El footer está preparado para los botones Editar/Desactivar del slice
// CRUD — hoy solo "Cerrar".
export function CuentaDetailDrawer({
  cuentaId,
  onClose,
}: CuentaDetailDrawerProps): React.JSX.Element {
  const { data, isLoading, isError } = useCuentaDetail(cuentaId);

  return (
    <Sheet open={cuentaId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
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
          {data !== undefined ? <DetailBody cuenta={data} /> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {/* TODO(slice CRUD):
              <Button>Editar</Button>
              <Button variant="destructive">Desactivar</Button>
              <Button variant="outline">Mapear PUCT</Button>
          */}
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
