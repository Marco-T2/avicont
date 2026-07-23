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
import { DIALECTO_ECONOMICO } from './adapters/dialectos/economico.dialecto';
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
      new XlsxCoreExtractoParser(DIALECTO_BANCOSOL),
      new XlsxCoreExtractoParser(DIALECTO_ECONOMICO),
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

  it('perfil sin parser registrado todavía (UNION_XLSX, slice 4 pendiente) -> error de negocio, NO crash', async () => {
    const cb = await cuentaBancariaRepo.create(tenantA, {
      cuentaId: cuentaIdA,
      alias: 'Cuenta Unión',
      perfilExtracto: PerfilExtracto.UNION_XLSX,
      numeroCuenta: null,
      moneda: 'BOB',
    });
    const service = servicioReal(); // solo 2 parsers: BancoSol + Económico

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
});
