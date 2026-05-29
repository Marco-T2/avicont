import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { DocumentoFisicoDetalle } from '@/types/api';

import { useDocumentoFisicoDetalle } from '../hooks/use-documento-fisico-detalle';

interface DocumentoFisicoDetalleDrawerProps {
  documentoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditar: () => void;
  onEliminar: () => void;
}

/**
 * Drawer que muestra el detalle completo de un documento físico.
 * El estado de asociación se DERIVA de comprobantesAsociados (D3).
 * Badges solo con variables del tema (Anti-F-10).
 */
export function DocumentoFisicoDetalleDrawer({
  documentoId,
  open,
  onOpenChange,
  onEditar,
  onEliminar,
}: DocumentoFisicoDetalleDrawerProps): React.JSX.Element {
  const { data: detalle, isLoading, isError } = useDocumentoFisicoDetalle(documentoId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>Detalle del documento</SheetTitle>
        </SheetHeader>

        <div className="px-4 py-2 space-y-4">
          {isLoading ? (
            <SkeletonDetalle />
          ) : isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">
                No se pudo cargar el documento. Intentá de nuevo.
              </p>
            </div>
          ) : detalle !== undefined ? (
            <DetalleBody detalle={detalle} />
          ) : null}
        </div>

        <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          {detalle !== undefined && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onEditar}>
                Editar
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={onEliminar}
              >
                Eliminar
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Subcomponentes internos ─────────────────────────────────────────────────

function SkeletonDetalle(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

/** Deriva el estado de asociación de comprobantesAsociados. */
function derivarEstado(
  comprobantes: DocumentoFisicoDetalle['comprobantesAsociados'],
): 'SUELTO' | 'EN_BORRADOR' | 'CONTABILIZADO' {
  if (comprobantes.length === 0) return 'SUELTO';
  if (comprobantes.some((c) => c.estado === 'CONTABILIZADO')) return 'CONTABILIZADO';
  return 'EN_BORRADOR';
}

function EstadoBadge({
  estado,
}: {
  estado: 'SUELTO' | 'EN_BORRADOR' | 'CONTABILIZADO';
}): React.JSX.Element {
  // Anti-F-10: usar solo variables semánticas del tema.
  if (estado === 'CONTABILIZADO') {
    return (
      <Badge className="bg-primary text-primary-foreground">Contabilizado</Badge>
    );
  }
  if (estado === 'EN_BORRADOR') {
    return (
      <Badge className="bg-secondary text-secondary-foreground">En borrador</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">Suelto</Badge>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
      {children}
    </h3>
  );
}

function DetalleBody({ detalle }: { detalle: DocumentoFisicoDetalle }): React.JSX.Element {
  const estadoAsociacion = derivarEstado(detalle.comprobantesAsociados);

  return (
    <div className="space-y-6">
      {/* Datos del documento */}
      <section>
        <SectionHeader>Datos del documento</SectionHeader>
        <dl className="space-y-2 text-sm">
          <DataRow label="Tipo" value={detalle.tipoDocumentoFisico.nombre} />
          <DataRow label="Número" value={detalle.numero} mono />
          <DataRow label="Fecha emisión" value={formatFecha(detalle.fechaEmision)} />
          {detalle.glosa !== null && detalle.glosa !== '' ? (
            <DataRow label="Glosa" value={detalle.glosa} />
          ) : null}
          <DataRow
            label="Contacto"
            value={detalle.contacto?.razonSocial ?? '—'}
          />
        </dl>
      </section>

      {/* Monto — solo si no es null (§14.1) */}
      {detalle.monto !== null ? (
        <section>
          <SectionHeader>Monto</SectionHeader>
          <p className="text-sm font-medium">
            {detalle.monto} {detalle.moneda}
          </p>
        </section>
      ) : null}

      {/* Estado de asociación */}
      <section>
        <SectionHeader>Estado de asociación</SectionHeader>
        <EstadoBadge estado={estadoAsociacion} />
      </section>

      {/* Comprobantes asociados */}
      <section>
        <SectionHeader>Comprobantes asociados</SectionHeader>
        {detalle.comprobantesAsociados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin comprobantes asociados.</p>
        ) : (
          <ul className="space-y-2">
            {detalle.comprobantesAsociados.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="font-mono text-sm">
                  {c.numero ?? 'Sin número'}
                </span>
                <Badge variant="outline" className="text-xs">
                  {c.estado}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="min-w-[120px] text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono font-medium' : 'font-medium'}>{value}</dd>
    </div>
  );
}

function formatFecha(fecha: string): string {
  const parts = fecha.split('-');
  if (parts.length !== 3) return fecha;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}
