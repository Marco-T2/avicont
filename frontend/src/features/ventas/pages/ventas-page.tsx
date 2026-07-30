import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
// Cross-feature: el listado de ventas solo trae contactoId — el nombre se
// resuelve contra el directorio de contactos. pageSize 100 = tope del backend
// (ListarContactosQueryDto @Max(LIST_MAX_PAGE_SIZE=100)); activo:'all' para
// que las ventas de clientes hoy inactivos sigan mostrando su nombre. Deuda:
// un tenant con >100 contactos verá el UUID de los que no entren en la
// página — migrar a resolución server-side (nombre en el listado o batch).
import { useContactos } from '@/features/contactos/hooks/use-contactos';

import { VentasFilters } from '../components/ventas-filters';
import { VentasTable } from '../components/ventas-table';
import { useVentas } from '../hooks/use-ventas';
import { buildVentasParams, PAGE_SIZE } from '../lib/build-ventas-params';

/**
 * Listado de ventas — `/ventas` (permiso `contabilidad.ventas.read` en la ruta).
 */
export function VentasPage(): React.JSX.Element {
  const navigate = useNavigate();

  const [contactoId, setContactoId] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);

  // Reset de página cuando cambia cualquier filtro.
  function updateContacto(id: string | null): void {
    setContactoId(id);
    setPage(1);
  }
  function updateFechaDesde(v: string): void {
    setFechaDesde(v);
    setPage(1);
  }
  function updateFechaHasta(v: string): void {
    setFechaHasta(v);
    setPage(1);
  }
  function limpiarFiltros(): void {
    setContactoId(null);
    setFechaDesde('');
    setFechaHasta('');
    setPage(1);
  }

  const params = buildVentasParams(contactoId, fechaDesde, fechaHasta, page);
  const { data, isLoading } = useVentas(params);

  const { data: contactosData } = useContactos({ activo: 'all', pageSize: 100 });
  const nombrePorContacto = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contactosData?.items ?? []) {
      map.set(c.id, c.razonSocial);
    }
    return map;
  }, [contactosData]);

  const hayFiltros = contactoId !== null || fechaDesde !== '' || fechaHasta !== '';

  function handleNueva(): void {
    void navigate('/ventas/nueva');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Ventas</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Documentos de venta con su asiento contable generado automáticamente.
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.ventas.create}
          deniedReason="No tenés permiso para registrar ventas"
          onClick={handleNueva}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva venta
        </PermissionButton>
      </div>

      <div className="space-y-4">
        <VentasFilters
          contactoId={contactoId}
          onContactoChange={updateContacto}
          fechaDesde={fechaDesde}
          onFechaDesdeChange={updateFechaDesde}
          fechaHasta={fechaHasta}
          onFechaHastaChange={updateFechaHasta}
          hayFiltros={hayFiltros}
          onLimpiar={limpiarFiltros}
        />

        <VentasTable
          ventas={data?.ventas ?? []}
          isLoading={isLoading}
          hayFiltros={hayFiltros}
          nombreContacto={(id) => nombrePorContacto.get(id) ?? id}
          onCrear={handleNueva}
          onAbrir={(id) => void navigate(`/ventas/${id}/editar`)}
        />

        {data !== undefined && (
          <PaginationBar
            page={data.page}
            limit={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
