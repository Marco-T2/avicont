import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TipoComprobante, TipoDocumentoFisico } from '@/types/api';

import { TIPO_COMPROBANTE_OPTIONS } from '../lib/build-tipos-documento-fisico-params';

interface TiposDocumentoFisicoListTableProps {
  items: TipoDocumentoFisico[];
  isLoading: boolean;
  onEditar: (tipo: TipoDocumentoFisico) => void;
  onDesactivar: (tipo: TipoDocumentoFisico) => void;
  onActivar: (id: string) => void;
  // Id del tipo cuyo toggle está en curso; deshabilita ese botón (Anti-F-07, REQ-TDF-04.3).
  togglePendingId?: string | null;
}

// Mapa value → label para los badges de la columna Tipos.
const TIPO_LABEL: Record<TipoComprobante, string> = Object.fromEntries(
  TIPO_COMPROBANTE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<TipoComprobante, string>;

export function TiposDocumentoFisicoListTable({
  items,
  isLoading,
  onEditar,
  onDesactivar,
  onActivar,
  togglePendingId,
}: TiposDocumentoFisicoListTableProps): React.JSX.Element {
  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay tipos de documento para los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Nombre</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Tributario</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="min-w-[200px]">Tipos de comprobante</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tipo) => (
            <TableRow key={tipo.id}>
              <TableCell className="font-medium">{tipo.nombre}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-xs">
                  {tipo.codigo}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'text-sm',
                    tipo.esTributario
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {tipo.esTributario ? 'Sí' : 'No'}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    tipo.activo ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      tipo.activo ? 'bg-green-500' : 'bg-muted-foreground/40',
                    )}
                    aria-hidden="true"
                  />
                  {tipo.activo ? 'Activo' : 'Inactivo'}
                </span>
              </TableCell>
              <TableCell>
                <TiposBadges tipos={tipo.tiposComprobanteAplicables} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditar(tipo)}
                  >
                    Editar
                  </Button>
                  {tipo.activo ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={togglePendingId === tipo.id}
                      onClick={() => onDesactivar(tipo)}
                    >
                      Desactivar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={togglePendingId === tipo.id}
                      onClick={() => onActivar(tipo.id)}
                    >
                      Activar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface TiposBadgesProps {
  tipos: TipoComprobante[];
}

function TiposBadges({ tipos }: TiposBadgesProps): React.JSX.Element {
  if (tipos.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tipos.map((t) => (
        <Badge key={t} variant="secondary" className="text-xs">
          {TIPO_LABEL[t] ?? t}
        </Badge>
      ))}
    </span>
  );
}
