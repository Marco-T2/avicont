import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ClaseCuenta, NaturalezaCuenta, PerfilExtracto, PrismaClient } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import type { PrismaService } from '@/common/prisma.service';

import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaImportacionExtractoRepository } from './adapters/prisma-importacion-extracto.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { DIALECTO_BANCOSOL } from './adapters/dialectos/bancosol.dialecto';
import { DIALECTO_BCP } from './adapters/dialectos/bcp.dialecto';
import { DIALECTO_BMSC } from './adapters/dialectos/bmsc.dialecto';
import { DIALECTO_ECONOMICO } from './adapters/dialectos/economico.dialecto';
import { DIALECTO_FIE } from './adapters/dialectos/fie.dialecto';
import { DIALECTO_FORTALEZA } from './adapters/dialectos/fortaleza.dialecto';
import { DIALECTO_UNION_XLSX } from './adapters/dialectos/union.dialecto';
import { detectarDiscontinuidades } from './domain/continuidad-extractos';
import { XlsxCoreExtractoParser } from './adapters/xlsx-core-extracto-parser';
import type { ExtractoParseado, MovimientoParseado } from './ports/extracto-parser.port';
import type { DescriptorPerfilExtracto, ExtractoParserPort } from './ports/extracto-parser.port';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import { ExtractoImportadorService } from './extracto-importador.service';

const FIXTURES_DIR = join(__dirname, 'adapters', '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

function archivoDe(buffer: Buffer, nombreOriginal = 'extracto.xlsx') {
  return { buffer, nombreOriginal, tamanioBytes: buffer.length };
}

/** Fake ExtractoParserPort para ejercitar ramas que un .xlsx real no puede forzar a voluntad. */
function fakeParser(overrides: {
  descriptor: Partial<DescriptorPerfilExtracto> & { perfil: PerfilExtracto };
  movimientos?: MovimientoParseado[];
  numeroCuentaDeclarado?: string | null;
  saldoInicialDeclarado?: Money | null;
  saldoFinalDeclarado?: Money | null;
}): ExtractoParserPort {
  const descriptor: DescriptorPerfilExtracto = {
    banco: 'Banco Fake',
    formato: 'Excel (.xlsx)',
    extensiones: ['.xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    estrategiaChecksum: 'DECLARADO',
    soportaContraparte: false,
    soportaHora: false,
    exponeNumeroCuenta: true,
    instruccionesDescarga: 'fake',
    ...overrides.descriptor,
  };
  const movimientos = overrides.movimientos ?? [];
  const parseado: ExtractoParseado = {
    movimientos,
    cobertura: {
      desde: movimientos[0]?.fecha ?? FechaContable.of(2026, 1, 1),
      hasta: movimientos[movimientos.length - 1]?.fecha ?? FechaContable.of(2026, 1, 1),
      declarada: false,
    },
    saldoInicialDeclarado: overrides.saldoInicialDeclarado ?? null,
    saldoFinalDeclarado: overrides.saldoFinalDeclarado ?? null,
    monedaDeclarada: null,
    numeroCuentaDeclarado: overrides.numeroCuentaDeclarado ?? null,
  };
  return {
    get descriptor() {
      return descriptor;
    },
    reconoce: () => Promise.resolve(true),
    parse: () => Promise.resolve(parseado),
  };
}

function movimientoFake(overrides: Partial<MovimientoParseado> = {}): MovimientoParseado {
  return {
    fecha: FechaContable.of(2026, 6, 15),
    hora: null,
    monto: Money.of('100.00'),
    tipo: 'DEBITO',
    descripcion: 'Movimiento fake',
    referencia: null,
    saldo: Money.of('500.00'),
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
    ...overrides,
  };
}

describe('ExtractoImportadorService (integration, REQ-CB-03/04/05/06/07/08/13/16)', () => {
  const SLUG_A = 'org-test-imp-a';
  const SLUG_B = 'org-test-imp-b';

  let prisma: PrismaClient;
  let cuentaBancariaRepo: PrismaCuentaBancariaRepository;
  let movimientoRepo: PrismaMovimientoBancarioRepository;
  let importacionRepo: PrismaImportacionExtractoRepository;
  let tenantA: string;
  let cuentaIdA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    cuentaBancariaRepo = new PrismaCuentaBancariaRepository(prisma as unknown as PrismaService);
    movimientoRepo = new PrismaMovimientoBancarioRepository(prisma as unknown as PrismaService);
    importacionRepo = new PrismaImportacionExtractoRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const org = await prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } });
    tenantA = org.id;
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantA,
        codigoInterno: '1.1.1.001',
        nombre: 'Caja BancoSol',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    cuentaIdA = cuenta.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.movimientoBancario.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.importacionExtracto.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function servicioConParsers(parsers: readonly ExtractoParserPort[]): ExtractoImportadorService {
    const lookup = new ExtractoParserLookupService(parsers);
    return new ExtractoImportadorService(
      prisma as unknown as PrismaService,
      lookup,
      cuentaBancariaRepo,
      movimientoRepo,
      importacionRepo,
    );
  }

  const servicioReal = () =>
    servicioConParsers([
      // Los 7 perfiles, igual que `conciliacion-bancaria.module.ts`. Esta lista
      // se había quedado en 3 al sumar BCP/Fortaleza/BMSC, así que el servicio
      // no podía ejercitarse con esos perfiles en integración.
      new XlsxCoreExtractoParser(DIALECTO_BANCOSOL),
      new XlsxCoreExtractoParser(DIALECTO_ECONOMICO),
      new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX),
      new XlsxCoreExtractoParser(DIALECTO_BCP),
      new XlsxCoreExtractoParser(DIALECTO_FORTALEZA),
      new XlsxCoreExtractoParser(DIALECTO_BMSC),
      new XlsxCoreExtractoParser(DIALECTO_FIE),
    ]);

  async function crearCuentaBancaria(numeroCuenta: string | null) {
    return cuentaBancariaRepo.create(tenantA, {
      cuentaId: cuentaIdA,
      alias: 'Cuenta corriente BancoSol',
      perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
      numeroCuenta,
      moneda: 'BOB',
    });
  }

  async function crearCuentaBancariaFortaleza(numeroCuenta: string | null) {
    return cuentaBancariaRepo.create(tenantA, {
      cuentaId: cuentaIdA,
      alias: 'Cuenta Fortaleza',
      perfilExtracto: PerfilExtracto.FORTALEZA_XLSX,
      numeroCuenta,
      moneda: 'BOB',
    });
  }

  async function crearCuentaBancariaUnion(numeroCuenta: string | null) {
    return cuentaBancariaRepo.create(tenantA, {
      cuentaId: cuentaIdA,
      alias: 'Cuenta Unión',
      perfilExtracto: PerfilExtracto.UNION_XLSX,
      numeroCuenta,
      moneda: 'BOB',
    });
  }

  // ============================================================
  // REQ-CB-05/07 — criterio de aceptación LITERAL, fixtures reales (task 3.19)
  // ============================================================

  it('fixture real R-1: A -> 60 nuevos, B -> 21 nuevos + 59 ya existían, total 81 únicos', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    const resA = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-a-mayo-junio.xlsx'), 'bancosol-a-mayo-junio.xlsx'),
      { confirmarNumeroCuenta: false },
    );
    expect(resA.requiereConfirmacionCuenta).toBe(false);
    if (resA.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(resA.movimientosNuevos).toBe(60);
    expect(resA.movimientosDuplicados).toBe(0);

    const resB = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-b-junio-julio.xlsx'), 'bancosol-b-junio-julio.xlsx'),
      { confirmarNumeroCuenta: false },
    );
    expect(resB.requiereConfirmacionCuenta).toBe(false);
    if (resB.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(resB.movimientosNuevos).toBe(21);
    expect(resB.movimientosDuplicados).toBe(59);

    const total = await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id);
    expect(total).toBe(81);
  });

  it('reimportar el MISMO archivo -> 0 nuevos, N ya existían, nada se modifica ni se borra (task 3.17)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();
    const buffer = leerFixture('bancosol-20-movimientos-checksum.xlsx');

    await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
      confirmarNumeroCuenta: false,
    });
    const segunda = await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
      confirmarNumeroCuenta: false,
    });

    if (segunda.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(segunda.movimientosNuevos).toBe(0);
    expect(segunda.movimientosDuplicados).toBe(20);
    expect(await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id)).toBe(20);
  });

  // ============================================================
  // REQ-CB-08 — checksum (BancoSol DERIVADO real + DESCUADRE sintético)
  // ============================================================

  it('BancoSol (DERIVADO): checksum cuadra sobre el fixture real de 20 movimientos', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
      { confirmarNumeroCuenta: false },
    );
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.estadoVerificacion).toBe('VERIFICADO');
  });

  // Regresión: el checksum DERIVADO consumía el orden CANÓNICO, que desempata
  // por monto y no por hora. En el export "Últimos 30" de Fortaleza el día más
  // antiguo trae tres créditos (45.000, 50.000, 41.000) y el ancla del saldo
  // caía en el de 41.000 — el cronológicamente ÚLTIMO del día — produciendo un
  // DESCUADRE fantasma de Bs 95.000 sobre 30 movimientos correctos. Este test
  // corre por el SERVICIO a propósito: congela el wiring, no solo el dominio.
  it('Fortaleza "Últimos 30" (DERIVADO): cuadra — el ancla del saldo sale del orden cronológico', async () => {
    const cb = await crearCuentaBancariaFortaleza('5651023390');
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('fortaleza-ultimos-30.xlsx'), 'fortaleza-ultimos-30.xlsx'),
      { confirmarNumeroCuenta: false },
    );
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(30);
    expect(res.estadoVerificacion).toBe('VERIFICADO');
  });

  it('DECLARADO que NO cuadra -> DESCUADRE con diferencia, la importación se completa igual (REQ-CB-08)', async () => {
    const cb = await crearCuentaBancaria(null);
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, estrategiaChecksum: 'DECLARADO' },
      movimientos: [movimientoFake({ tipo: 'CREDITO', monto: Money.of('100.00') })],
      saldoInicialDeclarado: Money.of('1000.00'),
      saldoFinalDeclarado: Money.of('5000.00'), // no cuadra: 1000+100 != 5000
      numeroCuentaDeclarado: null,
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.estadoVerificacion).toBe('DESCUADRE');
    expect(res.diferencia).toBe('3900.00');
    expect(res.movimientosNuevos).toBe(1); // NUNCA rechaza — decisión 3
  });

  // REQ-CB-08 (modificado): la importación persiste los saldos que el checksum
  // USÓ, en AMBAS estrategias. Antes solo se persistían los de la rama
  // DECLARADO, dejándolos nulos en los 4 perfiles DERIVADO (BancoSol, BMSC,
  // Unión, Fortaleza) — lo que impedía verificar la continuidad entre
  // importaciones (REQ-CB-23) y fijar el punto de arranque del informe.
  it('DERIVADO: persiste saldoInicial Y saldoFinal — antes quedaban nulos en 4 de 7 perfiles', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
      { confirmarNumeroCuenta: false },
    );
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');

    const importacion = await prisma.importacionExtracto.findUniqueOrThrow({
      where: { id: res.importacionId },
    });
    expect(importacion.saldoInicial).not.toBeNull();
    expect(importacion.saldoFinal).not.toBeNull();
  });

  it('DECLARADO: sigue persistiendo ambos saldos de la cabecera, incluso con DESCUADRE', async () => {
    const cb = await crearCuentaBancaria(null);
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, estrategiaChecksum: 'DECLARADO' },
      movimientos: [movimientoFake({ tipo: 'CREDITO', monto: Money.of('100.00') })],
      saldoInicialDeclarado: Money.of('1000.00'),
      saldoFinalDeclarado: Money.of('5000.00'),
      numeroCuentaDeclarado: null,
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');

    const importacion = await prisma.importacionExtracto.findUniqueOrThrow({
      where: { id: res.importacionId },
    });
    expect(importacion.estadoVerificacion).toBe('DESCUADRE');
    expect(importacion.saldoInicial?.toFixed(2)).toBe('1000.00');
    expect(importacion.saldoFinal?.toFixed(2)).toBe('5000.00');
  });

  it('DERIVADO sin columna saldo: ambos quedan NULL — jamás se inventan', async () => {
    const cb = await crearCuentaBancaria(null);
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, estrategiaChecksum: 'DERIVADO' },
      movimientos: [movimientoFake({ tipo: 'CREDITO', monto: Money.of('100.00'), saldo: null })],
      numeroCuentaDeclarado: null,
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');

    const importacion = await prisma.importacionExtracto.findUniqueOrThrow({
      where: { id: res.importacionId },
    });
    expect(importacion.estadoVerificacion).toBe('SIN_VERIFICAR');
    expect(importacion.saldoInicial).toBeNull();
    expect(importacion.saldoFinal).toBeNull();
  });

  // ============================================================
  // REQ-CB-23 — la ceguera del checksum DERIVADO y quién la caza
  // ============================================================

  // ESTE es el test que justifica la continuidad entre importaciones.
  //
  // A un extracto DERIVADO de julio se le borra la ÚLTIMA fila antes de
  // subirlo. Lo que queda sigue siendo un prefijo coherente del saldo corrido
  // del banco, así que el checksum cierra y devuelve VERIFICADO sobre un
  // archivo MUTILADO — el borrado de los extremos es invisible para él.
  //
  // La continuidad contra el extracto de agosto sí lo detecta, y la magnitud
  // del salto es exactamente el monto de la fila borrada.
  it('borrar la última fila de un extracto DERIVADO pasa como VERIFICADO, y la continuidad lo delata', async () => {
    const cb = await crearCuentaBancaria(null);

    // Julio MUTILADO: la fila real de cierre (CREDITO 200 → saldo 900) no está.
    const julio = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, estrategiaChecksum: 'DERIVADO' },
      movimientos: [
        movimientoFake({
          fecha: FechaContable.of(2026, 7, 1),
          tipo: 'CREDITO',
          monto: Money.of('100.00'),
          saldo: Money.of('600.00'), // inicial derivado = 600 − 100 = 500
          descripcion: 'julio-1',
        }),
        movimientoFake({
          fecha: FechaContable.of(2026, 7, 31),
          tipo: 'CREDITO',
          monto: Money.of('100.00'),
          saldo: Money.of('700.00'),
          descripcion: 'julio-2',
        }),
      ],
      numeroCuentaDeclarado: null,
    });

    // Agosto: arranca donde cerraba el julio REAL (saldo 900), no el mutilado.
    const agosto = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, estrategiaChecksum: 'DERIVADO' },
      movimientos: [
        movimientoFake({
          fecha: FechaContable.of(2026, 8, 1),
          tipo: 'CREDITO',
          monto: Money.of('50.00'),
          saldo: Money.of('950.00'), // inicial derivado = 950 − 50 = 900
          descripcion: 'agosto-1',
        }),
        movimientoFake({
          fecha: FechaContable.of(2026, 8, 31),
          tipo: 'CREDITO',
          monto: Money.of('50.00'),
          saldo: Money.of('1000.00'),
          descripcion: 'agosto-2',
        }),
      ],
      numeroCuentaDeclarado: null,
    });

    const resJulio = await servicioConParsers([julio]).importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(Buffer.from('julio-mutilado')),
      { confirmarNumeroCuenta: false },
    );
    const resAgosto = await servicioConParsers([agosto]).importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(Buffer.from('agosto')),
      { confirmarNumeroCuenta: false },
    );
    if (resJulio.requiereConfirmacionCuenta || resAgosto.requiereConfirmacionCuenta) {
      throw new Error('unreachable');
    }

    // La ceguera: el archivo está mutilado y el checksum no se entera.
    expect(resJulio.estadoVerificacion).toBe('VERIFICADO');

    const importaciones = await prisma.importacionExtracto.findMany({
      where: { organizationId: tenantA, cuentaBancariaId: cb.id },
    });
    expect(importaciones).toHaveLength(2);

    const discontinuidades = detectarDiscontinuidades(
      importaciones.map((i) => ({
        id: i.id,
        desde: FechaContable.fromDbDate(i.fechaDesde),
        hasta: FechaContable.fromDbDate(i.fechaHasta),
        saldoInicial: i.saldoInicial === null ? null : Money.of(i.saldoInicial),
        saldoFinal: i.saldoFinal === null ? null : Money.of(i.saldoFinal),
      })),
    );

    // La continuidad SÍ lo caza, y el salto es el monto de la fila borrada.
    expect(discontinuidades).toHaveLength(1);
    expect(discontinuidades[0]?.anteriorId).toBe(resJulio.importacionId);
    expect(discontinuidades[0]?.siguienteId).toBe(resAgosto.importacionId);
    expect(discontinuidades[0]?.saldoFinalAnterior.toBob()).toBe('700.00');
    expect(discontinuidades[0]?.saldoInicialSiguiente.toBob()).toBe('900.00');
    expect(discontinuidades[0]?.diferencia.toBob()).toBe('200.00');
  });

  // ============================================================
  // REQ-CB-03 — perfil no coincide
  // ============================================================

  it('archivo de OTRO perfil (Económico) contra una CuentaBancaria BANCOSOL_XLSX -> 422 PERFIL_NO_COINCIDE, cero filas (task 3.27)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('economico-extracto.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({ code: 'CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE' });

    expect(
      (await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, { page: 1, limit: 10 })).total,
    ).toBe(0);
    expect(await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id)).toBe(0);
  });

  // ============================================================
  // REQ-CB-04 — .xls legacy
  // ============================================================

  it('.xls legacy (magic bytes OLE2) -> 422 XLS_LEGACY, nunca llega al parser', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();
    const buffer = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);

    await expect(
      service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
        confirmarNumeroCuenta: false,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_ARCHIVO_XLS_LEGACY' });
  });

  // ============================================================
  // REQ-CB-16 — número de cuenta
  // ============================================================

  it('número de cuenta coincide -> importa normal (task 3.22)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
      { confirmarNumeroCuenta: false },
    );
    expect(res.requiereConfirmacionCuenta).toBe(false);
  });

  it('número de OTRA cuenta del mismo banco -> 422 CUENTA_NO_COINCIDE con ambos números, cero filas (task 3.22)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-999'); // distinta a la del fixture real
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE',
      details: { numeroArchivo: '5799375-760-305', numeroCuentaDestino: '5799375-760-999' },
    });

    expect(
      (await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, { page: 1, limit: 10 })).total,
    ).toBe(0);
    expect(await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id)).toBe(0);
  });

  it('CuentaBancaria.numeroCuenta=null en la 1ra importación -> requiereConfirmacionCuenta, NO persiste nada (task 3.24)', async () => {
    const cb = await crearCuentaBancaria(null);
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
      { confirmarNumeroCuenta: false },
    );

    expect(res).toEqual({ requiereConfirmacionCuenta: true, numeroDetectado: '5799375-760-305' });
    expect(
      (await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, { page: 1, limit: 10 })).total,
    ).toBe(0);
    const cbTrasIntento = await cuentaBancariaRepo.findById(tenantA, cb.id);
    expect(cbTrasIntento?.numeroCuenta).toBeNull();
  });

  it('segundo viaje con confirmarNumeroCuenta=true -> persiste numeroCuenta e importa, misma TX (task 3.24/3.25)', async () => {
    const cb = await crearCuentaBancaria(null);
    const service = servicioReal();
    const buffer = leerFixture('bancosol-20-movimientos-checksum.xlsx');

    await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
      confirmarNumeroCuenta: false,
    });
    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
      confirmarNumeroCuenta: true,
    });

    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(20);

    const cbTrasConfirmar = await cuentaBancariaRepo.findById(tenantA, cb.id);
    expect(cbTrasConfirmar?.numeroCuenta).toBe('5799375-760-305');
  });

  it('REQ-CB-16 escenario 5: perfil expone pero el parser no logra extraer el número de ESTE archivo -> advertencia, SIGUE (task 3.23)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, exponeNumeroCuenta: true },
      movimientos: [movimientoFake()],
      numeroCuentaDeclarado: null, // el descriptor dice que SÍ expone, pero este archivo puntual no lo trajo
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });

    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(1); // SIGUE — no rechaza
    expect(res.advertencias).toContainEqual(
      expect.objectContaining({ codigo: 'CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE' }),
    );
  });

  it('perfil que NO expone número de cuenta -> advierte, SIGUE (design §4.4)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, exponeNumeroCuenta: false },
      movimientos: [movimientoFake()],
      numeroCuentaDeclarado: null,
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });

    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(1);
    expect(res.advertencias).toContainEqual(
      expect.objectContaining({ codigo: 'CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE' }),
    );
  });

  // ============================================================
  // REQ-CB-07 — dos movimientos idénticos el mismo día (ordinalDia)
  // ============================================================

  it('dos movimientos idénticos el mismo día sobreviven ambos, con ordinalDia 0 y 1 (task 3.20)', async () => {
    const cb = await crearCuentaBancaria(null);
    const idénticos = [
      movimientoFake({ referencia: 'ref-1' }),
      movimientoFake({ referencia: 'ref-1' }), // misma tupla completa salvo el orden de llegada
    ];
    const parser = fakeParser({
      descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, exponeNumeroCuenta: false },
      movimientos: idénticos,
      numeroCuentaDeclarado: null,
    });
    const service = servicioConParsers([parser]);

    const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
      confirmarNumeroCuenta: false,
    });

    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(2); // ninguno se descarta como duplicado del otro
  });

  // ============================================================
  // Orden de compuertas (REQ-CB-05, riesgo R12, task 3.26)
  // ============================================================

  it('tras un rechazo por perfil, count(ImportacionExtracto)===0 y NUNCA se reporta "0 nuevos / 0 ya existían"', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('economico-extracto.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toBeDefined();

    const { total } = await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, {
      page: 1,
      limit: 10,
    });
    expect(total).toBe(0);
  });

  it('tras un rechazo por cuenta (REQ-CB-16), count(ImportacionExtracto)===0', async () => {
    const cb = await crearCuentaBancaria('5799375-760-999');
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toBeDefined();

    const { total } = await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, {
      page: 1,
      limit: 10,
    });
    expect(total).toBe(0);
  });

  // ============================================================
  // REQ-CB-06 — metadata sin binario
  // ============================================================

  it('la importación registra metadata (sha256, rango, contadores) — el service no depende de ningún StoragePort (R-2)', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();
    const buffer = leerFixture('bancosol-20-movimientos-checksum.xlsx');

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(buffer, 'mi-extracto.xlsx'),
      {
        confirmarNumeroCuenta: false,
      },
    );
    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');

    const importacion = await importacionRepo.findById(tenantA, res.importacionId);
    expect(importacion?.nombreArchivo).toBe('mi-extracto.xlsx');
    expect(importacion?.sha256Archivo).toHaveLength(64);
    expect(importacion?.filasLeidas).toBe(20);
    expect(importacion?.movimientosNuevos).toBe(20);
    expect(importacion?.movimientosDuplicados).toBe(0);
  });

  // ============================================================
  // REQ-CB-13 — CuentaBancaria inexistente
  // ============================================================

  it('CuentaBancaria de otro tenant -> 404 lógico', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();

    await expect(
      service.importar(
        'tenant-inexistente',
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-a-mayo-junio.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({ code: 'CONCILIACION_CUENTA_BANCARIA_NO_ENCONTRADA' });
  });

  it('perfil sin parser registrado -> error de negocio, NO crash (regresión de la rama "sin adapter" de ExtractoParserLookupService)', async () => {
    // Desde el slice 4 los 3 perfiles de v1 tienen adapter en producción
    // (`servicioReal()`) — este test fuerza la rama deliberadamente con una
    // lista de parsers INCOMPLETA (solo BancoSol) para seguir cubriendo el
    // código de "perfil sin adapter" de `ExtractoParserLookupService`, sin
    // afirmar que Unión carece de adapter (ya no es cierto).
    const cb = await crearCuentaBancariaUnion(null);
    const service = servicioConParsers([new XlsxCoreExtractoParser(DIALECTO_BANCOSOL)]);

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-a-mayo-junio.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({ code: 'CONCILIACION_ARCHIVO_PERFIL_NO_SOPORTADO' });
  });

  // ============================================================
  // Slice 4 — Unión XLSX (REQ-CB-16, task 4.10)
  // ============================================================

  it('Unión XLSX: número de cuenta coincide -> importa normal, 21 movimientos, checksum VERIFICADO (DERIVADO, task 4.10)', async () => {
    const cb = await crearCuentaBancariaUnion('86698879426068');
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('union-extracto-por-rango.xlsx')),
      { confirmarNumeroCuenta: false },
    );

    if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
    expect(res.movimientosNuevos).toBe(21);
    expect(res.movimientosDuplicados).toBe(0);
    expect(res.estadoVerificacion).toBe('VERIFICADO');
  });

  it('Unión XLSX: número de OTRA cuenta -> 422 CUENTA_NO_COINCIDE con ambos números, cero filas persistidas (task 4.10)', async () => {
    const cb = await crearCuentaBancariaUnion('86698879426068-999'); // distinta a la del fixture real
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('union-extracto-por-rango.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE',
      details: { numeroArchivo: '86698879426068', numeroCuentaDestino: '86698879426068-999' },
    });

    expect(
      (await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, { page: 1, limit: 10 })).total,
    ).toBe(0);
    expect(await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id)).toBe(0);
  });

  it('Unión XLSX: CuentaBancaria.numeroCuenta=null en la 1ra importación -> requiereConfirmacionCuenta, NO persiste nada (task 4.10)', async () => {
    const cb = await crearCuentaBancariaUnion(null);
    const service = servicioReal();

    const res = await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('union-extracto-por-rango.xlsx')),
      { confirmarNumeroCuenta: false },
    );

    expect(res).toEqual({ requiereConfirmacionCuenta: true, numeroDetectado: '86698879426068' });
    expect(
      (await importacionRepo.listarPorCuentaBancaria(tenantA, cb.id, { page: 1, limit: 10 })).total,
    ).toBe(0);
  });

  it('Unión XLSX: archivo de OTRO perfil (BancoSol) contra una CuentaBancaria UNION_XLSX -> 422 PERFIL_NO_COINCIDE, cero filas (task 4.10)', async () => {
    const cb = await crearCuentaBancariaUnion('86698879426068');
    const service = servicioReal();

    await expect(
      service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-a-mayo-junio.xlsx')),
        { confirmarNumeroCuenta: false },
      ),
    ).rejects.toMatchObject({ code: 'CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE' });

    expect(await movimientoRepo.contarPorCuentaBancaria(tenantA, cb.id)).toBe(0);
  });

  // ============================================================
  // REQ-CB-13 — MovimientoBancario/ImportacionExtracto de esta cuenta jamás visibles a otro tenant
  // ============================================================

  it('los movimientos importados no son visibles con el tenantId de otra organización', async () => {
    const cb = await crearCuentaBancaria('5799375-760-305');
    const service = servicioReal();
    await service.importar(
      tenantA,
      cb.id,
      'user-1',
      archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
      { confirmarNumeroCuenta: false },
    );

    const orgB = await prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } });
    expect(await movimientoRepo.contarPorCuentaBancaria(orgB.id, cb.id)).toBe(0);
  });

  // ============================================================
  // REQ-CB-21 — la importación persiste `ordenFisico` (change
  // `verificador-movimientos-bancarios`). El hash de dedup NO cambia.
  // ============================================================

  describe('REQ-CB-21 — ordenFisico', () => {
    // El hash incluye cuentaBancariaId, así que el GATE necesita un id FIJO
    // para poder congelar los valores esperados entre corridas.
    const CUENTA_BANCARIA_ID_GATE = '00000000-0000-4000-8000-00000000cb01';

    /**
     * Resumen determinístico de los hashes de la cuenta: sha256 de la lista
     * ordenada. Congela el CONJUNTO exacto de hashes sin listar los 20.
     */
    async function resumenHashes(cuentaBancariaId: string): Promise<string> {
      const movs = await prisma.movimientoBancario.findMany({
        where: { organizationId: tenantA, cuentaBancariaId },
        select: { hashDedup: true },
      });
      const ordenados = movs.map((m) => m.hashDedup).sort();
      return createHash('sha256').update(ordenados.join('\n')).digest('hex');
    }

    async function movimientosDe(cuentaBancariaId: string) {
      return prisma.movimientoBancario.findMany({
        where: { organizationId: tenantA, cuentaBancariaId },
      });
    }

    it('GATE: los hashes del fixture BancoSol son EXACTAMENTE los de antes del change', async () => {
      // Valor capturado con el código PRE-change (aprobación). Si este test
      // rompe, la captura de ordenFisico alteró la entrada de
      // calcularHashDedup y una re-importación duplicaría TODO: PARAR.
      const RESUMEN_PRE_CHANGE = '5518124c8399979923d1c05115bbd5ba9ace9491f2ed0b15cb2bac4aa49fa40d';

      await prisma.cuentaBancaria.create({
        data: {
          id: CUENTA_BANCARIA_ID_GATE,
          organizationId: tenantA,
          cuentaId: cuentaIdA,
          alias: 'Cuenta gate hashes',
          perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
          numeroCuenta: '5799375-760-305',
          moneda: 'BOB',
        },
      });
      const service = servicioReal();

      const res = await service.importar(
        tenantA,
        CUENTA_BANCARIA_ID_GATE,
        'user-1',
        archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
        { confirmarNumeroCuenta: false },
      );
      if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
      expect(res.movimientosNuevos).toBe(20);

      expect(await resumenHashes(CUENTA_BANCARIA_ID_GATE)).toBe(RESUMEN_PRE_CHANGE);
    });

    it('importación ASC (BancoSol): ordenFisico 0..N-1 único y sigue la cronología', async () => {
      const cb = await crearCuentaBancaria('5799375-760-305');
      const service = servicioReal();

      await service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
        { confirmarNumeroCuenta: false },
      );

      const movs = await movimientosDe(cb.id);
      expect(movs).toHaveLength(20);
      const ordenes = movs.map((m) => m.ordenFisico).sort((a, b) => (a ?? -1) - (b ?? -1));
      expect(ordenes).toEqual(Array.from({ length: 20 }, (_, i) => i));

      // ordenFisico ASC ⇒ fecha no-decreciente (cronología, nunca fila cruda)
      const porOrden = [...movs].sort((a, b) => a.ordenFisico! - b.ordenFisico!);
      for (let i = 1; i < porOrden.length; i++) {
        expect(porOrden[i]!.fecha.getTime()).toBeGreaterThanOrEqual(
          porOrden[i - 1]!.fecha.getTime(),
        );
      }
    });

    it('export DESC (Fortaleza "Últimos 30"): el cronológicamente primero recibe 0 y la fila física 0 el máximo', async () => {
      const cb = await crearCuentaBancariaFortaleza('5651023390');
      const service = servicioReal();

      await service.importar(
        tenantA,
        cb.id,
        'user-1',
        archivoDe(leerFixture('fortaleza-ultimos-30.xlsx'), 'fortaleza-ultimos-30.xlsx'),
        { confirmarNumeroCuenta: false },
      );

      const movs = await movimientosDe(cb.id);
      expect(movs).toHaveLength(30);
      const porOrden = [...movs].sort((a, b) => a.ordenFisico! - b.ordenFisico!);

      // Cronología global: si se hubiera usado el índice físico crudo, el
      // export DESC saldría con fecha no-CRECIENTE y esto rompería.
      for (let i = 1; i < porOrden.length; i++) {
        expect(porOrden[i]!.fecha.getTime()).toBeGreaterThanOrEqual(
          porOrden[i - 1]!.fecha.getTime(),
        );
      }

      // El día más antiguo del fixture abre con TRES créditos (17:36 → 45.000,
      // 17:37 → 50.000, 17:38 → 41.000 — el caso del descuadre fantasma de
      // PR #250): sus ordenFisico deben ser 0,1,2 siguiendo la hora real.
      const diaMasAntiguo = porOrden[0]!.fecha.getTime();
      const delDia = porOrden.filter((m) => m.fecha.getTime() === diaMasAntiguo);
      expect(delDia.map((m) => m.hora)).toEqual(['17:36:00', '17:37:00', '17:38:00']);
      expect(delDia.map((m) => m.ordenFisico)).toEqual([0, 1, 2]);
    });

    it('secuencia NO_MONOTONA: todos se persisten con ordenFisico=null — nunca se adivina', async () => {
      const cb = await crearCuentaBancaria(null);
      const desordenados = [
        movimientoFake({ fecha: FechaContable.of(2026, 6, 15), referencia: 'r1' }),
        movimientoFake({ fecha: FechaContable.of(2026, 6, 10), referencia: 'r2' }),
        movimientoFake({ fecha: FechaContable.of(2026, 6, 20), referencia: 'r3' }),
      ];
      const parser = fakeParser({
        descriptor: { perfil: PerfilExtracto.BANCOSOL_XLSX, exponeNumeroCuenta: false },
        movimientos: desordenados,
        numeroCuentaDeclarado: null,
      });
      const service = servicioConParsers([parser]);

      const res = await service.importar(tenantA, cb.id, 'user-1', archivoDe(Buffer.from('x')), {
        confirmarNumeroCuenta: false,
      });
      if (res.requiereConfirmacionCuenta) throw new Error('unreachable');
      expect(res.movimientosNuevos).toBe(3);

      const movs = await movimientosDe(cb.id);
      expect(movs).toHaveLength(3);
      expect(movs.map((m) => m.ordenFisico)).toEqual([null, null, null]);
    });

    it('reimportar sobre preexistentes con ordenFisico=null: 0 nuevos, N ya existían, y siguen null', async () => {
      const cb = await crearCuentaBancaria('5799375-760-305');
      const service = servicioReal();
      const buffer = leerFixture('bancosol-20-movimientos-checksum.xlsx');

      await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
        confirmarNumeroCuenta: false,
      });
      // Simula filas importadas ANTES del change (columna recién agregada, null)
      await prisma.movimientoBancario.updateMany({
        where: { organizationId: tenantA, cuentaBancariaId: cb.id },
        data: { ordenFisico: null },
      });

      const segunda = await service.importar(tenantA, cb.id, 'user-1', archivoDe(buffer), {
        confirmarNumeroCuenta: false,
      });
      if (segunda.requiereConfirmacionCuenta) throw new Error('unreachable');
      expect(segunda.movimientosNuevos).toBe(0);
      expect(segunda.movimientosDuplicados).toBe(20);

      const movs = await movimientosDe(cb.id);
      expect(movs).toHaveLength(20);
      expect(movs.every((m) => m.ordenFisico === null)).toBe(true);
    });
  });
});
