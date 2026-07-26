import { randomUUID } from 'node:crypto';

import type { ArranqueConciliado, CuentaBancaria, MovimientoBancario } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { LineaCuentaRow } from '@/comprobantes/ports/lineas-cuenta-reader.port';
import type { LineasCuentaReaderPort } from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { Money } from '@/common/domain/money';

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
      // El agregado es el TOTAL del mayor, no un delta: por defecto coincide
      // con el `saldoLibros` declarado en `arranqueRow()` (990.00), que es el
      // caso sano — declarado == mayor real, sin motivo de arranque.
      sumarPorCuentaHasta: jest.fn().mockResolvedValue(suma('990.00', '0')),
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

  /**
   * Mayor REAL: total acumulado al CORTE y total a la fecha del ARRANQUE.
   * El agregado dejó de ser el delta de la ventana — es el saldo que el
   * informe EXHIBE — así que cada test declara ambos cortes. Por defecto el
   * total al arranque iguala al del corte (sin movimiento de libros en la
   * ventana), y debe igualar al `saldoLibros` declarado para no disparar
   * `ARRANQUE_LIBROS_NO_COINCIDE`.
   */
  function mockMayor(
    alCorte: { d: string; c?: string },
    alArranque: { d: string; c?: string } = alCorte,
  ) {
    lineasCuenta.sumarPorCuentaHasta.mockImplementation((_t: string, f: { hasta: Date }) =>
      Promise.resolve(
        f.hasta.getTime() === CORTE.getTime()
          ? suma(alCorte.d, alCorte.c ?? '0')
          : suma(alArranque.d, alArranque.c ?? '0'),
      ),
    );
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

  it('con arranque → el LISTADO del puente se acota a la ventana; los agregados del mayor NO', async () => {
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);

    await consultar();

    // La cota D3 aplica al detalle del puente: desde el día SIGUIENTE al arranque.
    expect(movRepo.listarPorCuentaBancariaEnRango).toHaveBeenCalledWith(TENANT, CB_ID, {
      fechaDesde: new Date('2026-07-01T00:00:00.000Z'),
      fechaHasta: CORTE,
    });
    expect(lineasCuenta.listarPorCuentaEnRango).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      fechaDesde: new Date('2026-07-01T00:00:00.000Z'),
      fechaHasta: CORTE,
    });
    // Los agregados son ACUMULADOS desde el origen — ninguno lleva `desde`:
    // uno da el saldo según libros al corte, el otro el contraste del arranque.
    expect(lineasCuenta.sumarPorCuentaHasta).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      hasta: CORTE,
    });
    expect(lineasCuenta.sumarPorCuentaHasta).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      hasta: new Date('2026-06-30T00:00:00.000Z'),
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
    mockMayor({ d: '990.00' });

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
  // REQ-ICB-03: el saldo según libros es el del MAYOR, jamás el declarado
  // ----------------------------------------------------------

  it('saldo según libros = agregado REAL del mayor al corte, NO el declarado en el arranque', async () => {
    // El arranque declara libros 990.00. El mayor, en cambio, acumula
    // 420.00 al corte. El informe debe exhibir 420.00: es el número que el
    // papel de trabajo tiene que justificar ante un auditor. Un saldo
    // declarado no respalda un asiento.
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);
    lineasCuenta.sumarPorCuentaHasta.mockImplementation((_t: string, f: { hasta: Date }) =>
      Promise.resolve(
        f.hasta.getTime() === CORTE.getTime() ? suma('500.00', '80.00') : suma('990.00', '0'),
      ),
    );

    const informe = await consultar();

    expect(informe.saldoLibros.toBob()).toBe('420.00');
    // Acumulado desde el ORIGEN: el agregado del corte NO lleva `desde`.
    expect(lineasCuenta.sumarPorCuentaHasta).toHaveBeenCalledWith(TENANT, {
      cuentaId: CUENTA_PLAN_ID,
      hasta: CORTE,
    });
  });

  it('libros declarado ≠ mayor a la fecha del arranque → ARRANQUE_LIBROS_NO_COINCIDE', async () => {
    // Simétrico de ARRANQUE_EXTRACTO_NO_COINCIDE: el punto de partida
    // declarado se contrasta contra el mayor real a esa fecha. El residual
    // que el usuario declaró se apoya en ese saldo — si el saldo es otro, el
    // residual razona sobre una premisa falsa.
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1200.00')]);
    lineasCuenta.sumarPorCuentaHasta.mockImplementation((_t: string, f: { hasta: Date }) =>
      Promise.resolve(
        f.hasta.getTime() === CORTE.getTime() ? suma('500.00', '0') : suma('500.00', '0'),
      ),
    );

    const informe = await consultar();

    expect(informe.confiabilidad.conciliado).toBe(false);
    expect(informe.confiabilidad.motivos).toContainEqual(
      expect.objectContaining({
        tipo: 'ARRANQUE_LIBROS_NO_COINCIDE',
        declarado: expect.objectContaining({}),
      }),
    );
    const motivo = informe.confiabilidad.motivos.find(
      (m) => m.tipo === 'ARRANQUE_LIBROS_NO_COINCIDE',
    );
    expect(motivo).toBeDefined();
    if (motivo?.tipo === 'ARRANQUE_LIBROS_NO_COINCIDE') {
      expect(motivo.declarado.toBob()).toBe('990.00');
      expect(motivo.real.toBob()).toBe('500.00');
      expect(motivo.diferencia.toBob()).toBe('490.00');
      expect(motivo.fecha.toIso()).toBe('2026-06-30');
    }
  });

  it('libros declarado que SÍ coincide con el mayor → sin motivo de arranque', async () => {
    arranques.vigenteA.mockResolvedValue(arranqueRow());
    movRepo.saldosVigentes.mockResolvedValue([saldoVigente('1000.00')]);
    lineasCuenta.sumarPorCuentaHasta.mockResolvedValue(suma('990.00', '0'));

    const informe = await consultar();

    expect(informe.confiabilidad.motivos.map((m) => m.tipo)).not.toContain(
      'ARRANQUE_LIBROS_NO_COINCIDE',
    );
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
    // El asiento es de agosto: al corte el mayor sigue en 1000, igual al declarado.
    mockMayor({ d: '1000.00' });

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
    // Mayor: 1000 al arranque, 600 al corte (el cheque de julio por 400).
    mockMayor({ d: '1000.00', c: '400.00' }, { d: '1000.00' });

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
    // Mayor: 1000 al arranque, 1500 al corte (el asiento de julio por 500).
    mockMayor({ d: '1500.00' }, { d: '1000.00' });

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
    mockMayor({ d: '990.00' });

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
      mockMayor({ d: '990.00' });
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
      // Igual que el escenario que cierra, pero el extracto trae 1050 AL
      // CORTE: residuo = 990 − 1050 − (−10) = −50. A la fecha del arranque el
      // extracto real coincide con el declarado (1000) — el mock distingue
      // fechas para que el ÚNICO motivo sea el residuo.
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      movRepo.saldosVigentes.mockImplementation((_tenant: string, fecha: Date) =>
        Promise.resolve([
          saldoVigente(fecha.toISOString().startsWith('2026-06-30') ? '1000.00' : '1050.00'),
        ]),
      );
      mockMayor({ d: '990.00' });
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

  // ==========================================================
  // Contraste del arranque contra el extracto REAL a su fecha
  // (ARRANQUE_EXTRACTO_NO_COINCIDE) — alcance agregado tras el
  // primer smoke: `saldoExtracto` declarado se escribía y jamás
  // se leía; nadie lo validaba contra el extracto.
  // ==========================================================

  describe('contraste del arranque contra el extracto real (ARRANQUE_EXTRACTO_NO_COINCIDE)', () => {
    /** Mock de `saldosVigentes` sensible a la FECHA consultada (clave ISO). */
    function saldosPorFecha(porIso: Record<string, string | null>) {
      movRepo.saldosVigentes.mockImplementation((_tenant: string, fecha: Date) => {
        const clave = fecha.toISOString().slice(0, 10);
        if (!(clave in porIso)) return Promise.resolve([]);
        return Promise.resolve([saldoVigente(porIso[clave] ?? null)]);
      });
    }

    it('el saldo real se pide a la fecha del ARRANQUE, no al corte: coincide allí → sin motivo aunque la cuenta se movió después', async () => {
      // Declarado 1000.00 al 30/06; el extracto REAL al 30/06 es 1000.00.
      // Al corte el saldo ya es 1200.00 — si el contraste se hiciera contra el
      // corte, el motivo dispararía SIEMPRE que hubiera movimiento posterior.
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      saldosPorFecha({ '2026-06-30': '1000.00', '2026-07-31': '1200.00' });
      mockMayor({ d: '990.00' });

      const informe = await consultar();

      expect(movRepo.saldosVigentes).toHaveBeenCalledWith(
        TENANT,
        new Date('2026-06-30T00:00:00.000Z'),
      );
      expect(
        informe.confiabilidad.motivos.some((m) => m.tipo === 'ARRANQUE_EXTRACTO_NO_COINCIDE'),
      ).toBe(false);
    });

    it('declarado difiere del real → motivo con los TRES números, conviviendo con el residuo sin confundirse', async () => {
      // Declarado 1000.00, real al arranque 1699.00 → diferencia 699.00.
      // Además el corte trae 1050.00 → residuo −50.00: son DOS causas
      // distintas y cada una se nombra por separado.
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      saldosPorFecha({ '2026-06-30': '1699.00', '2026-07-31': '1050.00' });
      mockMayor({ d: '990.00' });

      const informe = await consultar();

      expect(informe.confiabilidad.conciliado).toBe(false);
      const motivo = informe.confiabilidad.motivos.find(
        (m) => m.tipo === 'ARRANQUE_EXTRACTO_NO_COINCIDE',
      );
      expect(motivo).toBeDefined();
      if (motivo?.tipo !== 'ARRANQUE_EXTRACTO_NO_COINCIDE') throw new Error('unreachable');
      expect(motivo.fecha).toEqual(expect.objectContaining({ year: 2026, month: 6, day: 30 }));
      expect(motivo.declarado.toBob()).toBe('1000.00');
      expect(motivo.real.toBob()).toBe('1699.00');
      expect(motivo.diferencia.toBob()).toBe('699.00');
      // El residuo −50 tiene SU motivo propio: causas distintas, nombres distintos.
      expect(informe.confiabilidad.motivos.some((m) => m.tipo === 'RESIDUO_NO_EXPLICADO')).toBe(
        true,
      );
    });

    it('CASO PELIGROSO: residual declarado "correcto" cierra el residuo en 0.00 con un saldo declarado basura → el motivo igual aparece', async () => {
      // El vecino del caso de Marco: saldoExtracto declarado 15.99 (apertura
      // del día, no cierre), pero residual 699.00 bien declarado. La identidad
      // cierra impecable — residuo 0.00 — y ANTES de este contraste nada lo
      // detectaba. El informe cierra Y el motivo aparece igual.
      arranques.vigenteA.mockResolvedValue(
        arranqueRow({
          fecha: new Date('2026-06-05T00:00:00.000Z'),
          saldoExtracto: new Prisma.Decimal('15.99'),
          saldoLibros: new Prisma.Decimal('15.99'),
          diferenciaResidual: new Prisma.Decimal('699.00'),
        }),
      );
      saldosPorFecha({ '2026-06-05': '714.99', '2026-07-31': '714.99' });
      // El lado libros SÍ está sano: el mayor vale 15.99 al arranque y al
      // corte. Lo único podrido es el saldo de extracto declarado — así el
      // test aísla el motivo del banco de su simétrico de libros.
      mockMayor({ d: '15.99' });

      const informe = await consultar();

      // residuo = 15.99 − 714.99 − (−699.00) = 0.00: cierra "perfecto".
      expect(informe.residuo?.toBob()).toBe('0.00');
      expect(informe.confiabilidad.conciliado).toBe(false);
      expect(informe.confiabilidad.motivos).toHaveLength(1);
      const motivo = informe.confiabilidad.motivos[0];
      if (motivo?.tipo !== 'ARRANQUE_EXTRACTO_NO_COINCIDE') {
        throw new Error(`motivo inesperado: ${motivo?.tipo ?? 'ninguno'}`);
      }
      expect(motivo.fecha).toEqual(expect.objectContaining({ year: 2026, month: 6, day: 5 }));
      expect(motivo.declarado.toBob()).toBe('15.99');
      expect(motivo.real.toBob()).toBe('714.99');
      expect(motivo.diferencia.toBob()).toBe('699.00');
    });

    it('sin saldo publicado a la fecha del arranque (fila con saldo null) → sin motivo: sin dato no hay veredicto', async () => {
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      saldosPorFecha({ '2026-06-30': null, '2026-07-31': '1000.00' });
      mockMayor({ d: '990.00' });

      const informe = await consultar();

      // residuo = 990 − 1000 − (−10) = 0 y ningún motivo: conciliado.
      expect(informe.confiabilidad).toEqual({ conciliado: true, motivos: [] });
    });

    it('sin NINGÚN movimiento hasta la fecha del arranque (sin fila) → sin motivo, sin acusación', async () => {
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      saldosPorFecha({ '2026-07-31': '1000.00' });
      mockMayor({ d: '990.00' });

      const informe = await consultar();

      expect(informe.confiabilidad).toEqual({ conciliado: true, motivos: [] });
    });

    it('diferencia dentro de la tolerancia (0.01, la MISMA de la continuidad) → sin motivo', async () => {
      arranques.vigenteA.mockResolvedValue(arranqueRow());
      saldosPorFecha({ '2026-06-30': '1000.01', '2026-07-31': '1000.00' });
      mockMayor({ d: '990.00' });

      const informe = await consultar();

      expect(informe.confiabilidad).toEqual({ conciliado: true, motivos: [] });
    });
  });

  // ==========================================================
  // Task 3.8 — declararArranque (REQ-ICB-04): comando explícito
  // ==========================================================

  describe('declararArranque', () => {
    const DECLARACION = {
      cuentaBancariaId: CB_ID,
      fecha: new Date('2026-06-30T00:00:00.000Z'),
      saldoExtracto: Money.of('1000.00'),
      saldoLibros: Money.of('990.00'),
      diferenciaResidual: Money.of('10.00'),
      nota: null,
    };

    it('cuenta en USD → CONCILIACION_MONEDA_NO_SOPORTADA y NO se persiste nada', async () => {
      cuentasBancarias.findById.mockResolvedValue(cuentaBancariaRow({ moneda: 'USD' }));

      await expect(service.declararArranque(TENANT, 'user-1', DECLARACION)).rejects.toMatchObject({
        code: 'CONCILIACION_MONEDA_NO_SOPORTADA',
      });

      expect(arranques.crear).not.toHaveBeenCalled();
    });

    it('persiste los CUATRO datos DECLARADOS — la diferencia residual NUNCA se calcula', async () => {
      arranques.crear.mockResolvedValue(arranqueRow());

      // saldoExtracto − saldoLibros = 10, pero el usuario declara residual 3:
      // la parte que asume como inexplicable. El service NO la recalcula.
      const declarado = await service.declararArranque(TENANT, 'user-7', {
        ...DECLARACION,
        diferenciaResidual: Money.of('3.00'),
        nota: 'migración inicial',
      });

      expect(arranques.crear).toHaveBeenCalledTimes(1);
      const [tenant, data] = arranques.crear.mock.calls[0] as [
        string,
        {
          cuentaBancariaId: string;
          fecha: Date;
          saldoExtracto: Prisma.Decimal;
          saldoLibros: Prisma.Decimal;
          diferenciaResidual: Prisma.Decimal;
          nota: string | null;
          declaradoPorUserId: string;
        },
      ];
      expect(tenant).toBe(TENANT);
      expect(data.cuentaBancariaId).toBe(CB_ID);
      expect(data.fecha).toEqual(new Date('2026-06-30T00:00:00.000Z'));
      expect(data.saldoExtracto.toFixed(2)).toBe('1000.00');
      expect(data.saldoLibros.toFixed(2)).toBe('990.00');
      expect(data.diferenciaResidual.toFixed(2)).toBe('3.00');
      expect(data.nota).toBe('migración inicial');
      expect(data.declaradoPorUserId).toBe('user-7');

      expect(declarado.id).toBe('arr-1');
      expect(declarado.fecha.toIso()).toBe('2026-06-30');
      expect(declarado.diferenciaResidual.toBob()).toBe('10.00');
    });
  });
});
