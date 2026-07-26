import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { InformeConciliacionResultado } from '../informe-conciliacion.service';

import { toInformeConciliacionResponse } from './informe-conciliacion-response.dto';

const CUENTA = {
  id: 'cb-1',
  alias: 'BancoSol corriente',
  cuentaId: 'cta-banco',
  moneda: 'BOB' as const,
  numeroCuenta: null,
};

function resultadoCompleto(): InformeConciliacionResultado {
  return {
    cuentaBancaria: CUENTA,
    corte: FechaContable.fromIso('2026-07-31'),
    saldoExtracto: Money.of('1200.00'),
    saldoLibros: Money.of('990.00'),
    arranque: {
      id: 'arr-1',
      fecha: FechaContable.fromIso('2026-06-30'),
      saldoExtracto: Money.of('1000'),
      saldoLibros: Money.of('990'),
      diferenciaResidual: Money.of('10'),
      nota: 'migración inicial',
      declaradoPorNombre: 'Marco Tarqui',
      declaradoPorUserId: 'user-1',
      declaradoEl: new Date('2026-07-01T12:00:00.000Z'),
    },
    partidas: {
      pendientes: {
        importe: Money.of('-200'),
        detalle: [
          {
            movimientoId: 'm-1',
            fecha: FechaContable.fromIso('2026-07-10'),
            importe: Money.of('-200'),
            asentadoEl: FechaContable.fromIso('2026-08-15'),
            anteriorAlArranque: false,
          },
        ],
      },
      ignorados: {
        importe: Money.of('-10'),
        detalle: [
          {
            movimientoId: 'm-2',
            fecha: FechaContable.fromIso('2026-07-12'),
            importe: Money.of('-10'),
            anteriorAlArranque: false,
          },
        ],
      },
      enTransito: {
        importe: Money.of('-400'),
        detalle: [
          {
            comprobanteId: 'comp-1',
            orden: 2,
            fecha: FechaContable.fromIso('2026-07-20'),
            importe: Money.of('-400'),
            registradoPorBancoEl: null,
            anteriorAlArranque: false,
          },
        ],
      },
      arranque: { fecha: FechaContable.fromIso('2026-06-30'), importe: Money.of('-10') },
    },
    residuo: Money.of('-0.01'),
    confiabilidad: {
      conciliado: false,
      motivos: [
        { tipo: 'DESCUADRE', importacionId: 'imp-1' },
        {
          tipo: 'HUECO',
          desde: FechaContable.fromIso('2026-07-11'),
          hasta: FechaContable.fromIso('2026-07-19'),
        },
        {
          tipo: 'DISCONTINUIDAD',
          anteriorId: 'imp-a',
          siguienteId: 'imp-b',
          diferencia: Money.of('200'),
        },
        { tipo: 'RESIDUO_NO_EXPLICADO', importe: Money.of('-0.01') },
      ],
    },
    insumos: {
      importaciones: [
        {
          id: 'imp-1',
          fechaDesde: FechaContable.fromIso('2026-07-01'),
          fechaHasta: FechaContable.fromIso('2026-07-31'),
          estadoVerificacion: 'DESCUADRE',
        },
      ],
    },
  };
}

describe('toInformeConciliacionResponse (§4.5: montos como STRING)', () => {
  it('serializa el informe completo: montos con 2 decimales, fechas ISO, signo del arranque intacto', () => {
    const dto = toInformeConciliacionResponse(resultadoCompleto());

    expect(dto.corte).toBe('2026-07-31');
    expect(dto.saldoExtracto).toBe('1200.00');
    expect(dto.saldoLibros).toBe('990.00');

    expect(dto.arranque).toEqual({
      id: 'arr-1',
      fecha: '2026-06-30',
      saldoExtracto: '1000.00',
      saldoLibros: '990.00',
      diferenciaResidual: '10.00',
      nota: 'migración inicial',
      declaradoPorUserId: 'user-1',
      // El acto viaja ATRIBUIDO a una persona (REQ-ICB-04), no a un UUID.
      declaradoPorNombre: 'Marco Tarqui',
      declaradoEl: '2026-07-01T12:00:00.000Z',
    });

    // La partida de arranque conserva la contribución −residual: si el DTO
    // invirtiera el signo, la partida mentiría.
    expect(dto.partidas?.arranque).toEqual({ fecha: '2026-06-30', importe: '-10.00' });
    expect(dto.partidas?.pendientes.importe).toBe('-200.00');
    expect(dto.partidas?.pendientes.detalle).toEqual([
      {
        movimientoId: 'm-1',
        fecha: '2026-07-10',
        importe: '-200.00',
        asentadoEl: '2026-08-15',
        anteriorAlArranque: false,
      },
    ]);
    expect(dto.partidas?.ignorados.detalle).toEqual([
      { movimientoId: 'm-2', fecha: '2026-07-12', importe: '-10.00', anteriorAlArranque: false },
    ]);
    expect(dto.partidas?.enTransito.detalle).toEqual([
      {
        comprobanteId: 'comp-1',
        orden: 2,
        fecha: '2026-07-20',
        importe: '-400.00',
        registradoPorBancoEl: null,
        anteriorAlArranque: false,
      },
    ]);

    // El polvo de Bs 0.01 se muestra tal cual es (REQ-ICB-06).
    expect(dto.residuo).toBe('-0.01');

    expect(dto.confiabilidad.conciliado).toBe(false);
    expect(dto.confiabilidad.motivos).toEqual([
      { tipo: 'DESCUADRE', importacionId: 'imp-1' },
      { tipo: 'HUECO', desde: '2026-07-11', hasta: '2026-07-19' },
      { tipo: 'DISCONTINUIDAD', anteriorId: 'imp-a', siguienteId: 'imp-b', diferencia: '200.00' },
      { tipo: 'RESIDUO_NO_EXPLICADO', importe: '-0.01' },
    ]);

    expect(dto.insumos.importaciones).toEqual([
      {
        id: 'imp-1',
        fechaDesde: '2026-07-01',
        fechaHasta: '2026-07-31',
        estadoVerificacion: 'DESCUADRE',
      },
    ]);
  });

  it('informe ABSTENIDO (sin arranque): nulls explícitos y motivo SIN_ARRANQUE', () => {
    const dto = toInformeConciliacionResponse({
      cuentaBancaria: CUENTA,
      corte: FechaContable.fromIso('2026-07-31'),
      saldoExtracto: null,
      saldoLibros: Money.of('500.00'),
      arranque: null,
      partidas: null,
      residuo: null,
      confiabilidad: {
        conciliado: false,
        motivos: [{ tipo: 'SIN_ARRANQUE' }, { tipo: 'SIN_SALDO_EXTRACTO' }],
      },
      insumos: { importaciones: [] },
    });

    expect(dto.saldoExtracto).toBeNull();
    expect(dto.saldoLibros).toBe('500.00');
    expect(dto.arranque).toBeNull();
    expect(dto.partidas).toBeNull();
    expect(dto.residuo).toBeNull();
    expect(dto.confiabilidad.motivos).toEqual([
      { tipo: 'SIN_ARRANQUE' },
      { tipo: 'SIN_SALDO_EXTRACTO' },
    ]);
  });
});
