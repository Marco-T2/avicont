import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
import type { CuentaBancaria } from '@/types/api';

import { CuentaBancariaFormSheet } from '../components/cuenta-bancaria-form-sheet';
import { CuentasBancariasListTable } from '../components/cuentas-bancarias-list-table';
import { EliminarCuentaBancariaDialog } from '../components/eliminar-cuenta-bancaria-dialog';
import { ImportacionesDrawer } from '../components/importaciones-drawer';
import { useCuentasBancarias } from '../hooks/use-cuentas-bancarias';

export function CuentasBancariasPage(): React.JSX.Element {
  const { data, isLoading } = useCuentasBancarias({ activa: 'all' });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editando, setEditando] = useState<CuentaBancaria | null>(null);

  const [eliminarDialogOpen, setEliminarDialogOpen] = useState(false);
  const [eliminando, setEliminando] = useState<CuentaBancaria | null>(null);

  // Tarea 5.39: el historial de extractos se abre desde la fila de su cuenta.
  const [extractosDrawerOpen, setExtractosDrawerOpen] = useState(false);
  const [viendoExtractosDe, setViendoExtractosDe] = useState<CuentaBancaria | null>(null);

  function handleNueva(): void {
    setEditando(null);
    setSheetOpen(true);
  }

  function handleEditar(cb: CuentaBancaria): void {
    setEditando(cb);
    setSheetOpen(true);
  }

  function handleEliminar(cb: CuentaBancaria): void {
    setEliminando(cb);
    setEliminarDialogOpen(true);
  }

  function handleVerExtractos(cb: CuentaBancaria): void {
    setViendoExtractosDe(cb);
    setExtractosDrawerOpen(true);
  }

  function handleSheetOpenChange(open: boolean): void {
    setSheetOpen(open);
    if (!open) setEditando(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cuentas bancarias</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Vinculá cuentas del plan a tus bancos para importar y conciliar extractos.
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.conciliacion.create}
          deniedReason="No tenés permiso para crear cuentas bancarias"
          onClick={handleNueva}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva cuenta bancaria
        </PermissionButton>
      </div>

      <CuentasBancariasListTable
        items={data?.items ?? []}
        isLoading={isLoading}
        onEditar={handleEditar}
        onEliminar={handleEliminar}
        onVerExtractos={handleVerExtractos}
      />

      <CuentaBancariaFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        cuentaBancaria={editando}
      />

      <EliminarCuentaBancariaDialog
        cuentaBancaria={eliminando}
        open={eliminarDialogOpen}
        onOpenChange={setEliminarDialogOpen}
      />

      <ImportacionesDrawer
        cuentaBancaria={viendoExtractosDe}
        open={extractosDrawerOpen}
        onOpenChange={setExtractosDrawerOpen}
      />
    </div>
  );
}
