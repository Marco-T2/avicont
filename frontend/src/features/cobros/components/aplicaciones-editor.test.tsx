import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Cobro, VentaEstadoCuenta } from '@/types/api';

const { hasMock, ventaDetalleMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
  ventaDetalleMock: vi.fn(),
}));

// Cross-feature mockeado: el detalle de venta que resuelve la etiqueta de
// cada aplicación (el caso SALDADA vive fuera del estado de cuenta).
vi.mock('@/features/ventas/hooks/use-venta', () => ({
  useVenta: (id: string) => ventaDetalleMock(id),
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

vi.mock('../api/crear-aplicacion', () => ({ crearAplicacion: vi.fn() }));
vi.mock('../api/editar-aplicacion', () => ({ editarAplicacion: vi.fn() }));
vi.mock('../api/eliminar-aplicacion', () => ({ eliminarAplicacion: vi.fn() }));

import { crearAplicacion } from '../api/crear-aplicacion';
import { AplicacionesEditor } from './aplicaciones-editor';

const mockCrearAplicacion = vi.mocked(crearAplicacion);

function cobro(overrides: Partial<Cobro> = {}): Cobro {
  return {
    id: 'cobro-1',
    contactoId: 'cli-1',
    fechaContable: '2026-07-15',
    monto: '600.00',
    cuentaDestinoId: 'cta-1',
    glosa: 'Cobro de prueba',
    comprobanteId: 'comp-1',
    estado: 'CONTABILIZADO',
    numero: 'I2607-000001',
    anulado: false,
    createdAt: '2026-07-15T12:00:00Z',
    updatedAt: '2026-07-15T12:00:00Z',
    aplicaciones: [],
    ...overrides,
  };
}

const VENTA: VentaEstadoCuenta = {
  ventaId: 'v-1',
  fechaContable: '2026-06-01',
  fechaVencimiento: null,
  montoTotal: '1000.00',
  cobrado: '0.00',
  saldoPendiente: '1000.00',
  estadoComercial: 'ABIERTA',
  vencida: false,
  diasAtraso: 0,
};

function renderEditor(c: Cobro) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AplicacionesEditor cobro={c} ventasAbiertas={[VENTA]} disabled={c.anulado} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  mockCrearAplicacion.mockReset();
  ventaDetalleMock.mockReset();
  ventaDetalleMock.mockReturnValue({ data: undefined, isLoading: false });
});

// ============================================================
// Etiqueta de las aplicaciones — el caso EXACTO que se rompió en el smoke
// 2026-07-30: al aplicar el pago completo la venta queda SALDADA, sale del
// estado de cuenta (solo publica saldo > 0) y la fila mostraba el UUID crudo.
// ============================================================

const UUID_SALDADA = '6d87061e-15d2-412d-87ba-a903174bfe68';

describe('AplicacionesEditor — etiqueta de la venta aplicada', () => {
  function cobroConAplicacion(): Cobro {
    return cobro({
      aplicaciones: [
        {
          id: 'ap-1',
          ventaId: UUID_SALDADA,
          montoAplicado: '504.40',
          createdAt: '2026-07-30T12:00:00Z',
        },
      ],
    });
  }

  it('una venta SALDADA (fuera del estado de cuenta) muestra fecha y número, NUNCA el UUID', () => {
    ventaDetalleMock.mockImplementation((id: string) =>
      id === UUID_SALDADA
        ? {
            data: {
              id: UUID_SALDADA,
              fechaContable: '2026-07-20',
              numero: 'V2607-000002',
            },
            isLoading: false,
          }
        : { data: undefined, isLoading: false },
    );

    // ventasAbiertas NO contiene la saldada — es el hueco que se congela acá.
    renderEditor(cobroConAplicacion());

    expect(screen.getByText(/venta del 20\/07\/2026/i)).toBeInTheDocument();
    // §4.9: el correlativo es la referencia que el contador reconoce.
    expect(screen.getByText('V2607-000002')).toBeInTheDocument();
    // El UUID no aparece como texto en NINGÚN lado.
    expect(screen.queryByText(UUID_SALDADA)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(UUID_SALDADA.slice(0, 8)))).not.toBeInTheDocument();
  });

  it('fallback honesto: sin detalle resoluble dice "Venta no encontrada" con el id solo en title', () => {
    // useVenta no resuelve (venta borrada / error) y tampoco está cargando.
    renderEditor(cobroConAplicacion());

    const fallback = screen.getByText('Venta no encontrada');
    expect(fallback).toBeInTheDocument();
    // El id queda disponible para soporte, pero no como texto visible.
    expect(fallback).toHaveAttribute('title', `Venta ${UUID_SALDADA}`);
    expect(screen.queryByText(UUID_SALDADA)).not.toBeInTheDocument();
  });

  it('una venta con saldo en el estado de cuenta muestra además su saldo pendiente', () => {
    const cobroAplicadoAV1 = cobro({
      aplicaciones: [
        { id: 'ap-2', ventaId: 'v-1', montoAplicado: '64.07', createdAt: '2026-07-30T12:00:00Z' },
      ],
    });
    ventaDetalleMock.mockReturnValue({
      data: { id: 'v-1', fechaContable: '2026-06-01', numero: 'V2607-000001' },
      isLoading: false,
    });

    renderEditor(cobroAplicadoAV1);

    expect(screen.getByText(/venta del 01\/06\/2026/i)).toBeInTheDocument();
    expect(screen.getByText('V2607-000001')).toBeInTheDocument();
    // El saldo pendiente de v-1 (1000.00) acompaña la etiqueta.
    expect(screen.getByText('1000.00')).toBeInTheDocument();
  });
});

describe('AplicacionesEditor — cobro en BORRADOR (§14.7 afordancia honesta)', () => {
  it('muestra el motivo visible y deshabilita Aplicar: el backend rechazaría siempre', () => {
    renderEditor(cobro({ estado: 'BORRADOR', numero: null }));

    expect(
      screen.getByText(/contabilizá el cobro para poder aplicarlo a ventas/i),
    ).toBeInTheDocument();
    // La acción se VE (no se oculta) pero está inerte, input incluido.
    const aplicar = screen.getByRole('button', { name: /^aplicar$/i });
    expect(aplicar).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /monto a aplicar/i })).toBeDisabled();
  });
});

describe('AplicacionesEditor — cobro CONTABILIZADO', () => {
  it('sin banner de borrador; Aplicar se habilita con monto válido y llama al backend', async () => {
    const user = userEvent.setup();
    mockCrearAplicacion.mockResolvedValue({
      id: 'ap-1',
      ventaId: 'v-1',
      montoAplicado: '300.00',
      createdAt: '2026-07-15T12:00:00Z',
    });
    renderEditor(cobro());

    expect(
      screen.queryByText(/contabilizá el cobro para poder aplicarlo/i),
    ).not.toBeInTheDocument();

    const aplicar = screen.getByRole('button', { name: /^aplicar$/i });
    expect(aplicar).toBeDisabled(); // sin monto todavía

    await user.type(screen.getByRole('textbox', { name: /monto a aplicar/i }), '300');
    expect(aplicar).toBeEnabled();

    await user.click(aplicar);
    expect(mockCrearAplicacion).toHaveBeenCalledWith('cobro-1', {
      ventaId: 'v-1',
      montoAplicado: '300',
    });
  });
});
