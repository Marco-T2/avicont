import { UserSearch } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { ContactoCombobox } from '@/components/shared/contacto-combobox';
import { Skeleton } from '@/components/ui/skeleton';

import { EstadoCuentaResumen } from '../components/estado-cuenta-resumen';
import { VentasAbiertasTable } from '../components/ventas-abiertas-table';
import { useEstadoCuenta } from '../hooks/use-estado-cuenta';

// ============================================================
// Sub-vistas de estado (loading / error / sin cliente)
// ============================================================

/** Skeleton de página (§14.5): cabecera + resumen + tabla, alturas proporcionales. */
function EstadoCuentaSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** Empty state de página (§13.4): todavía no se eligió cliente. Sin CTA de
 *  creación — la acción es elegir en el combobox de arriba. */
function ElegirClienteEmptyState(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <UserSearch className="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">Elegí un cliente</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Seleccioná un cliente para ver sus ventas abiertas, vencimientos y saldo a
        favor.
      </p>
    </div>
  );
}

// ============================================================
// Página
// ============================================================

/**
 * Estado de cuenta por cliente (REQ-CXC-07).
 *
 * Contenedor (Anti-F-11): orquesta URL state + query y pasa props planas a los
 * componentes presentacionales.
 *
 * El cliente elegido vive en la URL (`?contactoId=…`, §4 frontend CLAUDE.md):
 * el estado de cuenta de un cliente es un link compartible y el back del
 * navegador vuelve al cliente anterior.
 */
export function EstadoCuentaPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const contactoId = searchParams.get('contactoId') ?? undefined;

  const { data, isLoading, isError } = useEstadoCuenta(contactoId);

  function handleContactoChange(id: string | null): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === null) {
        next.delete('contactoId');
      } else {
        next.set('contactoId', id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Estado de cuenta</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Ventas abiertas, vencimientos y saldo a favor por cliente.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="max-w-md space-y-1.5">
          {/* El trigger del combobox es un <button> sin id → el nombre accesible
              va por aria-label; este texto es la etiqueta visible (§10). */}
          <span className="text-sm font-medium">Cliente</span>
          <ContactoCombobox
            value={contactoId ?? null}
            onSelect={handleContactoChange}
            aria-label="Cliente"
            placeholder="Seleccionar cliente…"
          />
        </div>
      </div>

      {contactoId === undefined ? (
        <ElegirClienteEmptyState />
      ) : isError ? (
        // Query crítica para el render → banner inline, NO toast (Anti-F-13).
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo cargar el estado de cuenta del cliente. Intentá de nuevo.
          </p>
        </div>
      ) : isLoading || data === undefined ? (
        <EstadoCuentaSkeleton />
      ) : (
        <>
          <EstadoCuentaResumen
            razonSocial={data.razonSocial}
            fechaCorte={data.fechaCorte}
            totalSaldoPendiente={data.totalSaldoPendiente}
            saldoAFavor={data.saldoAFavor}
          />
          <VentasAbiertasTable
            ventas={data.ventas}
            totalSaldoPendiente={data.totalSaldoPendiente}
            saldoAFavor={data.saldoAFavor}
          />
        </>
      )}
    </div>
  );
}
