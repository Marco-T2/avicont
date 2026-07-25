import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InformeConciliacion, InformeConciliacionParams } from '@/types/api';

// ── Mocks ────────────────────────────────────────────────────────────────
vi.mock('../hooks/use-informe-conciliacion', () => ({
  useInformeConciliacion: vi.fn(),
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

/** Emite los filtros para que la página pase a tener params activos. */
async function emitir(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /emitir filtros/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInforme();
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
});
