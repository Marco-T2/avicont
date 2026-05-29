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
import type { DocumentoFisico } from '@/types/api';

interface DocumentoFisicoListTableProps {
  items: DocumentoFisico[];
  isLoading: boolean;
  onVerDetalle: (doc: DocumentoFisico) => void;
  onEditar: (doc: DocumentoFisico) => void;
  onEliminar: (doc: DocumentoFisico) => void;
}

/** Formatea YYYY-MM-DD → DD/MM/YYYY para presentación boliviana. */
function formatFecha(fecha: string): string {
  const parts = fecha.split('-');
  if (parts.length !== 3) return fecha;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export function DocumentoFisicoListTable({
  items,
  isLoading,
  onVerDetalle,
  onEditar,
  onEliminar,
}: DocumentoFisicoListTableProps): React.JSX.Element {
  // Estado loading: skeleton FUERA del TableBody (Anti-no-anidar-tr).
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
          No hay documentos físicos para los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Fecha emisión</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-xs">
                  {doc.numero}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{doc.tipoDocumentoFisico.nombre}</TableCell>
              <TableCell className="text-sm">{formatFecha(doc.fechaEmision)}</TableCell>
              <TableCell className="text-sm">
                {doc.monto !== null && doc.moneda !== null ? (
                  <span>
                    {doc.monto} {doc.moneda}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {doc.contacto !== null ? (
                  doc.contacto.razonSocial
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onVerDetalle(doc)}
                  >
                    Ver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditar(doc)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onEliminar(doc)}
                  >
                    Eliminar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
