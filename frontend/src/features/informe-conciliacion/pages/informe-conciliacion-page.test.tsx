import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type {
  ArranqueAplicado,
  InformeConciliacion,
  InformeConciliacionParams,
} from '@/types/api';

// ── Mocks ────────────────────────────────────────────────────────────────
vi.mock('../hooks/use-informe-conciliacion', () => ({
  useInformeConciliacion: vi.fn(),
}));

vi.mock('../hooks/use-historial-arranques', () => ({
  useHistorialArranques: vi.fn(),
}));

vi.mock('../hooks/use-declarar-arranque', () => ({
  useDeclararArranque: vi.fn(),
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

// Los filtros se reemplazan por un botón que emite params deterministas: el
// foco de este test es la ORQUESTACIÓN de la página, no el form de filtros.
vi.mock('../components/informe-filtros', () => ({
  InformeFiltros: (props: { onEmitir: (p: InformeConciliacionParams) => void }) => (
    <button
      type="button"
      onClick={() => props.onEmitir({ cuentaBancariaId: 'cb-1', corte: '2026-07-31' })}
    >
      Emitir filtros
    </button>
  ),
}));

import { useDeclararArranque } from '../hooks/use-declarar-arranque';
import { useHistorialArranques } from '../hooks/use-historial-arranques';
import { useInformeConciliacion } from '../hooks/use-informe-conciliacion';

import { InformeConciliacionPage } from './informe-conciliacion-page';

// ── Fixtures ─────────────────────────────────────────────────────────────
// La identidad CIERRA: 12.000 − 200 − 10 + 400 − 25 + 0 = 12.165.
const INFORME: InformeConciliacion = {
  cuentaBancaria: {
    id: 'cb-1',
    alias: 'Cuenta corriente BancoSol',
    cuentaId: 'cuenta-1',
    moneda: 'BOB',
    numeroCuenta: '1191959-000-001',
  },
  corte: '2026-07-31',
  saldoExtracto: '12000.00',
  saldoLibros: '12165.00',
  arranque: {
    id: 'arr-1',
    fecha: '2026-06-30',
    saldoExtracto: '1000.00',
    saldoLibros: '975.00',
    diferenciaResidual: '25.00',
    nota: null,
    declaradoPorUserId: 'user-9',
    declaradoPorNombre: 'Marco Tarqui',
    declaradoEl: '2026-07-01T12:00:00.000Z',
  },
  partidas: {
    pendientes: {
      importe: '-200.00',
      detalle: [
        { movimientoId: 'mov-1', fecha: '2026-07-10', importe: '-200.00', asentadoEl: null },
      ],
    },
    ignorados: {
      importe: '-10.00',
      detalle: [{ movimientoId: 'mov-3', fecha: '2026-07-12', importe: '-10.00' }],
    },
    enTransito: {
      importe: '400.00',
      detalle: [
        {
          comprobanteId: 'comp-1',
          orden: 2,
          fecha: '2026-07-20',
          importe: '400.00',
          registradoPorBancoEl: null,
        },
      ],
    },
    arranque: { fecha: '2026-06-30', importe: '-25.00' },
  },
  residuo: '0.00',
  confiabilidad: { conciliado: true, motivos: [] },
  insumos: {
    importaciones: [
      {
        id: 'imp-1',
        fechaDesde: '2026-07-01',
        fechaHasta: '2026-07-31',
        estadoVerificacion: 'VERIFICADO',
      },
    ],
  },
};

// Abstención (REQ-ICB-04/05): 200 con saldos presentes y puente en null.
const INFORME_ABSTENIDO: InformeConciliacion = {
  ...INFORME,
  saldoLibros: '11000.00',
  arranque: null,
  partidas: null,
  residuo: null,
  confiabilidad: {
    conciliado: false,
    motivos: [
      { tipo: 'SIN_ARRANQUE' },
      { tipo: 'HUECO', desde: '2026-07-11', hasta: '2026-07-19' },
    ],
  },
};

// Historial ordenado por el backend: `fecha DESC, createdAt DESC` (D8).
const HISTORIAL: ArranqueAplicado[] = [
  {
    id: 'arr-dic',
    fecha: '2026-12-31',
    saldoExtracto: '2000.00',
    saldoLibros: '2000.00',
    diferenciaResidual: '0.00',
    nota: null,
    declaradoPorUserId: 'user-1',
    declaradoPorNombre: 'Ana Quispe',
    declaradoEl: '2027-01-05T10:00:00.000Z',
  },
  {
    id: 'arr-jun',
    fecha: '2026-06-30',
    saldoExtracto: '1000.00',
    saldoLibros: '975.00',
    diferenciaResidual: '25.00',
    nota: null,
    declaradoPorUserId: 'user-9',
    declaradoPorNombre: 'Marco Tarqui',
    declaradoEl: '2026-07-01T12:00:00.000Z',
  },
];

function mockInforme(
  overrides: Partial<ReturnType<typeof useInformeConciliacion>> = {},
): void {
  vi.mocked(useInformeConciliacion).mockReturnValue({
    data: undefined,
    isError: false,
    isFetching: false,
    ...overrides,
  } as unknown as ReturnType<typeof useInformeConciliacion>);
}

function mockHistorial(data: ArranqueAplicado[] | undefined = undefined): void {
  vi.mocked(useHistorialArranques).mockReturnValue({
    data,
    isLoading: false,
  } as unknown as ReturnType<typeof useHistorialArranques>);
}

/** Emite los filtros para que la página pase a tener params activos. */
async function emitir(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /emitir filtros/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  hasMock.mockReturnValue(true);
  mockInforme();
  mockHistorial();
  vi.mocked(useDeclararArranque).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeclararArranque>);
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('InformeConciliacionPage (task 3.9 — contenedor de la ruta)', () => {
  it('renderiza el header canónico de la página', () => {
    render(<InformeConciliacionPage />);
    expect(
      screen.getByRole('heading', { name: 'Informe de conciliación' }),
    ).toBeInTheDocument();
  });

  it('sin cuenta ni corte elegidos muestra el empty state que guía la emisión', () => {
    render(<InformeConciliacionPage />);
    expect(
      screen.getByText(/elegí una cuenta bancaria y una fecha de corte/i),
    ).toBeInTheDocument();
  });
});

describe('InformeConciliacionPage — orquestación (task 3.10)', () => {
  it('sin emitir no pide el informe: el hook recibe null', () => {
    render(<InformeConciliacionPage />);

    expect(vi.mocked(useInformeConciliacion)).toHaveBeenCalledWith(null);
  });

  it('al emitir pide el informe con cuenta y corte', async () => {
    const user = userEvent.setup();
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(vi.mocked(useInformeConciliacion)).toHaveBeenLastCalledWith({
      cuentaBancariaId: 'cb-1',
      corte: '2026-07-31',
    });
  });

  it('con informe emitido monta el papel de trabajo con ambos saldos', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(screen.getByRole('region', { name: /papel de trabajo/i })).toBeInTheDocument();
    expect(screen.getByText('12.000,00')).toBeInTheDocument();
    expect(screen.getByText('12.165,00')).toBeInTheDocument();
  });

  it('con informe conciliado muestra la calificación afirmativa', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(screen.getByRole('status')).toHaveTextContent(/conciliado/i);
  });

  it('un error de la consulta se muestra inline, sin toast (Anti-F-13)', async () => {
    const user = userEvent.setup();
    mockInforme({ data: undefined, isError: true } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(screen.getByText(/no se pudo emitir el informe/i)).toBeInTheDocument();
  });
});

describe('InformeConciliacionPage — abstención visible (REQ-ICB-04/05)', () => {
  it('sin arranque declarado explica la abstención en lugar del papel — no es un error', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME_ABSTENIDO } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(screen.getByText(/falta declarar el punto de arranque/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /papel de trabajo/i }),
    ).not.toBeInTheDocument();
    // Los saldos presentes se muestran igual: lo que se retiene es la conclusión.
    expect(screen.getByText('12.000,00')).toBeInTheDocument();
    expect(screen.getByText('11.000,00')).toBeInTheDocument();
  });

  it('los demás motivos de confiabilidad se muestran; SIN_ARRANQUE no se repite en el banner', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME_ABSTENIDO } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(
      screen.getByText(/falta extracto entre el 11\/07\/2026 y el 19\/07\/2026/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no hay punto de arranque declarado:/i),
    ).not.toBeInTheDocument();
  });

  it('la abstención ofrece declarar el arranque desde el propio aviso', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME_ABSTENIDO } as never);
    render(<InformeConciliacionPage />);

    await emitir(user);

    // Dos accesos a la misma acción: el aviso de abstención y el header del historial.
    expect(screen.getAllByRole('button', { name: /declarar arranque/i })).toHaveLength(2);
  });
});

describe('InformeConciliacionPage — historial de arranques (task 3.11, D8)', () => {
  it('tras emitir pide el historial de la cuenta y lo muestra señalando cuál aplica', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME } as never);
    mockHistorial(HISTORIAL);
    render(<InformeConciliacionPage />);

    await emitir(user);

    expect(vi.mocked(useHistorialArranques)).toHaveBeenLastCalledWith('cb-1');

    const historial = screen.getByRole('region', { name: /declaraciones de arranque/i });
    // Ambas declaraciones visibles (append-only) y la vigente al corte señalada.
    expect(within(historial).getByText('31/12/2026')).toBeInTheDocument();
    expect(within(historial).getByText('30/06/2026')).toBeInTheDocument();
    expect(within(historial).getByText(/aplica a este corte/i)).toBeInTheDocument();
  });

  it('con permiso de conciliar, Declarar arranque abre el formulario de declaración', async () => {
    const user = userEvent.setup();
    mockInforme({ data: INFORME } as never);
    mockHistorial(HISTORIAL);
    render(<InformeConciliacionPage />);

    await emitir(user);
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(await screen.findByText('Declarar punto de arranque')).toBeInTheDocument();
  });

  it('con read pero sin conciliar: ve el informe y el historial, y el botón queda deshabilitado', async () => {
    const user = userEvent.setup();
    hasMock.mockImplementation((p: string) => p !== 'contabilidad.conciliacion.conciliar');
    mockInforme({ data: INFORME } as never);
    mockHistorial(HISTORIAL);
    render(
      <TooltipProvider>
        <InformeConciliacionPage />
      </TooltipProvider>,
    );

    await emitir(user);

    // El botón existe pero está deshabilitado (afordancia honesta, §14.7).
    expect(screen.getByRole('button', { name: /declarar arranque/i })).toBeDisabled();
    // Los datos se siguen viendo: quien solo mira, mira todo.
    expect(screen.getByRole('region', { name: /papel de trabajo/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /declaraciones de arranque/i })).getByText(
        '30/06/2026',
      ),
    ).toBeInTheDocument();
  });
});
