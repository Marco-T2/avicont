import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { CuentaBancaria } from '@/types/api';

import { PERFIL_EXTRACTO_OPTIONS } from '../lib/perfil-extracto-options';

const PERFIL_LABEL: Record<string, string> = Object.fromEntries(
  PERFIL_EXTRACTO_OPTIONS.map(({ value, label }) => [value, label]),
);

interface CuentasBancariasListTableProps {
  items: CuentaBancaria[];
  isLoading: boolean;
  onEditar: (cb: CuentaBancaria) => void;
  onEliminar: (cb: CuentaBancaria) => void;
}

export function CuentasBancariasListTable({
  items,
  isLoading,
  onEditar,
  onEliminar,
}: CuentasBancariasListTableProps): React.JSX.Element {
  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">No hay cuentas bancarias configuradas.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Alias</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Número de cuenta</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((cb) => (
            <TableRow key={cb.id}>
              <TableCell className="font-medium">{cb.alias}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {PERFIL_LABEL[cb.perfilExtracto] ?? cb.perfilExtracto}
                </Badge>
              </TableCell>
              <TableCell>
                {cb.numeroCuenta !== null ? (
                  <span className="font-mono text-xs">{cb.numeroCuenta}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Se captura en la primera importación
                  </span>
                )}
              </TableCell>
              <TableCell>{cb.moneda}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    cb.activa ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      cb.activa ? 'bg-green-500' : 'bg-muted-foreground/40',
                    )}
                    aria-hidden="true"
                  />
                  {cb.activa ? 'Activa' : 'Inactiva'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <PermissionButton
                    permission={PERMISSIONS.contabilidad.conciliacion.update}
                    deniedReason="No tenés permiso para modificar cuentas bancarias"
                    variant="outline"
                    size="sm"
                    onClick={() => onEditar(cb)}
                  >
                    Editar
                  </PermissionButton>
                  <PermissionButton
                    permission={PERMISSIONS.contabilidad.conciliacion.delete}
                    deniedReason="No tenés permiso para eliminar cuentas bancarias"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onEliminar(cb)}
                  >
                    Eliminar
                  </PermissionButton>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
