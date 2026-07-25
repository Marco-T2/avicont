import { randomUUID } from 'node:crypto';

import type { CuentaBancaria, MatchConciliacion, MovimientoBancario } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { LineaCuentaRow } from '@/comprobantes/ports/lineas-cuenta-reader.port';
import type { LineasCuentaReaderPort } from '@/comprobantes/ports/lineas-cuenta-reader.port';

import { normalizarDescripcion } from './domain/normalizar-descripcion';
import type { MatchConciliacionService } from './match-conciliacion.service';
import { MovimientosBancariosService } from './movimientos-bancarios.service';
import type { CuentaBancariaRepositoryPort } from './ports/cuenta-bancaria.repository.port';
import type { MatchConciliacionRepositoryPort } from './ports/match-conciliacion.repository.port';
import type { MovimientoBancarioRepositoryPort } from './ports/movimiento-bancario.repository.port';

const TENANT = 'tenant-1';

function movRow(overrides: Partial<MovimientoBancario> = {}): MovimientoBancario {
  return {
    id: randomUUID(),
    organizationId: TENANT,
    cuentaBancariaId: 'cb-1',
    importacionId: 'imp-1',
    fecha: new Date('2026-06-10T00:00:00.000Z'),
    hora: null,
    monto: new Prisma.Decimal('1250.50'),
    tipo: 'DEBITO',
    moneda: 'BOB',
    descripcion: 'Pago QR',
    descripcionNormalizada: 'PAGO QR',
    referencia: null,
    saldo: null,
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
    ordinalDia: 0,
    ordenFisico: null,
    hashDedup: randomUUID(),
    estado: 'PENDIENTE',
    createdAt: new Date('2026-06-10T12:00:00.000Z'),
    updatedAt: new Date('2026-06-10T12:00:00.000Z'),
    ...overrides,
  } as MovimientoBancario;
}

function matchRow(
  movimientoBancarioId: string,
  overrides: Partial<MatchConciliacion> = {},
): MatchConciliacion {
  return {
    id: randomUUID(),
    organizationId: TENANT,
    movimientoBancarioId,
    comprobanteId: 'comp-1',
    orden: 1,
    snapshotCuentaId: 'cta-1',
    snapshotMonto: new Prisma.Decimal('1250.50'),
    snapshotTipo: 'DEBITO',
    snapshotMoneda: 'BOB',
    snapshotFecha: new Date('2026-06-10T00:00:00.000Z'),
    confianzaSugerida: null,
    conciliadoPorUserId: 'user-1',
    createdAt: new Date('2026-06-10T12:00:00.000Z'),
    ...overrides,
  } as MatchConciliacion;
}

function lineaSana(comprobanteId: string, orden: number): LineaCuentaRow {
  return {
    comprobanteId,
    orden,
    cuentaId: 'cta-1',
    fechaContable: new Date('2026-06-10T00:00:00.000Z'),
    moneda: 'BOB',
    debito: new Prisma.Decimal('1250.50'),
    credito: new Prisma.Decimal(0),
    debitoBob: new Prisma.Decimal('1250.50'),
    creditoBob: new Prisma.Decimal(0),
    glosa: 'Glosa',
    glosaLinea: null,
    numeroComprobante: null,
    estado: 'CONTABILIZADO',
    anulado: false,
  };
}

function cuentaBancariaRow(overrides: Partial<CuentaBancaria> = {}): CuentaBancaria {
  return {
    id: randomUUID(),
    organizationId: TENANT,
    cuentaId: randomUUID(),
    alias: 'Cuenta corriente',
    perfilExtracto: 'BANCOSOL_XLSX',
    numeroCuenta: null,
    moneda: 'BOB',
    activa: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CuentaBancaria;
}

describe('MovimientosBancariosService.listar (REQ-VMB-01..09/11/13)', () => {
  let movRepo: {
    listarCrossCuenta: jest.Mock;
    contarCrossCuenta: jest.Mock;
    totalesPorMoneda: jest.Mock;
    listarIdsConMatch: jest.Mock;
    saldosVigentes: jest.Mock;
    listarPorIds: jest.Mock;
    actualizarEstado: jest.Mock;
    findById: jest.Mock;
  };
  let matchRepo: { listarPorMovimientos: jest.Mock };
  let lineasCuenta: { listarPorAnclas: jest.Mock };
  let cuentasBancarias: { listar: jest.Mock };
  let service: MovimientosBancariosService;

  const CONSULTA_BASE = {
    desde: new Date('2026-06-01T00:00:00.000Z'),
    hasta: new Date('2026-06-30T00:00:00.000Z'),
    page: 1,
    limit: 50,
  };

  beforeEach(() => {
    movRepo = {
      listarCrossCuenta: jest.fn().mockResolvedValue([]),
      contarCrossCuenta: jest.fn().mockResolvedValue(0),
      totalesPorMoneda: jest.fn().mockResolvedValue([]),
      listarIdsConMatch: jest.fn().mockResolvedValue([]),
      saldosVigentes: jest.fn().mockResolvedValue([]),
      listarPorIds: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn(),
      findById: jest.fn(),
    };
    matchRepo = { listarPorMovimientos: jest.fn().mockResolvedValue([]) };
    lineasCuenta = { listarPorAnclas: jest.fn().mockResolvedValue([]) };
    cuentasBancarias = { listar: jest.fn().mockResolvedValue({ items: [], total: 0 }) };

    service = new MovimientosBancariosService(
      movRepo as unknown as MovimientoBancarioRepositoryPort,
      {} as unknown as MatchConciliacionService,
      matchRepo as unknown as MatchConciliacionRepositoryPort,
      lineasCuenta as unknown as LineasCuentaReaderPort,
      cuentasBancarias as unknown as CuentaBancariaRepositoryPort,
    );
  });

  it('rango invertido → CONCILIACION_LISTADO_RANGO_INVALIDO (422) y NINGÚN port tocado', async () => {
    await expect(
      service.listar(TENANT, {
        ...CONSULTA_BASE,
        desde: new Date('2026-06-30T00:00:00.000Z'),
        hasta: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_LISTADO_RANGO_INVALIDO' });

    expect(movRepo.listarCrossCuenta).not.toHaveBeenCalled();
    expect(movRepo.contarCrossCuenta).not.toHaveBeenCalled();
  });

  it('normaliza la glosa con normalizarDescripcion antes de pasarla al port (D4)', async () => {
    await service.listar(TENANT, { ...CONSULTA_BASE, glosa: 'depósito' });

    const esperado = normalizarDescripcion('depósito');
    expect(esperado).toBe('DEPOSITO'); // uppercase, sin diacríticos — REQ-VMB-03
    expect(movRepo.listarCrossCuenta).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ glosaNormalizada: esperado }),
      { skip: 0, take: 50 },
    );
  });

  it('montos string → Decimal en los filtros; page/limit → skip/take', async () => {
    await service.listar(TENANT, {
      ...CONSULTA_BASE,
      page: 3,
      limit: 20,
      montoDesde: '100.00',
      montoHasta: '500.50',
    });

    expect(movRepo.listarCrossCuenta).toHaveBeenCalledTimes(1);
    const [, filtros, paginacion] = movRepo.listarCrossCuenta.mock.calls[0] as [
      string,
      { montoDesde: Prisma.Decimal; montoHasta: Prisma.Decimal },
      { skip: number; take: number },
    ];
    expect(filtros.montoDesde.toFixed(2)).toBe('100.00');
    expect(filtros.montoHasta.toFixed(2)).toBe('500.50');
    expect(paginacion).toEqual({ skip: 40, take: 20 });
  });

  it('deriva estadoEfectivo por página: válido ⇒ CONCILIADO, roto ⇒ PENDIENTE con motivo, IGNORADO se respeta — y la lectura NUNCA escribe (REQ-VMB-06)', async () => {
    const m1 = movRow({ id: 'mov-1', estado: 'CONCILIADO', ordenFisico: 3 });
    const m2 = movRow({ id: 'mov-2', estado: 'CONCILIADO' });
    const m3 = movRow({ id: 'mov-3', estado: 'IGNORADO' });
    movRepo.listarCrossCuenta.mockResolvedValue([m1, m2, m3]);
    movRepo.contarCrossCuenta.mockResolvedValue(3);
    matchRepo.listarPorMovimientos.mockResolvedValue([
      matchRow('mov-1', { comprobanteId: 'comp-A', orden: 1 }),
      matchRow('mov-2', { comprobanteId: 'comp-B', orden: 2 }),
    ]);
    // Solo el ancla de mov-1 resuelve — la de mov-2 no existe más.
    lineasCuenta.listarPorAnclas.mockResolvedValue([lineaSana('comp-A', 1)]);

    const resultado = await service.listar(TENANT, CONSULTA_BASE);

    expect(resultado.total).toBe(3);
    const [v1, v2, v3] = resultado.movimientos;
    expect(v1).toMatchObject({
      id: 'mov-1',
      estadoEfectivo: 'CONCILIADO',
      cuentaBancariaId: 'cb-1',
      ordenFisico: 3,
      fecha: '2026-06-10',
      monto: '1250.50',
    });
    expect(v1!.vinculo).toMatchObject({ comprobanteId: 'comp-A', orden: 1, roto: null });
    expect(v2).toMatchObject({ id: 'mov-2', estadoEfectivo: 'PENDIENTE' });
    expect(v2!.vinculo).toMatchObject({ roto: 'LINEA_INEXISTENTE' });
    expect(v3).toMatchObject({ id: 'mov-3', estadoEfectivo: 'IGNORADO', vinculo: null });

    // Una lectura NUNCA escribe: ni estado, ni matches (REQ-VMB-06).
    expect(movRepo.actualizarEstado).not.toHaveBeenCalled();
  });

  it('sin filtro estado: auditoría NO aplicada y cero verificación extra (REQ-VMB-07)', async () => {
    const resultado = await service.listar(TENANT, CONSULTA_BASE);

    expect(resultado.auditoriaVinculos).toEqual({ aplicada: false, total: 0, rotos: [] });
    expect(movRepo.listarIdsConMatch).not.toHaveBeenCalled();
  });

  it('con filtro estado: audita el rango SIN el filtro de estado, en chunks, cap 100 + total real (REQ-VMB-07)', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `mov-${String(i).padStart(3, '0')}`);
    movRepo.listarIdsConMatch.mockResolvedValue(ids.map((id) => ({ id })));
    matchRepo.listarPorMovimientos.mockImplementation((_t: string, movIds: readonly string[]) =>
      Promise.resolve(movIds.map((id) => matchRow(id, { comprobanteId: `comp-${id}`, orden: 1 }))),
    );
    // Ninguna ancla resuelve ⇒ los 250 vínculos están rotos (LINEA_INEXISTENTE)
    lineasCuenta.listarPorAnclas.mockResolvedValue([]);
    movRepo.listarPorIds.mockImplementation((_t: string, movIds: readonly string[]) =>
      Promise.resolve(movIds.map((id) => movRow({ id }))),
    );

    const resultado = await service.listar(TENANT, { ...CONSULTA_BASE, estado: 'PENDIENTE' });

    // El listado de ids va SIN estado — si lo llevara, el filtro escondería rotos.
    expect(movRepo.listarIdsConMatch).toHaveBeenCalledWith(
      TENANT,
      expect.not.objectContaining({ estado: expect.anything() }),
    );

    expect(resultado.auditoriaVinculos.aplicada).toBe(true);
    expect(resultado.auditoriaVinculos.total).toBe(250);
    expect(resultado.auditoriaVinculos.rotos).toHaveLength(100);
    expect(resultado.auditoriaVinculos.rotos[0]).toMatchObject({
      movimientoBancarioId: 'mov-000',
      cuentaBancariaId: 'cb-1',
      fecha: '2026-06-10',
      monto: '1250.50',
      moneda: 'BOB',
      descripcion: 'Pago QR',
      motivo: 'LINEA_INEXISTENTE',
    });

    // Chunks: 250 anclas → llamadas de a lo sumo 200 (2 llamadas: 200 + 50).
    const tamaniosAnclas = lineasCuenta.listarPorAnclas.mock.calls.map(
      (c) => (c[1] as unknown[]).length,
    );
    expect(tamaniosAnclas).toEqual([200, 50]);

    // El detalle solo se busca para los 100 capados.
    expect(movRepo.listarPorIds).toHaveBeenCalledTimes(1);
    expect((movRepo.listarPorIds.mock.calls[0]![1] as string[]).length).toBe(100);
  });

  it('merge de saldos: cuenta sin movimientos ⇒ null/null; saldo null se respeta con su fecha (REQ-VMB-08/09)', async () => {
    const cb1 = cuentaBancariaRow({ id: 'cb-1', alias: 'BancoSol BOB', moneda: 'BOB' });
    const cb2 = cuentaBancariaRow({ id: 'cb-2', alias: 'Unión BOB', moneda: 'BOB' });
    const cb3 = cuentaBancariaRow({ id: 'cb-3', alias: 'BCP USD', moneda: 'USD' });
    cuentasBancarias.listar.mockResolvedValue({ items: [cb1, cb2, cb3], total: 3 });
    movRepo.saldosVigentes.mockResolvedValue([
      {
        cuentaBancariaId: 'cb-1',
        fecha: new Date('2026-06-10T00:00:00.000Z'),
        saldo: new Prisma.Decimal('1500.00'),
      },
      { cuentaBancariaId: 'cb-2', fecha: new Date('2026-06-12T00:00:00.000Z'), saldo: null },
    ]);

    const resultado = await service.listar(TENANT, CONSULTA_BASE);

    expect(movRepo.saldosVigentes).toHaveBeenCalledWith(TENANT, CONSULTA_BASE.hasta);
    expect(resultado.saldos).toEqual([
      {
        cuentaBancariaId: 'cb-1',
        alias: 'BancoSol BOB',
        moneda: 'BOB',
        saldo: '1500.00',
        fechaUltimoMovimiento: '2026-06-10',
      },
      {
        cuentaBancariaId: 'cb-2',
        alias: 'Unión BOB',
        moneda: 'BOB',
        saldo: null,
        fechaUltimoMovimiento: '2026-06-12',
      },
      {
        cuentaBancariaId: 'cb-3',
        alias: 'BCP USD',
        moneda: 'USD',
        saldo: null,
        fechaUltimoMovimiento: null,
      },
    ]);
  });

  it('totales por moneda SIN conversión a BOB: débitos/créditos/cantidad propios, montos string (REQ-VMB-11)', async () => {
    movRepo.totalesPorMoneda.mockResolvedValue([
      { moneda: 'BOB', tipo: 'DEBITO', total: new Prisma.Decimal('300.50'), cantidad: 2 },
      { moneda: 'BOB', tipo: 'CREDITO', total: new Prisma.Decimal('50.00'), cantidad: 1 },
      { moneda: 'USD', tipo: 'DEBITO', total: new Prisma.Decimal('10.00'), cantidad: 1 },
    ]);

    const resultado = await service.listar(TENANT, CONSULTA_BASE);

    expect(resultado.totales).toEqual([
      { moneda: 'BOB', totalDebitos: '300.50', totalCreditos: '50.00', cantidad: 3 },
      { moneda: 'USD', totalDebitos: '10.00', totalCreditos: '0.00', cantidad: 1 },
    ]);
  });

  it('eco del rango como YYYY-MM-DD y paginación en la respuesta (§4.6)', async () => {
    const resultado = await service.listar(TENANT, { ...CONSULTA_BASE, page: 2, limit: 25 });

    expect(resultado.desde).toBe('2026-06-01');
    expect(resultado.hasta).toBe('2026-06-30');
    expect(resultado.page).toBe(2);
    expect(resultado.limit).toBe(25);
  });

  // ============================================================
  // Agregado de saldos por moneda (REQ-VMB-10) — el backend suma
  // con Money/decimal.js; el frontend presenta sin recalcular.
  // ============================================================

  describe('saldosPorMoneda — agregado por moneda de la franja de saldos (REQ-VMB-10)', () => {
    function vigente(cuentaBancariaId: string, saldo: string | null, dia = 10) {
      return {
        cuentaBancariaId,
        fecha: new Date(`2026-06-${String(dia).padStart(2, '0')}T00:00:00.000Z`),
        saldo: saldo === null ? null : new Prisma.Decimal(saldo),
      };
    }

    it('suma solo cuentas de la MISMA moneda, en subtotales separados — sin conversión ni total combinado', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-b', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-c', moneda: 'USD' }),
        ],
        total: 3,
      });
      movRepo.saldosVigentes.mockResolvedValue([
        vigente('cb-a', '1500.00'),
        vigente('cb-b', '250.50'),
        vigente('cb-c', '100.00'),
      ]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '1750.50', cuentasSumadas: 2, cuentasSinSaldo: 0 },
        { moneda: 'USD', suma: '100.00', cuentasSumadas: 1, cuentasSinSaldo: 0 },
      ]);
    });

    it('cuenta con saldo null se EXCLUYE de la suma (nunca cuenta como 0) y se contabiliza aparte', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-b', moneda: 'BOB' }),
        ],
        total: 2,
      });
      // cb-b tiene movimiento pero el banco no publica saldo (null honesto).
      movRepo.saldosVigentes.mockResolvedValue([
        vigente('cb-a', '1500.00'),
        vigente('cb-b', null, 20),
      ]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '1500.00', cuentasSumadas: 1, cuentasSinSaldo: 1 },
      ]);
    });

    it('cuenta sin movimientos (fuera de saldosVigentes) también cuenta como sin saldo', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-n', moneda: 'BOB' }),
        ],
        total: 2,
      });
      movRepo.saldosVigentes.mockResolvedValue([vigente('cb-a', '900.00')]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '900.00', cuentasSumadas: 1, cuentasSinSaldo: 1 },
      ]);
    });

    it('todas las cuentas de una moneda sin saldo → suma null, JAMÁS "0.00"', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-b', moneda: 'BOB' }),
        ],
        total: 2,
      });
      movRepo.saldosVigentes.mockResolvedValue([vigente('cb-a', null)]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: null, cuentasSumadas: 0, cuentasSinSaldo: 2 },
      ]);
    });

    it('sin cuentas → sin subtotales', async () => {
      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([]);
    });

    it('0.10 + 0.20 = 0.30 exacto — la suma va por decimal.js, nunca float IEEE-754 (§4.5)', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-b', moneda: 'BOB' }),
        ],
        total: 2,
      });
      movRepo.saldosVigentes.mockResolvedValue([vigente('cb-a', '0.10'), vigente('cb-b', '0.20')]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '0.30', cuentasSumadas: 2, cuentasSinSaldo: 0 },
      ]);
    });

    it('normaliza saldos sin decimales o con 1 decimal a 2 decimales', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' }),
          cuentaBancariaRow({ id: 'cb-b', moneda: 'BOB' }),
        ],
        total: 2,
      });
      movRepo.saldosVigentes.mockResolvedValue([vigente('cb-a', '1000'), vigente('cb-b', '0.5')]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '1000.50', cuentasSumadas: 2, cuentasSinSaldo: 0 },
      ]);
    });

    it('una sola cuenta vuelve con el saldo normalizado a 2 decimales', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [cuentaBancariaRow({ id: 'cb-a', moneda: 'BOB' })],
        total: 1,
      });
      movRepo.saldosVigentes.mockResolvedValue([vigente('cb-a', '99.9')]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda).toEqual([
        { moneda: 'BOB', suma: '99.90', cuentasSumadas: 1, cuentasSinSaldo: 0 },
      ]);
    });

    it('el orden de las monedas respeta la primera aparición en la franja saldos (no alfabético)', async () => {
      cuentasBancarias.listar.mockResolvedValue({
        items: [
          cuentaBancariaRow({ id: 'cb-usd', moneda: 'USD' }),
          cuentaBancariaRow({ id: 'cb-bob', moneda: 'BOB' }),
        ],
        total: 2,
      });
      movRepo.saldosVigentes.mockResolvedValue([
        vigente('cb-usd', '200.00'),
        vigente('cb-bob', '1000.00'),
      ]);

      const resultado = await service.listar(TENANT, CONSULTA_BASE);

      expect(resultado.saldosPorMoneda.map((r) => r.moneda)).toEqual(['USD', 'BOB']);
    });
  });
});
