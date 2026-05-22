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
import { cn } from '@/lib/utils';
import type { Contacto } from '@/types/api';

interface ContactoListTableProps {
  contactos: Contacto[];
  isLoading: boolean;
  onSelect: (contacto: Contacto) => void;
}

// Tabla con scroll horizontal en mobile (CLAUDE.md frontend §7). La primera columna
// (razonSocial) queda sticky para que el scroll-x sea útil.
export function ContactoListTable({
  contactos,
  isLoading,
  onSelect,
}: ContactoListTableProps): React.JSX.Element {
  if (isLoading && contactos.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && contactos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">No hay contactos registrados.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[180px]">
              Razón social
            </TableHead>
            <TableHead className="min-w-[160px]">Nombre comercial</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contactos.map((contacto) => (
            <TableRow
              key={contacto.id}
              onClick={() => onSelect(contacto)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="sticky left-0 z-10 bg-background font-medium">
                {contacto.razonSocial}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {contacto.nombreComercial ?? '—'}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {contacto.documento ?? '—'}
              </TableCell>
              <TableCell>
                <RolBadges esCliente={contacto.esCliente} esProveedor={contacto.esProveedor} />
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    contacto.activo ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      contacto.activo ? 'bg-green-500' : 'bg-muted-foreground/40',
                    )}
                    aria-hidden="true"
                  />
                  {contacto.activo ? 'Activo' : 'Inactivo'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface RolBadgesProps {
  esCliente: boolean;
  esProveedor: boolean;
}

function RolBadges({ esCliente, esProveedor }: RolBadgesProps): React.JSX.Element {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {esCliente && (
        <Badge variant="secondary" className="text-xs">
          Cliente
        </Badge>
      )}
      {esProveedor && (
        <Badge variant="outline" className="text-xs">
          Proveedor
        </Badge>
      )}
      {!esCliente && !esProveedor && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </span>
  );
}
