import { Check, Minus } from 'lucide-react';

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
import type { Cuenta } from '@/types/api';

import { ClaseBadge } from './clase-badge';

interface CuentaListTableProps {
  cuentas: Cuenta[];
  loading?: boolean;
  onSelect: (cuenta: Cuenta) => void;
}

// Tabla con scroll horizontal en mobile (CLAUDE.md §7). La primera columna
// (codigoInterno) queda sticky para que el scroll-x sea útil.
export function CuentaListTable({
  cuentas,
  loading = false,
  onSelect,
}: CuentaListTableProps): React.JSX.Element {
  if (loading && cuentas.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (cuentas.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No se encontraron cuentas con los filtros actuales.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background w-32">Código</TableHead>
            <TableHead className="min-w-[220px]">Nombre</TableHead>
            <TableHead>PUCT</TableHead>
            <TableHead>Clase</TableHead>
            <TableHead>Nivel</TableHead>
            <TableHead className="text-center">Detalle</TableHead>
            <TableHead className="text-center">Activa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cuentas.map((c) => (
            <TableRow
              key={c.id}
              onClick={() => onSelect(c)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="sticky left-0 z-10 bg-background font-mono text-xs">
                {c.codigoInterno}
              </TableCell>
              <TableCell className="font-medium">{c.nombre}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {c.codigoPuct ?? '—'}
              </TableCell>
              <TableCell>
                <ClaseBadge clase={c.claseCuenta} />
              </TableCell>
              <TableCell>{c.nivel}</TableCell>
              <TableCell className="text-center">
                {c.esDetalle ? (
                  <Check className="mx-auto h-4 w-4 text-muted-foreground" />
                ) : (
                  <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                )}
              </TableCell>
              <TableCell className="text-center">
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    c.activa ? 'bg-green-500' : 'bg-muted-foreground/40',
                  )}
                  aria-label={c.activa ? 'Activa' : 'Inactiva'}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
