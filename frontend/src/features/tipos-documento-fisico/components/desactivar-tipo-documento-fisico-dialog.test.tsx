import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type { TipoDocumentoFisico } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: { patch: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedPatch = api.patch as unknown as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const TIPO: TipoDocumentoFisico = {
  id: 'tdf-42',
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: [],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  numeracionAutomatica: false,
  numeroInicial: null,
};

// Importación diferida para que vi.mock esté activo antes de que el módulo
// resuelva sus dependencias (patrón del desactivar-contacto-dialog.test).
const { DesactivarTipoDocumentoFisicoDialog } = await import(
  './desactivar-tipo-documento-fisico-dialog'
);

describe('DesactivarTipoDocumentoFisicoDialog', () => {
  it('confirmar invoca PATCH con activo: false en el id correcto', async () => {
    mockedPatch.mockResolvedValue({ data: { ...TIPO, activo: false } });
    const user = userEvent.setup();

    render(
      <DesactivarTipoDocumentoFisicoDialog
        tipo={TIPO}
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    const confirmar = screen.getByRole('button', { name: /desactivar/i });
    await user.click(confirmar);

    expect(mockedPatch).toHaveBeenCalledOnce();
    expect(mockedPatch).toHaveBeenCalledWith(
      `/api/tipos-documento-fisico/${TIPO.id}`,
      { activo: false },
    );
  });

  it('el mensaje del AlertDialog incluye el nombre del tipo', () => {
    render(
      <DesactivarTipoDocumentoFisicoDialog
        tipo={TIPO}
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByText(/Factura recibida/)).toBeInTheDocument();
  });

  it('cancelar no invoca la API y el dialog puede cerrarse', async () => {
    mockedPatch.mockReset();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <DesactivarTipoDocumentoFisicoDialog
        tipo={TIPO}
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
      { wrapper: wrapper() },
    );

    const cancelar = screen.getByRole('button', { name: /cancelar/i });
    await user.click(cancelar);

    expect(mockedPatch).not.toHaveBeenCalled();
  });
});
