import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PERMISSIONS } from '@/lib/permissions';
import type { ListarCobrosParams } from '@/types/api';

// Cross-feature: razón social y nombre de cuenta para las columnas del
// listado (solo trae ids). pageSize 100 = cap del backend en ambos listados;
// si un tenant lo supera, el fallback muestra el UUID (riesgo conocido y
// aceptado, igual que el detalle de comprobantes).
import { useContactos } from '@/features/contactos/hooks/use-contactos';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { CobrosTable } from '../components/cobros-table';
import { ContactoCombobox } from '../components/contacto-combobox';
import { useCobros } from '../hooks/use-cobros';

const PAGE_SIZE = 25;

export function CobrosPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [contactoId, setContactoId] = useState('');
  const [page, setPage] = useState(1);

  const params: ListarCobrosParams = {
    ...(contactoId !== '' ? { contactoId } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading } = useCobros(params);

  const { data: contactosData } = useContactos({ pageSize: 100 });
  const contactoPorId = new Map(
    (contactosData?.items ?? []).map((c) => [c.id, c.razonSocial]),
  );

  const { data: cuentasData } = useCuentas({ esDetalle: true, activa: true, pageSize: 100 });
  const cuentaPorId = new Map(
    (cuentasData?.items ?? []).map((c) => [c.id, `${c.nombre} · ${c.codigoInterno}`]),
  );

  function handleContactoChange(id: string): void {
    setContactoId(id);
    setPage(1);
  }

  function handleNuevo(): void {
    void navigate('/cobros/nuevo');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cobros</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Pagos recibidos de clientes y su aplicación a ventas pendientes.
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.cobros.create}
          deniedReason="No tenés permiso para registrar cobros"
          onClick={handleNuevo}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo cobro
        </PermissionButton>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label>Filtrar por cliente</Label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ContactoCombobox
                value={contactoId}
                onChange={handleContactoChange}
                placeholder="Todos los clientes"
              />
            </div>
            {contactoId !== '' && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar filtro de cliente"
                onClick={() => handleContactoChange('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <CobrosTable
          cobros={data?.cobros ?? []}
          isLoading={isLoading}
          hayFiltros={contactoId !== ''}
          contactoPorId={contactoPorId}
          cuentaPorId={cuentaPorId}
          onCrear={handleNuevo}
          onAbrir={(id) => void navigate(`/cobros/${id}/editar`)}
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
