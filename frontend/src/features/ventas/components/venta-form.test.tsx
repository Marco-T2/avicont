import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Venta } from '@/types/api';

import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';
import { VentaForm } from './venta-form';

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
}));

const MUTATION_IDLE = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
} as unknown;

vi.mock('../hooks/use-venta-mutations', () => ({
  useCrearVenta: vi.fn(() => MUTATION_IDLE),
  useEditarVenta: vi.fn(() => MUTATION_IDLE),
  useContabilizarVenta: vi.fn(() => MUTATION_IDLE),
  useEliminarVenta: vi.fn(() => MUTATION_IDLE),
  useAnularVenta: vi.fn(() => MUTATION_IDLE),
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));
vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(() => ({
    data: { items: [], total: 0, page: 1, pageSize: 50 },
    isLoading: false,
  })),
}));
vi.mock('@/features/items/hooks/use-items', () => ({
  useItems: vi.fn(() => ({
    data: { items: [], total: 0, page: 1, pageSize: 100 },
    isLoading: false,
  })),
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

const CAJA_GENERAL = {
  id: 'cuenta-caja',
  codigoInterno: '1.1.1.001',
  nombre: 'Caja General',
};

const VENTA_BASE: Venta = {
  id: 'venta-1',
  contactoId: 'contacto-1',
  fechaContable: '2026-07-15',
  condicionPago: 'CREDITO',
  fechaVencimiento: '2026-08-15',
  glosa: 'Venta de pollo faenado a Avícola Sur',
  cuentaDestinoId: null,
  montoTotal: '31.53',
  comprobanteId: 'comp-1',
  estado: 'BORRADOR',
  numero: null,
  anulado: false,
  createdAt: '2026-07-15T12:00:00Z',
  updatedAt: '2026-07-15T12:00:00Z',
  lineas: [
    {
      id: 'linea-1',
      orden: 1,
      itemId: 'item-1',
      descripcion: 'Pollo entero',
      cantidad: '5',
      precioUnitario: '6.305',
      cuentaIngresoId: 'cuenta-ventas',
      subtotal: '31.53',
    },
  ],
};

function renderForm(props: Parameters<typeof VentaForm>[0]) {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <VentaForm {...props} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  vi.mocked(useCuentas).mockReturnValue({
    data: { items: [CAJA_GENERAL], total: 1, page: 1, pageSize: 100 },
    isLoading: false,
  } as unknown as ReturnType<typeof useCuentas>);
});

describe('VentaForm — modo nueva', () => {
  it('renderiza las DOS acciones sin diálogo de confirmación (D-08)', () => {
    renderForm({ mode: 'nueva' });
    expect(
      screen.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Guardar y contabilizar' }),
    ).toBeEnabled();
    // Cero confirmaciones: no hay AlertDialog montado al guardar.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('sin ventas.post → "Guardar y contabilizar" deshabilitado; "Guardar borrador" sigue habilitado (§14.7)', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.ventas.post');
    renderForm({ mode: 'nueva' });
    expect(
      screen.getByRole('button', { name: 'Guardar y contabilizar' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeEnabled();
  });

  it('CONTADO (default): muestra la cuenta destino precargada en Caja General y oculta el vencimiento (PA-1)', () => {
    renderForm({ mode: 'nueva' });
    expect(screen.getByText('Cuenta destino del dinero')).toBeInTheDocument();
    // Precarga de UI: 1.1.1.001 existe → el combobox muestra Caja General.
    expect(screen.getByText('Caja General')).toBeInTheDocument();
    expect(screen.queryByText('Fecha de vencimiento')).not.toBeInTheDocument();
  });

  it('CONTADO sin 1.1.1.001 en el plan: no precarga y no rompe (REQ-VTA-04)', () => {
    vi.mocked(useCuentas).mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 100 },
      isLoading: false,
    } as unknown as ReturnType<typeof useCuentas>);
    renderForm({ mode: 'nueva' });
    expect(screen.getByText('Cuenta destino del dinero')).toBeInTheDocument();
    expect(screen.getByText('Elegir cuenta de efectivo…')).toBeInTheDocument();
  });
});

describe('VentaForm — modo borrador (CREDITO)', () => {
  it('muestra el vencimiento y oculta la cuenta destino', () => {
    renderForm({ mode: 'borrador', venta: VENTA_BASE });
    expect(screen.getByText('Fecha de vencimiento')).toBeInTheDocument();
    expect(
      screen.queryByText('Cuenta destino del dinero'),
    ).not.toBeInTheDocument();
  });

  it('ofrece eliminar el borrador — la única acción con confirmación roja (§14.3)', () => {
    renderForm({ mode: 'borrador', venta: VENTA_BASE });
    expect(
      screen.getByRole('button', { name: /eliminar borrador/i }),
    ).toBeEnabled();
  });
});

describe('VentaForm — modo contabilizado', () => {
  const VENTA_CONTABILIZADA: Venta = {
    ...VENTA_BASE,
    estado: 'CONTABILIZADO',
    numero: 'V2607-000001',
  };

  it('la edición está PERMITIDA: guardar cambios + anular, sin re-contabilizar (§4.3, REQ-VTA-06)', () => {
    renderForm({ mode: 'contabilizado', venta: VENTA_CONTABILIZADA });
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Anular venta' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar y contabilizar' }),
    ).not.toBeInTheDocument();
    // El banner explica que el asiento se regenera y el número no cambia.
    expect(screen.getAllByText(/V2607-000001/).length).toBeGreaterThan(0);
  });

  it('sin ventas.void → "Anular venta" deshabilitado (§14.7)', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.ventas.void');
    renderForm({ mode: 'contabilizado', venta: VENTA_CONTABILIZADA });
    expect(screen.getByRole('button', { name: 'Anular venta' })).toBeDisabled();
  });

  it('sin ventas.update → "Guardar cambios" deshabilitado (§14.7)', () => {
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.ventas.update');
    renderForm({ mode: 'contabilizado', venta: VENTA_CONTABILIZADA });
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
  });
});
