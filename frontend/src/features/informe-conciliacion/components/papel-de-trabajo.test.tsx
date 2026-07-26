import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { InformeConciliacion } from '@/types/api';

import { PapelDeTrabajo } from './papel-de-trabajo';

// ── Fixture ──────────────────────────────────────────────────────────────
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
    anulado: false,
    motivoAnulacion: null,
    anuladoPorUserId: null,
    anuladoPorNombre: null,
    anuladoEl: null,
    declaradoEl: '2026-07-01T12:00:00.000Z',
  },
  partidas: {
    pendientes: {
      importe: '-200.00',
      detalle: [
        { movimientoId: 'mov-1', fecha: '2026-07-10', importe: '-150.00', asentadoEl: null, anteriorAlArranque: false },
        {
          movimientoId: 'mov-2',
          fecha: '2026-07-31',
          importe: '-50.00',
          asentadoEl: '2026-08-15',
          anteriorAlArranque: false,
        },
      ],
    },
    ignorados: {
      importe: '-10.00',
      detalle: [{ movimientoId: 'mov-3', fecha: '2026-07-12', importe: '-10.00', anteriorAlArranque: false }],
    },
    enTransito: {
      importe: '400.00',
      detalle: [
        {
          comprobanteId: 'comp-1',
          orden: 2,
          fecha: '2026-07-20',
          importe: '250.00',
          registradoPorBancoEl: null,
          anteriorAlArranque: false,
        },
        {
          comprobanteId: 'comp-2',
          orden: 1,
          fecha: '2026-07-28',
          importe: '150.00',
          registradoPorBancoEl: '2026-08-02',
          anteriorAlArranque: false,
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

function partida(nombre: RegExp): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

describe('PapelDeTrabajo — ambos saldos anclan la cuenta (REQ-ICB-01/03)', () => {
  it('arranca en el saldo según extracto al corte', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    expect(screen.getByText(/saldo según extracto al 31\/07\/2026/i)).toBeInTheDocument();
    expect(screen.getByText('12.000,00')).toBeInTheDocument();
  });

  it('termina en el saldo según libros al corte', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    expect(screen.getByText(/saldo según libros al 31\/07\/2026/i)).toBeInTheDocument();
    expect(screen.getByText('12.165,00')).toBeInTheDocument();
  });

  it('sin saldo publicado por el banco lo dice, no muestra un cero falso', () => {
    render(
      <PapelDeTrabajo
        informe={{
          ...INFORME,
          saldoExtracto: null,
          residuo: null,
          confiabilidad: {
            conciliado: false,
            motivos: [{ tipo: 'SIN_SALDO_EXTRACTO' }],
          },
        }}
      />,
    );

    expect(screen.getByText(/sin saldo publicado/i)).toBeInTheDocument();
    expect(screen.getByText(/el residuo no puede determinarse/i)).toBeInTheDocument();
  });
});

describe('PapelDeTrabajo — las cuatro partidas con signo (REQ-ICB-02)', () => {
  it('los pendientes son partida con su importe firmado y su detalle fechado', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    const bloque = partida(/pendientes/i);
    expect(within(bloque).getByText('-200,00')).toBeInTheDocument();
    expect(within(bloque).getByText('10/07/2026')).toBeInTheDocument();
    expect(within(bloque).getByText('-150,00')).toBeInTheDocument();
  });

  it('los IGNORADOS son partida con nombre propio, nunca fusionada', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    const bloque = partida(/ignorados/i);
    expect(within(bloque).getAllByText('-10,00')).toHaveLength(2); // partida + detalle
    expect(within(bloque).getByText(/los libros nunca lo registrarán/i)).toBeInTheDocument();
  });

  it('lo en tránsito es partida con su importe firmado', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    const bloque = partida(/en tránsito/i);
    expect(within(bloque).getByText('400,00')).toBeInTheDocument();
    expect(within(bloque).getByText('250,00')).toBeInTheDocument();
  });

  it('la diferencia de arranque es partida nombrada con fecha y autor (REQ-ICB-04)', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    const bloque = partida(/diferencia de arranque/i);
    expect(within(bloque).getByText('-25,00')).toBeInTheDocument();
    expect(within(bloque).getByText(/30\/06\/2026/)).toBeInTheDocument();
    expect(within(bloque).getByText(/por Marco Tarqui/i)).toBeInTheDocument();
  });
});

describe('PapelDeTrabajo — diferencias que caen después del corte NO son errores (REQ-ICB-07)', () => {
  it('un pendiente con asentadoEl explica que la otra pata existe, posterior al corte', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    expect(
      screen.getByText(/asentado el 15\/08\/2026, posterior al corte/i),
    ).toBeInTheDocument();
  });

  it('una línea en tránsito con registradoPorBancoEl explica que el banco la registró después', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    expect(
      screen.getByText(/el banco lo registró el 02\/08\/2026, posterior al corte/i),
    ).toBeInTheDocument();
  });
});

describe('PapelDeTrabajo — el residuo se destaca, jamás se esconde (REQ-ICB-06)', () => {
  it('con residuo cero la identidad cierra y no hay alerta', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    expect(screen.getByText(/residuo no explicado/i)).toBeInTheDocument();
    expect(screen.getByText('0,00')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un residuo distinto de cero se destaca como alerta con su importe', () => {
    render(
      <PapelDeTrabajo
        informe={{
          ...INFORME,
          residuo: '150.00',
          saldoLibros: '12315.00',
          confiabilidad: {
            conciliado: false,
            motivos: [{ tipo: 'RESIDUO_NO_EXPLICADO', importe: '150.00' }],
          },
        }}
      />,
    );

    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByText('150,00')).toBeInTheDocument();
    expect(within(alerta).getByText(/fuera de lo que este módulo conoce/i)).toBeInTheDocument();
  });
});

describe('PapelDeTrabajo — trazabilidad de insumos (REQ-ICB-08)', () => {
  it('lista las importaciones usadas con su rango y estado de verificación', () => {
    render(<PapelDeTrabajo informe={INFORME} />);

    const insumos = screen.getByRole('region', { name: /insumos/i });
    expect(within(insumos).getByText(/01\/07\/2026/)).toBeInTheDocument();
    expect(within(insumos).getByText('Verificado')).toBeInTheDocument();
  });

  it('con una importación en descuadre el estado se ve igual — el dato no se oculta', () => {
    render(
      <PapelDeTrabajo
        informe={{
          ...INFORME,
          confiabilidad: {
            conciliado: false,
            motivos: [{ tipo: 'DESCUADRE', importacionId: 'imp-2' }],
          },
          insumos: {
            importaciones: [
              {
                id: 'imp-2',
                fechaDesde: '2026-07-01',
                fechaHasta: '2026-07-31',
                estadoVerificacion: 'DESCUADRE',
              },
            ],
          },
        }}
      />,
    );

    expect(
      within(screen.getByRole('region', { name: /insumos/i })).getByText('Descuadre'),
    ).toBeInTheDocument();
  });
});
