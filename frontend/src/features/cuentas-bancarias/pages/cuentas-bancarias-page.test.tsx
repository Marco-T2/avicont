import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { CuentaBancaria } from '@/types/api';

import { useCuentasBancarias } from '../hooks/use-cuentas-bancarias';
import { CuentasBancariasPage } from './cuentas-bancarias-page';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean para los tests que la sobreescriben con mockImplementation.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('../hooks/use-cuentas-bancarias', () => ({
  useCuentasBancarias: vi.fn(),
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (perms: string[]) => perms.every((p) => hasMock(p)),
    isOwner: false,
    permissions: [],
  }),
}));

const CUENTA_BANCARIA: CuentaBancaria = {
  id: 'cb-1',
  organizationId: 'org-1',
  cuentaId: 'cuenta-1',
  alias: 'Cuenta corriente BancoSol',
  perfilExtracto: 'BANCOSOL_XLSX',
  numeroCuenta: null,
  moneda: 'BOB',
  activa: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CuentasBancariasPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  vi.mocked(useCuentasBancarias).mockReturnValue({
    data: { items: [CUENTA_BANCARIA], total: 1, page: 1, pageSize: 50 },
    isLoading: false,
  } as unknown as ReturnType<typeof useCuentasBancarias>);
});

describe('CuentasBancariasPage — gating fail-closed por permiso (§14.7)', () => {
  it('con permiso de creación → botón "Nueva cuenta bancaria" habilitado', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /nueva cuenta bancaria/i })).toBeEnabled();
  });

  it('sin permiso de creación → botón "Nueva cuenta bancaria" deshabilitado', () => {
    hasMock.mockReturnValue(false);

    renderPage();

    expect(screen.getByRole('button', { name: /nueva cuenta bancaria/i })).toBeDisabled();
  });

  it('sin permiso de update → botón "Editar" de la fila deshabilitado', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.update');

    renderPage();

    expect(screen.getByRole('button', { name: /^editar$/i })).toBeDisabled();
  });

  it('sin permiso de delete → botón "Eliminar" de la fila deshabilitado', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.delete');

    renderPage();

    expect(screen.getByRole('button', { name: /^eliminar$/i })).toBeDisabled();
  });
});
