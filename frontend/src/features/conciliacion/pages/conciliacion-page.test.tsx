import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { WorkspaceConciliacion, WorkspaceConciliacionParams } from '@/types/api';

// ── Mocks ────────────────────────────────────────────────────────────────
vi.mock('../hooks/use-workspace-conciliacion', () => ({
  useWorkspaceConciliacion: vi.fn(),
}));

vi.mock('../hooks/use-conciliacion-mutations', () => ({
  useCrearMatch: vi.fn(),
  useBorrarMatch: vi.fn(),
  useCambiarEstadoMovimiento: vi.fn(),
}));

vi.mock('@/features/cuentas-bancarias/hooks/use-importaciones', () => ({
  useImportaciones: vi.fn(() => ({ data: { items: [], total: 0, page: 1, pageSize: 20 } })),
}));
vi.mock('@/features/cuentas-bancarias/hooks/use-importar-extracto', () => ({
  useImportarExtracto: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: undefined })),
}));

// Los filtros se reemplazan por un botón que emite params deterministas: el
// foco de este test es la ORQUESTACIÓN de la página, no el form de filtros.
vi.mock('../components/conciliacion-filtros', () => ({
  ConciliacionFiltros: (props: {
    onBuscar: (p: WorkspaceConciliacionParams) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onBuscar({
          cuentaBancariaId: 'cb-1',
          desde: '2026-06-01',
          hasta: '2026-06-30',
        })
      }
    >
      Emitir filtros
    </button>
  ),
}));

const { hasMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fija la firma para los tests que la sobreescriben.
  hasMock: vi.fn((_p: string) => true),
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

import { useWorkspaceConciliacion } from '../hooks/use-workspace-conciliacion';
import {
  useBorrarMatch,
  useCambiarEstadoMovimiento,
  useCrearMatch,
} from '../hooks/use-conciliacion-mutations';

import { ConciliacionPage } from './conciliacion-page';

// ── Fixtures ─────────────────────────────────────────────────────────────
const WORKSPACE: WorkspaceConciliacion = {
  cuentaBancaria: {
    id: 'cb-1',
    alias: 'Cuenta corriente BancoSol',
    cuentaId: 'cuenta-1',
    moneda: 'BOB',
    numeroCuenta: '1191959-000-001',
  },
  desde: '2026-06-01',
  hasta: '2026-06-30',
  movimientos: [
    {
      id: 'mov-1',
      fecha: '2026-06-10',
      hora: null,
      monto: '1500.00',
      tipo: 'CREDITO',
      moneda: 'BOB',
      descripcion: 'Depósito ABC',
      referencia: null,
      saldo: null,
      estado: 'PENDIENTE',
      estadoEfectivo: 'PENDIENTE',
      vinculo: null,
    },
    {
      id: 'mov-2',
      fecha: '2026-06-12',
      hora: null,
      monto: '900.00',
      tipo: 'DEBITO',
      moneda: 'BOB',
      descripcion: 'Pago proveedor',
      referencia: null,
      saldo: null,
      estado: 'CONCILIADO',
      estadoEfectivo: 'CONCILIADO',
      vinculo: { matchId: 'match-77', comprobanteId: 'comp-2', orden: 1, roto: null },
    },
  ],
  lineas: [
    {
      comprobanteId: 'comp-1',
      orden: 1,
      fecha: '2026-06-10',
      numeroComprobante: 'D2606-000001',
      glosa: 'Cobro cliente ABC',
      glosaLinea: null,
      monto: '1500.00',
      montoBob: '1500.00',
      tipo: 'DEBITO',
      moneda: 'BOB',
      estadoEfectivo: 'EN_TRANSITO',
    },
  ],
  sugerencias: [
    {
      movimientoId: 'mov-1',
      comprobanteId: 'comp-1',
      orden: 1,
      confianza: 'ALTA',
      diferenciaDias: 0,
    },
  ],
  resumen: {
    movimientosPendientes: 1,
    movimientosConciliados: 1,
    movimientosIgnorados: 0,
    lineasEnTransito: 1,
  },
};

const crearMatchMutate = vi.fn();
const borrarMatchMutate = vi.fn();
const cambiarEstadoMutate = vi.fn();

function mockWorkspace(
  overrides: Partial<ReturnType<typeof useWorkspaceConciliacion>> = {},
): void {
  vi.mocked(useWorkspaceConciliacion).mockReturnValue({
    data: WORKSPACE,
    isLoading: false,
    isError: false,
    isFetching: false,
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspaceConciliacion>);
}

function renderPage() {
  return render(
    <TooltipProvider>
      <ConciliacionPage />
    </TooltipProvider>,
  );
}

/** Emite los filtros para que la página pase a tener params activos. */
async function consultar(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /emitir filtros/i }));
}

/**
 * Matcher para texto partido entre elementos (el contador es
 * `<span><span>1</span> pendientes</span>`): compara el textContent del
 * elemento y descarta a los ancestros que solo lo contienen.
 */
function textoCompleto(esperado: string) {
  const normalizar = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
  return (_content: string, element: Element | null): boolean => {
    if (element === null) return false;
    if (normalizar(element.textContent) !== esperado) return false;
    return !Array.from(element.children).some(
      (hijo) => normalizar(hijo.textContent) === esperado,
    );
  };
}

/** Los paneles son `<section aria-label>` → role `region`. */
function panel(nombre: RegExp): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasMock.mockReturnValue(true);
  mockWorkspace();
  vi.mocked(useCrearMatch).mockReturnValue({
    mutate: crearMatchMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCrearMatch>);
  vi.mocked(useBorrarMatch).mockReturnValue({
    mutate: borrarMatchMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useBorrarMatch>);
  vi.mocked(useCambiarEstadoMovimiento).mockReturnValue({
    mutate: cambiarEstadoMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCambiarEstadoMovimiento>);
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('ConciliacionPage — estado inicial', () => {
  it('sin filtros aplicados invita a elegir cuenta y rango, sin pedir datos', () => {
    renderPage();

    expect(screen.getByText(/elegí una cuenta bancaria y un rango/i)).toBeInTheDocument();
    expect(vi.mocked(useWorkspaceConciliacion)).toHaveBeenCalledWith(null);
  });

  it('al consultar, pide el workspace con los 3 parámetros', async () => {
    const user = userEvent.setup();
    renderPage();

    await consultar(user);

    expect(vi.mocked(useWorkspaceConciliacion)).toHaveBeenLastCalledWith({
      cuentaBancariaId: 'cb-1',
      desde: '2026-06-01',
      hasta: '2026-06-30',
    });
  });
});

describe('ConciliacionPage — los dos paneles y el resumen', () => {
  it('muestra el resumen de la conciliación', async () => {
    const user = userEvent.setup();
    renderPage();

    await consultar(user);

    expect(screen.getByText(textoCompleto('1 pendientes'))).toBeInTheDocument();
    expect(screen.getByText(textoCompleto('1 conciliados'))).toBeInTheDocument();
    expect(screen.getByText(textoCompleto('0 ignorados'))).toBeInTheDocument();
    expect(screen.getByText(textoCompleto('1 en tránsito'))).toBeInTheDocument();
  });

  it('muestra los movimientos del extracto y las líneas contables en sus paneles', async () => {
    const user = userEvent.setup();
    renderPage();

    await consultar(user);

    expect(
      within(panel(/movimientos del extracto/i)).getByText('Depósito ABC'),
    ).toBeInTheDocument();
    expect(
      within(panel(/líneas contables/i)).getByText('Cobro cliente ABC'),
    ).toBeInTheDocument();
  });

  it('un error de la consulta se muestra inline, sin toast (Anti-F-13)', async () => {
    const user = userEvent.setup();
    mockWorkspace({ data: undefined, isError: true } as never);
    renderPage();

    await consultar(user);

    expect(screen.getByText(/no se pudo cargar la conciliación/i)).toBeInTheDocument();
  });
});

describe('ConciliacionPage — confirmar una sugerencia (REQ-CB-17)', () => {
  it('confirmar envía el ancla completa y la confianza sugerida', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    await user.click(screen.getByRole('button', { name: /^confirmar$/i }));

    expect(crearMatchMutate).toHaveBeenCalledWith({
      movimientoBancarioId: 'mov-1',
      comprobanteId: 'comp-1',
      orden: 1,
      confianzaSugerida: 'ALTA',
    });
  });
});

describe('ConciliacionPage — deshacer e ignorar', () => {
  it('deshacer envía el matchId del vínculo válido (REQ-CB-17)', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    await user.click(screen.getByRole('button', { name: /deshacer/i }));

    expect(borrarMatchMutate).toHaveBeenCalledWith('match-77');
  });

  it('ignorar envía el movimiento y el estado IGNORADO (REQ-CB-18)', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    await user.click(screen.getByRole('button', { name: /^ignorar$/i }));

    expect(cambiarEstadoMutate).toHaveBeenCalledWith({ id: 'mov-1', estado: 'IGNORADO' });
  });
});

describe('ConciliacionPage — match manual', () => {
  it('el botón de conciliar seleccionados arranca deshabilitado', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    expect(screen.getByRole('button', { name: /conciliar seleccionados/i })).toBeDisabled();
  });

  it('con movimiento y línea seleccionados, confirma el par SIN confianza sugerida', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    await user.click(screen.getByRole('radio', { name: /seleccionar movimiento/i }));
    await user.click(screen.getByRole('radio', { name: /seleccionar línea/i }));
    await user.click(screen.getByRole('button', { name: /conciliar seleccionados/i }));

    expect(crearMatchMutate).toHaveBeenCalledWith({
      movimientoBancarioId: 'mov-1',
      comprobanteId: 'comp-1',
      orden: 1,
    });
  });
});

describe('ConciliacionPage — modo consulta (REQ-CB-14 escenario 1, decisión firmada)', () => {
  it('sin permiso de conciliar muestra el banner de solo lectura', async () => {
    const user = userEvent.setup();
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.conciliar');
    renderPage();
    await consultar(user);

    expect(screen.getByText(/modo consulta/i)).toBeInTheDocument();
  });

  it('sin permiso de conciliar NO se renderiza ninguna acción de conciliación', async () => {
    const user = userEvent.setup();
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.conciliar');
    renderPage();
    await consultar(user);

    expect(screen.queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ignorar$/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /conciliar seleccionados/i }),
    ).not.toBeInTheDocument();
  });

  it('sin permiso de conciliar los DATOS se siguen viendo (es modo consulta, no pantalla vacía)', async () => {
    const user = userEvent.setup();
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.conciliar');
    renderPage();
    await consultar(user);

    const movimientos = panel(/movimientos del extracto/i);
    expect(within(movimientos).getByText('Depósito ABC')).toBeInTheDocument();
    expect(within(movimientos).getByText('Conciliado')).toBeInTheDocument();
    expect(
      within(panel(/líneas contables/i)).getByText('Cobro cliente ABC'),
    ).toBeInTheDocument();
  });

  it('CON permiso de conciliar no hay banner y las acciones están', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    expect(screen.queryByText(/modo consulta/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^confirmar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deshacer/i })).toBeInTheDocument();
  });
});

describe('ConciliacionPage — historial de importaciones', () => {
  it('ofrece abrir el drawer de extractos de la cuenta consultada', async () => {
    const user = userEvent.setup();
    renderPage();
    await consultar(user);

    await user.click(screen.getByRole('button', { name: /extractos/i }));

    expect(await screen.findByText('Extractos importados')).toBeInTheDocument();
  });
});
