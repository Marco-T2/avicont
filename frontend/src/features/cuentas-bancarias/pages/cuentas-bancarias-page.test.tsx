import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { CuentaBancaria } from '@/types/api';

import { useCuentasBancarias } from '../hooks/use-cuentas-bancarias';
import { useImportaciones } from '../hooks/use-importaciones';
import { useImportarExtracto } from '../hooks/use-importar-extracto';
import { usePerfilesExtracto } from '../hooks/use-perfiles-extracto';
import { CuentasBancariasPage } from './cuentas-bancarias-page';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean para los tests que la sobreescriben con mockImplementation.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('../hooks/use-cuentas-bancarias', () => ({
  useCuentasBancarias: vi.fn(),
}));

vi.mock('../hooks/use-importaciones', () => ({ useImportaciones: vi.fn() }));
vi.mock('../hooks/use-importar-extracto', () => ({ useImportarExtracto: vi.fn() }));
vi.mock('../hooks/use-perfiles-extracto', () => ({ usePerfilesExtracto: vi.fn() }));

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
  vi.mocked(useImportaciones).mockReturnValue({
    data: { items: [], total: 0, page: 1, pageSize: 20 },
    isLoading: false,
  } as unknown as ReturnType<typeof useImportaciones>);
  vi.mocked(useImportarExtracto).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
  } as unknown as ReturnType<typeof useImportarExtracto>);
  vi.mocked(usePerfilesExtracto).mockReturnValue({
    data: [
      {
        perfil: 'BANCOSOL_XLSX',
        banco: 'Banco Sol',
        formato: 'Excel (.xlsx)',
        extensiones: ['.xlsx'],
        mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        estrategiaChecksum: 'DERIVADO',
        soportaContraparte: false,
        soportaHora: true,
        exponeNumeroCuenta: true,
        instruccionesDescarga: 'Descargá el extracto en Excel.',
      },
    ],
  } as unknown as ReturnType<typeof usePerfilesExtracto>);
});

// El catálogo de bancos dejó de estar hardcodeado en el frontend: lo sirve
// `GET /api/cuentas-bancarias/perfiles`. Estos dos tests fijan el contrato de
// esa lectura — que la etiqueta del backend llegue a la pantalla, y que la
// pantalla no se rompa si el catálogo todavía no cargó.
describe('CuentasBancariasPage — etiqueta de perfil servida por el backend', () => {
  it('muestra la etiqueta del descriptor, no el valor crudo del enum', () => {
    renderPage();
    expect(screen.getByText('Banco Sol — Excel (.xlsx)')).toBeInTheDocument();
    expect(screen.queryByText('BANCOSOL_XLSX')).not.toBeInTheDocument();
  });

  it('si el catálogo no cargó, cae al valor crudo del enum en vez de dejar la celda vacía', () => {
    vi.mocked(usePerfilesExtracto).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof usePerfilesExtracto>);

    renderPage();
    expect(screen.getByText('BANCOSOL_XLSX')).toBeInTheDocument();
  });
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

// ============================================================
// Tarea 5.39 — acceso al historial de importaciones desde el listado.
// ============================================================

describe('CuentasBancariasPage — drawer de extractos (tarea 5.39)', () => {
  it('cada fila ofrece abrir el historial de extractos de esa cuenta', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /extractos/i })).toBeInTheDocument();
  });

  it('abrir el drawer muestra el historial de la cuenta elegida', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /extractos/i }));

    expect(await screen.findByText('Extractos importados')).toBeInTheDocument();
    expect(screen.getByText(/todavía no importaste/i)).toBeInTheDocument();
  });

  it('el drawer arranca cerrado', () => {
    renderPage();

    expect(screen.queryByText('Extractos importados')).not.toBeInTheDocument();
  });
});
