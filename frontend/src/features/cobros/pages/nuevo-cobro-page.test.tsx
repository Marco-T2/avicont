import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { VentaEstadoCuenta } from '@/types/api';

// ------------------------------------------------------------
// Mocks: la página se prueba con sus hooks de datos y sub-selects stubbeados;
// el corazón (derivación FIFO + overrides + payload explícito) corre REAL.
// ------------------------------------------------------------

const { hasMock, guardarMock, navigateMock, estadoCuentaMock, toastMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma (p: string) => boolean.
  hasMock: vi.fn((_p: string) => true),
  guardarMock: vi.fn(),
  navigateMock: vi.fn(),
  estadoCuentaMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: (perms: string[]) => perms.every((p) => hasMock(p)),
    isOwner: false,
    permissions: [],
  }),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateMock,
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: () => ({
    data: {
      items: [
        { id: 'caja-id', codigoInterno: '1.1.1.001', nombre: 'CAJA GENERAL' },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/estado-cuenta/hooks/use-estado-cuenta', () => ({
  useEstadoCuenta: (contactoId: string | undefined) => estadoCuentaMock(contactoId),
}));

// Stub del combobox de clientes: un botón que selecciona 'cli-1'.
vi.mock('../components/contacto-combobox', () => ({
  ContactoCombobox: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('cli-1')}>
      stub-elegir-cliente
    </button>
  ),
}));

// Stub del autocomplete de cuentas (cross-feature, ya testeado en su feature).
vi.mock('@/features/comprobantes/components/cuenta-autocomplete', () => ({
  CuentaAutocomplete: ({ value }: { value: string }) => (
    <div data-testid="stub-cuenta-autocomplete">{value}</div>
  ),
}));

vi.mock('../hooks/use-guardar-cobro-con-aplicaciones', () => ({
  useGuardarCobroConAplicaciones: () => ({
    guardar: guardarMock,
    progreso: [],
    isPending: false,
  }),
}));

import { NuevoCobroPage } from './nuevo-cobro-page';

// Ventas EN EL ORDEN DEL BACKEND. La primera del array tiene la fecha MÁS
// NUEVA a propósito: si la página reordenara por fecha, el auto-tilde caería
// en otra fila y estos tests se ponen rojos (REQ-CXC-05 congelada a nivel
// página, además del test de lib).
function venta(
  overrides: Partial<VentaEstadoCuenta> & { ventaId: string },
): VentaEstadoCuenta {
  return {
    fechaContable: '2026-06-01',
    fechaVencimiento: null,
    montoTotal: '1000.00',
    cobrado: '0.00',
    saldoPendiente: '300.00',
    estadoComercial: 'ABIERTA',
    vencida: false,
    diasAtraso: 0,
    ...overrides,
  };
}

const VENTAS_BACKEND = [
  venta({ ventaId: 'v-a', fechaContable: '2026-07-01', saldoPendiente: '300.00' }),
  venta({ ventaId: 'v-b', fechaContable: '2026-06-01', saldoPendiente: '500.00' }),
  venta({ ventaId: 'v-c', fechaContable: '2026-06-15', saldoPendiente: '400.00' }),
];

function renderPage() {
  return render(
    <TooltipProvider>
      <NuevoCobroPage />
    </TooltipProvider>,
  );
}

async function elegirClienteYMonto(user: ReturnType<typeof userEvent.setup>, monto: string) {
  await user.click(screen.getByRole('button', { name: 'stub-elegir-cliente' }));
  await user.type(screen.getByLabelText(/monto \(bs\)/i), monto);
}

beforeEach(() => {
  hasMock.mockReset();
  hasMock.mockReturnValue(true);
  guardarMock.mockReset();
  navigateMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  estadoCuentaMock.mockReset();
  estadoCuentaMock.mockImplementation((contactoId: string | undefined) =>
    contactoId === undefined
      ? { data: undefined, isLoading: false, isError: false }
      : {
          data: {
            contactoId,
            razonSocial: 'Cliente Uno',
            fechaCorte: '2026-07-30',
            ventas: VENTAS_BACKEND,
            totalSaldoPendiente: '1200.00',
            saldoAFavor: '0.00',
          },
          isLoading: false,
          isError: false,
        },
  );
});

describe('NuevoCobroPage — auto-tilde FIFO sobre el orden del backend', () => {
  it('escribir el monto tilda desde la PRIMERA fila del array (no la más vieja por fecha)', async () => {
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');

    const filas = screen.getAllByTestId(/fila-venta-/);
    expect(filas.map((f) => f.getAttribute('data-testid'))).toEqual([
      'fila-venta-v-a',
      'fila-venta-v-b',
      'fila-venta-v-c',
    ]);

    // 600 → 300 a v-a (primera del ARRAY, la de fecha más nueva) y 300 a v-b.
    expect(within(filas[0]!).getByRole('checkbox')).toBeChecked();
    expect(within(filas[0]!).getByRole('textbox')).toHaveValue('300.00');
    expect(within(filas[1]!).getByRole('checkbox')).toBeChecked();
    expect(within(filas[1]!).getByRole('textbox')).toHaveValue('300.00');
    expect(within(filas[2]!).getByRole('checkbox')).not.toBeChecked();
  });

  it('la sugerencia es overrideable: destildar la primera y repartir 600 entre las otras dos', async () => {
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');

    const filas = screen.getAllByTestId(/fila-venta-/);
    // Destildar la primera (SIEMPRE destildable).
    await user.click(within(filas[0]!).getByRole('checkbox'));
    expect(within(filas[0]!).getByRole('checkbox')).not.toBeChecked();

    // La segunda quedó tildada con 300: subirla a 500.
    const inputB = within(filas[1]!).getByRole('textbox');
    await user.clear(inputB);
    await user.type(inputB, '500');

    // Tildar la tercera: sugiere lo que queda sin aplicar (100).
    await user.click(within(filas[2]!).getByRole('checkbox'));
    expect(within(filas[2]!).getByRole('textbox')).toHaveValue('100.00');

    expect(screen.getByText(/aplicado a ventas/i).textContent).toContain('600.00');
  });

  it('cambiar el monto descarta los overrides y vuelve a la sugerencia FIFO', async () => {
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');
    const filas = screen.getAllByTestId(/fila-venta-/);
    await user.click(within(filas[0]!).getByRole('checkbox')); // override

    // Cambiar el monto → sugerencia limpia sobre el monto nuevo.
    const montoInput = screen.getByLabelText(/monto \(bs\)/i);
    await user.clear(montoInput);
    await user.type(montoInput, '300');

    expect(within(filas[0]!).getByRole('checkbox')).toBeChecked();
    expect(within(filas[0]!).getByRole('textbox')).toHaveValue('300.00');
    expect(within(filas[1]!).getByRole('checkbox')).not.toBeChecked();
  });

  it('si lo aplicado supera el monto, avisa y deshabilita el submit', async () => {
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');
    const filas = screen.getAllByTestId(/fila-venta-/);
    const inputA = within(filas[0]!).getByRole('textbox');
    await user.clear(inputA);
    await user.type(inputA, '500'); // 500 + 300 = 800 > 600

    expect(screen.getByText(/supera el monto del cobro/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar y contabilizar/i })).toBeDisabled();
    expect(guardarMock).not.toHaveBeenCalled();
  });
});

describe('NuevoCobroPage — guardado en dos acciones (espejo de ventas, D-14)', () => {
  it('«Guardar y contabilizar» manda las aplicaciones EXPLÍCITAS con modo contabilizar', async () => {
    const user = userEvent.setup();
    guardarMock.mockResolvedValue({ ok: true, cobroId: 'cobro-9' });
    renderPage();

    await elegirClienteYMonto(user, '600');
    await user.type(screen.getByLabelText(/glosa/i), 'Cobro parcial de junio');

    // Override: destildar la primera del array.
    const filas = screen.getAllByTestId(/fila-venta-/);
    await user.click(within(filas[0]!).getByRole('checkbox'));
    const inputB = within(filas[1]!).getByRole('textbox');
    await user.clear(inputB);
    await user.type(inputB, '600');

    await user.click(screen.getByRole('button', { name: /guardar y contabilizar/i }));

    expect(guardarMock).toHaveBeenCalledTimes(1);
    const [cobro, aplicaciones, modo] = guardarMock.mock.calls[0] as [
      Record<string, unknown>,
      { ventaId: string; montoAplicado: string }[],
      string,
    ];
    expect(modo).toBe('contabilizar');
    expect(cobro).toMatchObject({
      contactoId: 'cli-1',
      monto: '600',
      cuentaDestinoId: 'caja-id', // precarga Caja General (1.1.1.001)
      glosa: 'Cobro parcial de junio',
    });
    // Explícito: v-a destildada NO viaja; v-b viaja con el monto overrideado.
    expect(aplicaciones).toHaveLength(1);
    expect(aplicaciones[0]).toMatchObject({ ventaId: 'v-b', montoAplicado: '600' });

    // Éxito → continúa en la edición del cobro creado.
    expect(navigateMock).toHaveBeenCalledWith('/cobros/cobro-9/editar', { replace: true });
  });

  it('«Guardar borrador» llama con modo borrador, y el copy avisa ANTES qué pasa con las tildadas', async () => {
    const user = userEvent.setup();
    guardarMock.mockResolvedValue({ ok: true, cobroId: 'cobro-9' });
    renderPage();

    await elegirClienteYMonto(user, '600');

    // El aviso está en pantalla ANTES de tocar el botón, y nombra las filas
    // tildadas (600 tilda 2 ventas).
    expect(
      screen.getByText(/las aplicaciones a ventas se registran al contabilizar/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/las 2 ventas tildadas quedarán/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/glosa/i), 'Anticipo de julio');
    await user.click(screen.getByRole('button', { name: /guardar borrador/i }));

    expect(guardarMock).toHaveBeenCalledTimes(1);
    const modo = guardarMock.mock.calls[0]?.[2] as string;
    expect(modo).toBe('borrador');
    expect(navigateMock).toHaveBeenCalledWith('/cobros/cobro-9/editar', { replace: true });
  });

  it('falla CONTABILIZAR: el mensaje dice que quedó como borrador y navega a la edición', async () => {
    const user = userEvent.setup();
    guardarMock.mockResolvedValue({
      ok: false,
      cobroId: 'cobro-9',
      falloEn: 'contabilizar',
      error: 'El período fiscal está cerrado.',
    });
    renderPage();

    await elegirClienteYMonto(user, '600');
    await user.type(screen.getByLabelText(/glosa/i), 'Cobro parcial de junio');
    await user.click(screen.getByRole('button', { name: /guardar y contabilizar/i }));

    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('quedó guardado como BORRADOR, pero no se pudo contabilizar'),
    );
    expect(navigateMock).toHaveBeenCalledWith('/cobros/cobro-9/editar', { replace: true });
  });

  it('falla una APLICACIÓN: el mensaje dice que el cobro quedó contabilizado y navega a la edición', async () => {
    const user = userEvent.setup();
    guardarMock.mockResolvedValue({
      ok: false,
      cobroId: 'cobro-9',
      falloEn: 'aplicacion',
      error: 'La aplicación excede la venta.',
    });
    renderPage();

    await elegirClienteYMonto(user, '600');
    await user.type(screen.getByLabelText(/glosa/i), 'Cobro parcial de junio');
    await user.click(screen.getByRole('button', { name: /guardar y contabilizar/i }));

    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('quedó registrado y contabilizado, pero falló una aplicación'),
    );
    expect(navigateMock).toHaveBeenCalledWith('/cobros/cobro-9/editar', { replace: true });
  });

  it('falla el POST del cobro: muestra el error y NO navega (no hay nada creado)', async () => {
    const user = userEvent.setup();
    guardarMock.mockResolvedValue({
      ok: false,
      cobroId: null,
      falloEn: 'cobro',
      error: 'La cuenta destino no es elegible.',
    });
    renderPage();

    await elegirClienteYMonto(user, '600');
    await user.type(screen.getByLabelText(/glosa/i), 'Cobro parcial de junio');
    await user.click(screen.getByRole('button', { name: /guardar y contabilizar/i }));

    expect(toastMock.error).toHaveBeenCalledWith('La cuenta destino no es elegible.');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('cliente sin ventas abiertas: avisa que el cobro queda como saldo a favor', async () => {
    estadoCuentaMock.mockImplementation((contactoId: string | undefined) =>
      contactoId === undefined
        ? { data: undefined, isLoading: false, isError: false }
        : {
            data: {
              contactoId,
              razonSocial: 'Cliente Uno',
              fechaCorte: '2026-07-30',
              ventas: [],
              totalSaldoPendiente: '0.00',
              saldoAFavor: '0.00',
            },
            isLoading: false,
            isError: false,
          },
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'stub-elegir-cliente' }));
    expect(screen.getByText(/saldo a favor \(anticipo\)/i)).toBeInTheDocument();
  });
});

describe('NuevoCobroPage — gating §14.7', () => {
  it('sin permisos las dos acciones quedan deshabilitadas (fail-closed)', async () => {
    hasMock.mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');
    expect(screen.getByRole('button', { name: /guardar y contabilizar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /guardar borrador/i })).toBeDisabled();
  });

  it('con create pero SIN post: borrador habilitado, contabilizar deshabilitado (AND de permisos)', async () => {
    hasMock.mockImplementation((p: string) => p === 'contabilidad.cobros.create');
    const user = userEvent.setup();
    renderPage();

    await elegirClienteYMonto(user, '600');
    expect(screen.getByRole('button', { name: /guardar borrador/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /guardar y contabilizar/i })).toBeDisabled();
  });
});
