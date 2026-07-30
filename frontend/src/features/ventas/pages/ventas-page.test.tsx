import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { VentaListItem } from '@/types/api';

import { useContactos } from '@/features/contactos/hooks/use-contactos';
import { useVentas } from '../hooks/use-ventas';
import { VentasPage } from './ventas-page';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
}));

vi.mock('../hooks/use-ventas', () => ({ useVentas: vi.fn() }));
vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(),
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

const VENTA: VentaListItem = {
  id: 'venta-1',
  contactoId: 'contacto-1',
  fechaContable: '2026-07-15',
  condicionPago: 'CREDITO',
  fechaVencimiento: '2026-08-15',
  glosa: 'Venta de pollo faenado a Avícola Sur',
  cuentaDestinoId: null,
  montoTotal: '31.53',
  comprobanteId: 'comp-1',
  estado: 'CONTABILIZADO',
  numero: 'V2607-000001',
  anulado: false,
  createdAt: '2026-07-15T12:00:00Z',
  updatedAt: '2026-07-15T12:00:00Z',
};

function renderPage() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <VentasPage />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  vi.mocked(useVentas).mockReturnValue({
    data: { ventas: [VENTA], total: 1, page: 1, pageSize: 50 },
    isLoading: false,
  } as unknown as ReturnType<typeof useVentas>);
  vi.mocked(useContactos).mockReturnValue({
    data: {
      items: [{ id: 'contacto-1', razonSocial: 'Avícola Sur SRL' }],
      total: 1,
      page: 1,
      pageSize: 100,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useContactos>);
});

describe('VentasPage', () => {
  it('renderiza el header canónico y la fila con el nombre del cliente resuelto', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ventas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Venta de pollo faenado a Avícola Sur')).toBeInTheDocument();
    // El listado solo trae contactoId — el nombre sale del directorio de contactos.
    expect(screen.getByText('Avícola Sur SRL')).toBeInTheDocument();
    // §4.5: el montoTotal del backend se muestra sin recalcular.
    expect(screen.getByText('31.53')).toBeInTheDocument();
    expect(screen.getByText('V2607-000001')).toBeInTheDocument();
  });

  it('con contabilidad.ventas.create → botón "Nueva venta" habilitado', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nueva venta/i })).toBeEnabled();
  });

  it('sin contabilidad.ventas.create → botón "Nueva venta" deshabilitado (§14.7)', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.ventas.create');
    renderPage();
    expect(screen.getByRole('button', { name: /nueva venta/i })).toBeDisabled();
  });

  it('una venta anulada se muestra MARCADA, no se esconde (§4.7)', () => {
    vi.mocked(useVentas).mockReturnValue({
      data: {
        ventas: [{ ...VENTA, anulado: true }],
        total: 1,
        page: 1,
        pageSize: 50,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useVentas>);
    renderPage();
    expect(screen.getByText('Venta de pollo faenado a Avícola Sur')).toBeInTheDocument();
    expect(screen.getByText('Anulado')).toBeInTheDocument();
  });
});
