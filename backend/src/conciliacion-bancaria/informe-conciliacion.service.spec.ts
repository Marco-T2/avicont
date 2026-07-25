import { randomUUID } from 'node:crypto';

import type { ArranqueConciliado, CuentaBancaria, MovimientoBancario } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { LineaCuentaRow } from '@/comprobantes/ports/lineas-cuenta-reader.port';
import type { LineasCuentaReaderPort } from '@/comprobantes/ports/lineas-cuenta-reader.port';

import type { CuentasBancariasService } from './cuentas-bancarias.service';
import { InformeConciliacionService } from './informe-conciliacion.service';
import type { ArranqueConciliadoRepositoryPort } from './ports/arranque-conciliado.repository.port';
import type {
  CoberturaImportacionRow,
  ImportacionExtractoRepositoryPort,
} from './ports/importacion-extracto.repository.port';
import type { MatchConciliacionRepositoryPort } from './ports/match-conciliacion.repository.port';
import type { MovimientoBancarioRepositoryPort } from './ports/movimiento-bancario.repository.port';

const TENANT = 'tenant-1';
const CB_ID = 'cb-1';
const CUENTA_PLAN_ID = 'cta-banco';
const CORTE = new Date('2026-07-31T00:00:00.000Z');

// ============================================================
// Factories
// ============================================================

function cuentaBancariaRow(overrides: Partial<CuentaBancaria> = {}): CuentaBancaria {
  return {
    id: CB_ID,
    organizationId: TENANT,
    cuentaId: CUENTA_PLAN_ID,
    alias: 'BancoSol corriente',
    perfilExtracto: 'BANCOSOL_XLSX',
    numeroCuenta: null,
    moneda: 'BOB',
    activa: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CuentaBancaria;
}

function arranqueRow(overrides: Partial<ArranqueConciliado> = {}): ArranqueConciliado {
  return {
    id: 'arr-1',
    organizationId: TENANT,
    cuentaBancariaId: CB_ID,
    fecha: new Date('2026-06-30T00:00:00.000Z'),
    saldoExtracto: new Prisma.Decimal('1000.00'),
    saldoLibros: new Prisma.Decimal('990.00'),
    diferenciaResidual: new Prisma.Decimal('10.00'),
    nota: null,
    declaradoPorUserId: 'user-1',
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  } as ArranqueConciliado;
}

function movRow(overrides: Partial<MovimientoBancario> = {}): MovimientoBancario {
  return {
    id: randomUUID(),
    organizationId: TENANT,
    cuentaBancariaId: CB_ID,
    importacionId: 'imp-1',
    fecha: new Date('2026-07-10T00:00:00.000Z'),
    hora: null,
    monto: new Prisma.Decimal('200.00'),
    tipo: 'CREDITO',
    moneda: 'BOB',
    descripcion: 'DEPOSITO',
    descripcionNormalizada: 'DEPOSITO',
    referencia: null,
    saldo: null,
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
    ordinalDia: 0,
    ordenFisico: null,
    hashDedup: randomUUID(),
    estado: 'PENDIENTE',
    createdAt: new Date('2026-07-10T12:00:00.000Z'),
    updatedAt: new Date('2026-07-10T12:00:00.000Z'),
    ...overrides,
  } as MovimientoBancario;
}

function lineaRow(overrides: Partial<LineaCuentaRow> = {}): LineaCuentaRow {
  return {
    comprobanteId: randomUUID(),
    orden: 1,
    cuentaId: CUENTA_PLAN_ID,
    fechaContable: new Date('2026-07-10T00:00:00.000Z'),
    moneda: 'BOB',
    debito: new Prisma.Decimal('500.00'),
    credito: new Prisma.Decimal(0),
    debitoBob: new Prisma.Decimal('500.00'),
    creditoBob: new Prisma.Decimal(0),
    glosa: 'Glosa',
    glosaLinea: null,
    numeroComprobante: null,
    estado: 'CONTABILIZADO',
    anulado: false,
    ...overrides,
  };
}

/** Match con snapshot que COINCIDE con la línea (vínculo sano tras verificar). */
function matchSano(movimientoBancarioId: string, linea: LineaCuentaRow) {
  const esDebito = !new Prisma.Decimal(linea.debito).isZero();
  return {
    id: randomUUID(),
    organizationId: TENANT,
    movimientoBancarioId,
    comprobanteId: linea.comprobanteId,
    orden: linea.orden,
    snapshotCuentaId: linea.cuentaId,
    snapshotMonto: esDebito ? linea.debito : linea.credito,
    snapshotTipo: esDebito ? 'DEBITO' : 'CREDITO',
    snapshotMoneda: linea.moneda,
    snapshotFecha: linea.fechaContable,
    confianzaSugerida: null,
    conciliadoPorUserId: 'user-1',
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
  };
}

function suma(totalDebito: string, totalCredito: string) {
  return {
    totalDebito: new Prisma.Decimal(totalDebito),
    totalCredito: new Prisma.Decimal(totalCredito),
    totalDebitoBob: new Prisma.Decimal(totalDebito),
    totalCreditoBob: new Prisma.Decimal(totalCredito),
  };
}

function importacion(
  id: string,
  desde: string,
  hasta: string,
  overrides: Partial<CoberturaImportacionRow> = {},
): CoberturaImportacionRow {
  return {
    id,
    fechaDesde: new Date(`${desde}T00:00:00.000Z`),
    fechaHasta: new Date(`${hasta}T00:00:00.000Z`),
    saldoInicial: null,
    saldoFinal: null,
    estadoVerificacion: 'VERIFICADO',
    ...overrides,
  };
}

function saldoVigente(saldo: string | null) {
  return {
    cuentaBancariaId: CB_ID,
    fecha: CORTE,
    saldo: saldo === null ? null : new Prisma.Decimal(saldo),
  };
}

// ============================================================
// Suite
// ============================================================

describe('InformeConciliacionService.obtenerInforme (REQ-ICB-01/03/04)', () => {
  let cuentasBancarias: { findById: jest.Mock };
  let arranques: { vigenteA: jest.Mock; crear: jest.Mock; listarHistorial: jest.Mock };
  let movRepo: {
    listarPorCuentaBancariaEnRango: jest.Mock;
    saldosVigentes: jest.Mock;
    listarPorIds: jest.Mock;
  };
  let matchRepo: { listarPorMovimientos: jest.Mock; listarPorAnclas: jest.Mock };
  let lineasCuenta: {
    listarPorCuentaEnRango: jest.Mock;
    listarPorAnclas: jest.Mock;
    sumarPorCuentaHasta: jest.Mock;
  };
  let importaciones: { listarCoberturaPorCuentaBancaria: jest.Mock };
  let service: InformeConciliacionService;

  beforeEach(() => {
    cuentasBancarias = { findById: jest.fn().mockResolvedValue(cuentaBancariaRow()) };
    arranques = {
      vigenteA: jest.fn().mockResolvedValue(null),
      crear: jest.fn(),
      listarHistorial: jest.fn().mockResolvedValue([]),
    };
    movRepo = {
      listarPorCuentaBancariaEnRango: jest.fn().mockResolvedValue([]),
      saldosVigentes: jest.fn().mockResolvedValue([]),
      listarPorIds: jest.fn().mockResolvedValue([]),
    };
    matchRepo = {
      listarPorMovimientos: jest.fn().mockResolvedValue([]),
      listarPorAnclas: jest.fn().mockResolvedValue([]),
    };
    lineasCuenta = {
      listarPorCuentaEnRango: jest.fn().mockResolvedValue([]),
      listarPorAnclas: jest.fn().mockResolvedValue([]),
      sumarPorCuentaHasta: jest.fn().mockResolvedValue(suma('0', '0')),
    };

    importaciones = { listarCoberturaPorCuentaBancaria: jest.fn().mockResolvedValue([]) };

    service = new InformeConciliacionService(
      cuentasBancarias as unknown as CuentasBancariasService,
      arranques as unknown as ArranqueConciliadoRepositoryPort,
      movRepo as unknown as MovimientoBancarioRepositoryPort,
      matchRepo as unknown as MatchConciliacionRepositoryPort,
      lineasCuenta as unknown as LineasCuentaReaderPort,
      importaciones as unknown as ImportacionExtractoRepositoryPort,
    );
  });

  function consultar() {
    return service.obtenerInforme(TENANT, { cuentaBancariaId: CB_ID, corte: CORTE });
  }

  // ----------------------------------------------------------
  // REQ-ICB-01: moneda no soportada
  // ----------------------------------------------------------

  it('cuenta en USD → CONCILIACION_MONEDA_NO_SOPORTADA y NINGÚN otro port tocado', async () => {
    cuentasBancarias.findById.mockResolvedValue(cuentaBancariaRow({ moneda: 'USD' }));

    await expect(consultar()).rejects.toMatchObject({
      code: 'CONCILIACION_MONEDA_NO_SOPORTADA',
    });

    expect(arranques.vigenteA).not.toHaveBeenCalled();
    expect(movRepo.saldosVigentes).not.toHaveBeenCalled();
    expect(lineasCuenta.sumarPorCuentaHasta).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // REQ-ICB-04: sin arranque declarado ⇒ informe ABSTENIDO (se emite igual)
  // ----------------------------------------------------------

  it('sin arranque → informe abstenido: se emite con saldos pero sin partidas ni residuo', async () => {
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('800.00', '300.00'));

    const informe = await consultar();

    expect(informe.arranque).toBeNull();
    expect(informe.partidas).toBeNull();
    expect(informe.residuo).toBeNull();
    expect(informe.saldoExtracto?.toBob()).toBe('1200.00');
    expect(informe.saldoLibros.toBob()).toBe('500.00');
    // Acumulado desde el ORIGEN (REQ-ICB-03): sin arranque no hay `desde`.
    expect(lineasCuenta.sumarPorCuentaHasta).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      hasta: CORTE,
    });
    // Sin ventana no se acarrea nada: la abstención acota la consulta (D3).
    expect(movRepo.listarPorCuentaBancariaEnRango).not.toHaveBeenCalled();
    expect(lineasCuenta.listarPorCuentaEnRango).not.toHaveBeenCalled();
    // Una LECTURA nunca escribe: consultar jamás declara un arranque.
    expect(arranques.crear).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // D3: la ventana es `arranque.fecha < fecha <= corte`
  // ----------------------------------------------------------

  it('con arranque → ventana acotada: movimientos desde el día SIGUIENTE al arranque, suma con desde exclusivo', async () => {
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));

    await consultar();

    expect(movRepo.listarPorCuentaBancariaEnRango).toHaveBeenCalledWith(TENANT, CB_ID, {
      fechaDesde: new Date('2026-07-01T00:00:00.000Z'),
      fechaHasta: CORTE,
    });
    expect(lineasCuenta.sumarPorCuentaHasta).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      hasta: CORTE,
      desde: new Date('2026-06-30T00:00:00.000Z'),
    });
  });

  // ----------------------------------------------------------
  // Convención de signo del residual + identidad completa
  // ----------------------------------------------------------

  it('residual declarado POSITIVO contribuye como −residual y la identidad cierra en cero', async () => {
    // Arranque 30/06: extracto 1000, libros 990, residual +10 (extracto arriba).
    // Julio: un CREDITO bancario de 200 sin asiento (pendiente).
    // Corte 31/07: extracto 1200, libros 990 + 0 = 990.
    // residuo = 990 − 1200 − (−200) − 0 − 0 − (−10) = 0.
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);
    movRepo.listarPorCuentaBancariaEnRango.mockResolvedValue([
      movRow({ id: 'm-pend', monto: new Prisma.Decimal('200.00'), tipo: 'CREDITO' }),
    ]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));

    const informe = await consultar();

    expect(informe.saldoLibros.toBob()).toBe('990.00');
    expect(informe.partidas).not.toBeNull();
    // El residual declarado POSITIVO (extracto > libros) contribuye −10 al puente.
    expect(informe.partidas?.arranque.importe.toBob()).toBe('-10.00');
    expect(informe.partidas?.arranque.fecha.toIso()).toBe('2026-06-30');
    expect(informe.partidas?.pendientes.importe.toBob()).toBe('-200.00');
    expect(informe.residuo?.toBob()).toBe('0.00');
  });

  // ----------------------------------------------------------
  // REQ-ICB-07: conciliado con asiento POSTERIOR al corte sigue siendo partida
  // ----------------------------------------------------------

  it('movimiento CONCILIADO con asiento posterior al corte → partida pendiente con asentadoEl', async () => {
    // El cargo del 31/07 asentado el 15/08 (REQ-ICB-01/07). La línea de agosto
    // NO está en la ventana → se resuelve por anclas (diagnóstico).
    const lineaAgosto = lineaRow({
      comprobanteId: 'comp-ago',
      fechaContable: new Date('2026-08-15T00:00:00.000Z'),
      debito: new Prisma.Decimal(0),
      credito: new Prisma.Decimal('300.00'),
      debitoBob: new Prisma.Decimal(0),
      creditoBob: new Prisma.Decimal('300.00'),
    });
    const mov = movRow({
      id: 'm-cargo',
      fecha: new Date('2026-07-31T00:00:00.000Z'),
      monto: new Prisma.Decimal('300.00'),
      tipo: 'DEBITO',
      estado: 'CONCILIADO',
    });
    arranques.vigenteA.mockResolvedValue(
      arranqueRow({
        saldoExtracto: new Prisma.Decimal('1000.00'),
        saldoLibros: new Prisma.Decimal('1000.00'),
        diferenciaResidual: new Prisma.Decimal('0'),
      }),
    );
    // Extracto al corte: 1000 − 300 = 700. Libros al corte: 1000 (asiento en agosto).
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('700.00')]);
    movRepo.listarPorCuentaBancariaEnRango.mockResolvedValue([mov]);
    matchRepo.listarPorMovimientos.mockResolvedValue([matchSano('m-cargo', lineaAgosto)]);
    lineasCuenta.listarPorAnclas.mockResolvedValue([lineaAgosto]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));

    const informe = await consultar();

    expect(informe.partidas?.pendientes.detalle).toEqual([
      expect.objectContaining({
        movimientoId: 'm-cargo',
        asentadoEl: expect.objectContaining({ year: 2026, month: 8, day: 15 }),
      }),
    ]);
    // Un DEBITO bancario falta en libros al corte: contribuye +300 al puente.
    expect(informe.partidas?.pendientes.importe.toBob()).toBe('300.00');
    expect(informe.residuo?.toBob()).toBe('0.00');
  });

  // ----------------------------------------------------------
  // Simétrico: línea conciliada con movimiento posterior al corte
  // ----------------------------------------------------------

  it('línea conciliada con movimiento POSTERIOR al corte → en tránsito con registradoPorBancoEl', async () => {
    // Cheque emitido en julio, cobrado en agosto: la línea está en la ventana,
    // el movimiento no → el match se encuentra por ANCLA y el movimiento por id.
    const lineaJulio = lineaRow({
      comprobanteId: 'comp-jul',
      fechaContable: new Date('2026-07-20T00:00:00.000Z'),
      debito: new Prisma.Decimal(0),
      credito: new Prisma.Decimal('400.00'),
      debitoBob: new Prisma.Decimal(0),
      creditoBob: new Prisma.Decimal('400.00'),
    });
    const match = matchSano('m-ago', lineaJulio);
    arranques.vigenteA.mockResolvedValue(
      arranqueRow({
        saldoExtracto: new Prisma.Decimal('1000.00'),
        saldoLibros: new Prisma.Decimal('1000.00'),
        diferenciaResidual: new Prisma.Decimal('0'),
      }),
    );
    // Extracto al corte: 1000 (el banco aún no lo registró). Libros: 600.
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1000.00')]);
    lineasCuenta.listarPorCuentaEnRango.mockResolvedValue([lineaJulio]);
    matchRepo.listarPorAnclas.mockResolvedValue([match]);
    movRepo.listarPorIds.mockResolvedValue([
      movRow({
        id: 'm-ago',
        fecha: new Date('2026-08-05T00:00:00.000Z'),
        monto: new Prisma.Decimal('400.00'),
        tipo: 'DEBITO',
      }),
    ]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '400.00'));

    const informe = await consultar();

    expect(movRepo.listarPorIds).toHaveBeenCalledWith(TENANT, ['m-ago']);
    expect(informe.partidas?.enTransito.detalle).toEqual([
      expect.objectContaining({
        comprobanteId: 'comp-jul',
        registradoPorBancoEl: expect.objectContaining({ year: 2026, month: 8, day: 5 }),
      }),
    ]);
    // Un CREDITO contable (cheque) falta en el extracto: contribuye −400.
    expect(informe.partidas?.enTransito.importe.toBob()).toBe('-400.00');
    expect(informe.saldoLibros.toBob()).toBe('600.00');
    expect(informe.residuo?.toBob()).toBe('0.00');
  });

  // ----------------------------------------------------------
  // La pata bancaria PRE-arranque: el par se cancela, no es partida
  // ----------------------------------------------------------

  it('línea conciliada con movimiento PRE-arranque (≤ corte) → se cancela y NO es partida', async () => {
    // El banco registró en junio (absorbido en el saldo declarado); los libros
    // asentaron en julio. La partida en tránsito abierta al arranque se
    // resuelve sola — clasificarla EN_TRANSITO la cobraría dos veces.
    const lineaJulio = lineaRow({
      comprobanteId: 'comp-jul10',
      fechaContable: new Date('2026-07-10T00:00:00.000Z'),
      debito: new Prisma.Decimal('500.00'),
      credito: new Prisma.Decimal(0),
    });
    const match = matchSano('m-jun', lineaJulio);
    arranques.vigenteA.mockResolvedValue(
      arranqueRow({
        saldoExtracto: new Prisma.Decimal('1500.00'),
        saldoLibros: new Prisma.Decimal('1000.00'),
        diferenciaResidual: new Prisma.Decimal('0'),
      }),
    );
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1500.00')]);
    lineasCuenta.listarPorCuentaEnRango.mockResolvedValue([lineaJulio]);
    matchRepo.listarPorAnclas.mockResolvedValue([match]);
    movRepo.listarPorIds.mockResolvedValue([
      movRow({
        id: 'm-jun',
        fecha: new Date('2026-06-15T00:00:00.000Z'),
        monto: new Prisma.Decimal('500.00'),
        tipo: 'CREDITO',
      }),
    ]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('500.00', '0'));

    const informe = await consultar();

    expect(informe.partidas?.enTransito.detalle).toEqual([]);
    expect(informe.saldoLibros.toBob()).toBe('1500.00');
    expect(informe.residuo?.toBob()).toBe('0.00');
  });

  // ----------------------------------------------------------
  // REQ-ICB-03: sin saldo publicado en el rango → residuo nulo (sin veredicto)
  // ----------------------------------------------------------

  it('el banco no publica saldo ≤ corte → saldoExtracto y residuo nulos, el informe se emite igual', async () => {
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente(null)]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));

    const informe = await consultar();

    expect(informe.saldoExtracto).toBeNull();
    expect(informe.residuo).toBeNull();
    expect(informe.partidas).not.toBeNull();
    expect(informe.arranque).not.toBeNull();
  });

  // ==========================================================
  // Task 3.7 — sección `confiabilidad` (REQ-ICB-05/06/08, D6)
  // ==========================================================

  describe('confiabilidad', () => {
    /** Escenario que CIERRA: arranque en 1000=990 con residual 10, sin ventana. */
    function armarEscenarioQueCierra() {
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1000.00')]);
      lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));
      // residuo = 990 − 1000 − 0 − 0 − 0 − (−10) = 0
    }

    it('insumos sanos e identidad cerrada → conciliado true, sin motivos', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-jul', '2026-07-01', '2026-07-31'),
      ]);

      const informe = await consultar();

      expect(informe.residuo?.toBob()).toBe('0.00');
      expect(informe.confiabilidad).toEqual({ conciliado: true, motivos: [] });
    });

    it('sin arranque → NO conciliado con motivo SIN_ARRANQUE, y el informe se emite igual', async () => {
      movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);

      const informe = await consultar();

      expect(informe.arranque).toBeNull();
      expect(informe.confiabilidad.conciliado).toBe(false);
      expect(informe.confiabilidad.motivos).toEqual([{ tipo: 'SIN_ARRANQUE' }]);
    });

    it('sin saldo de extracto publicado → motivo SIN_SALDO_EXTRACTO', async () => {
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      movRepo.saldosVigentes.mockResolvedValue([saldoVigente(null)]);

      const informe = await consultar();

      expect(informe.confiabilidad.conciliado).toBe(false);
      expect(informe.confiabilidad.motivos).toEqual([{ tipo: 'SIN_SALDO_EXTRACTO' }]);
    });

    it('DESCUADRE en importación del rango → se nombra y NO se afirma conciliado; los números se muestran igual', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-desc', '2026-07-01', '2026-07-31', { estadoVerificacion: 'DESCUADRE' }),
      ]);

      const informe = await consultar();

      // El puente y el residuo se emiten igual (REQ-ICB-05).
      expect(informe.residuo?.toBob()).toBe('0.00');
      expect(informe.partidas).not.toBeNull();
      expect(informe.confiabilidad.conciliado).toBe(false);
      expect(informe.confiabilidad.motivos).toEqual([
        { tipo: 'DESCUADRE', importacionId: 'imp-desc' },
      ]);
    });

    it('DESCUADRE en importación TOTALMENTE anterior al arranque → absorbido, NO es motivo', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-vieja', '2026-05-01', '2026-05-31', { estadoVerificacion: 'DESCUADRE' }),
        importacion('imp-jul', '2026-07-01', '2026-07-31'),
      ]);

      const informe = await consultar();

      expect(informe.confiabilidad).toEqual({ conciliado: true, motivos: [] });
    });

    it('hueco de cobertura antes del corte → el tramo faltante se nombra explícitamente', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-a', '2026-07-01', '2026-07-10'),
        importacion('imp-b', '2026-07-20', '2026-07-31'),
      ]);

      const informe = await consultar();

      expect(informe.confiabilidad.conciliado).toBe(false);
      expect(informe.confiabilidad.motivos).toEqual([
        {
          tipo: 'HUECO',
          desde: expect.objectContaining({ year: 2026, month: 7, day: 11 }),
          hasta: expect.objectContaining({ year: 2026, month: 7, day: 19 }),
        },
      ]);
    });

    it('discontinuidad de saldo entre importaciones contiguas del rango → motivo con la magnitud del salto', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-a', '2026-07-01', '2026-07-15', {
          saldoInicial: new Prisma.Decimal('100.00'),
          saldoFinal: new Prisma.Decimal('500.00'),
        }),
        importacion('imp-b', '2026-07-16', '2026-07-31', {
          saldoInicial: new Prisma.Decimal('700.00'),
          saldoFinal: new Prisma.Decimal('900.00'),
        }),
      ]);

      const informe = await consultar();

      expect(informe.confiabilidad.conciliado).toBe(false);
      const motivos = informe.confiabilidad.motivos;
      expect(motivos).toHaveLength(1);
      expect(motivos[0]).toMatchObject({
        tipo: 'DISCONTINUIDAD',
        anteriorId: 'imp-a',
        siguienteId: 'imp-b',
      });
      expect(motivos[0]?.tipo === 'DISCONTINUIDAD' ? motivos[0].diferencia.toBob() : null).toBe(
        '200.00',
      );
    });

    it('residuo ≠ 0 → RESIDUO_NO_EXPLICADO con su importe; ninguna partida se altera', async () => {
      // Igual que el escenario que cierra, pero el extracto trae 1050:
      // residuo = 990 − 1050 − (−10) = −50.
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1050.00')]);
      lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('0', '0'));
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-jul', '2026-07-01', '2026-07-31'),
      ]);

      const informe = await consultar();

      expect(informe.residuo?.toBob()).toBe('-50.00');
      expect(informe.partidas?.arranque.importe.toBob()).toBe('-10.00');
      expect(informe.confiabilidad.conciliado).toBe(false);
      const motivos = informe.confiabilidad.motivos;
      expect(motivos).toHaveLength(1);
      expect(motivos[0]).toMatchObject({ tipo: 'RESIDUO_NO_EXPLICADO' });
      expect(motivos[0]?.tipo === 'RESIDUO_NO_EXPLICADO' ? motivos[0].importe.toBob() : null).toBe(
        '-50.00',
      );
    });

    it('trazabilidad (REQ-ICB-08): las importaciones del rango viajan con su estado de verificación', async () => {
      armarEscenarioQueCierra();
      importaciones.listarCoberturaPorCuentaBancaria.mockResolvedValue([
        importacion('imp-vieja', '2026-05-01', '2026-05-31', { estadoVerificacion: 'DESCUADRE' }),
        importacion('imp-jul', '2026-07-01', '2026-07-31', {
          estadoVerificacion: 'SIN_VERIFICAR',
        }),
      ]);

      const informe = await consultar();

      // La importación absorbida por el arranque NO es insumo del rango.
      expect(informe.insumos.importaciones).toEqual([
        expect.objectContaining({ id: 'imp-jul', estadoVerificacion: 'SIN_VERIFICAR' }),
      ]);
      expect(informe.insumos.importaciones[0]?.fechaDesde.toIso()).toBe('2026-07-01');
      expect(informe.insumos.importaciones[0]?.fechaHasta.toIso()).toBe('2026-07-31');
    });
  });
});
