import {
  ClaseCuenta,
  EstadoVerificacionExtracto,
  NaturalezaCuenta,
  PerfilExtracto,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaImportacionExtractoRepository } from './prisma-importacion-extracto.repository';
import { PrismaMovimientoBancarioRepository } from './prisma-movimiento-bancario.repository';

/**
 * Integration spec de `PrismaMovimientoBancarioRepository` +
 * `PrismaImportacionExtractoRepository` contra Postgres real. REQ-CB-13:
 * aislamiento cross-tenant en las 2 tablas nuevas de este slice.
 */
describe('PrismaMovimientoBancarioRepository + PrismaImportacionExtractoRepository (integration)', () => {
  const SLUG_A = 'org-test-mov-a';
  const SLUG_B = 'org-test-mov-b';

  let prisma: PrismaClient;
  let movRepo: PrismaMovimientoBancarioRepository;
  let impRepo: PrismaImportacionExtractoRepository;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancariaA: string;
  let cuentaBancariaB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    movRepo = new PrismaMovimientoBancarioRepository(prisma as unknown as PrismaService);
    impRepo = new PrismaImportacionExtractoRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [cuentaA, cuentaB] = await Promise.all([
      crearCuenta(tenantA, '1.1.1.001'),
      crearCuenta(tenantB, '1.1.1.001'),
    ]);

    const [cbA, cbB] = await Promise.all([
      crearCuentaBancaria(tenantA, cuentaA.id),
      crearCuentaBancaria(tenantB, cuentaB.id),
    ]);
    cuentaBancariaA = cbA.id;
    cuentaBancariaB = cbB.id;
  });

  async function crearCuenta(organizationId: string, codigoInterno: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre: `Caja ${codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
  }

  async function crearCuentaBancaria(organizationId: string, cuentaId: string) {
    return prisma.cuentaBancaria.create({
      data: {
        organizationId,
        cuentaId,
        alias: 'Cuenta corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda: 'BOB',
      },
    });
  }

  async function crearImportacion(tenantId: string, cuentaBancariaId: string) {
    return impRepo.crear(tenantId, {
      cuentaBancariaId,
      nombreArchivo: 'extracto.xlsx',
      sha256Archivo: 'a'.repeat(64),
      tamanioBytes: 1000,
      perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
      fechaDesde: new Date('2026-06-01T00:00:00Z'),
      fechaHasta: new Date('2026-06-30T00:00:00Z'),
      coberturaDeclarada: false,
      saldoInicial: null,
      saldoFinal: null,
      estadoVerificacion: EstadoVerificacionExtracto.SIN_VERIFICAR,
      diferencia: null,
      filasLeidas: 1,
      movimientosNuevos: 1,
      movimientosDuplicados: 0,
      importadoPorUserId: 'user-1',
    });
  }

  function movimiento(
    hashDedup: string,
    overrides: Partial<Parameters<typeof movRepo.crearMuchos>[3][number]> = {},
  ) {
    return {
      fecha: new Date('2026-06-15T00:00:00Z'),
      hora: null,
      monto: new Prisma.Decimal('100.00'),
      tipo: 'DEBITO' as const,
      moneda: 'BOB' as const,
      descripcion: 'Movimiento test',
      descripcionNormalizada: 'MOVIMIENTO TEST',
      referencia: null,
      saldo: new Prisma.Decimal('500.00'),
      contraparteNombre: null,
      contraparteDocumento: null,
      datosOriginales: {},
      ordinalDia: 0,
      hashDedup,
      ...overrides,
    };
  }

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

  // ==========================================================
  // ImportacionExtracto — REQ-CB-06 + REQ-CB-13
  // ==========================================================

  it('crear — persiste metadata sin binario (REQ-CB-06)', async () => {
    const imp = await crearImportacion(tenantA, cuentaBancariaA);
    expect(imp.organizationId).toBe(tenantA);
    expect(imp.sha256Archivo).toHaveLength(64);
  });

  it('REQ-CB-13 — findById devuelve null para una importación de otro tenant', async () => {
    const imp = await crearImportacion(tenantA, cuentaBancariaA);
    expect(await impRepo.findById(tenantB, imp.id)).toBeNull();
    expect(await impRepo.findById(tenantA, imp.id)).not.toBeNull();
  });

  it('REQ-CB-13 — listarPorCuentaBancaria siempre acotado al tenant activo', async () => {
    await crearImportacion(tenantA, cuentaBancariaA);
    await crearImportacion(tenantB, cuentaBancariaB);

    const { items, total } = await impRepo.listarPorCuentaBancaria(tenantA, cuentaBancariaA, {
      page: 1,
      limit: 20,
    });
    expect(total).toBe(1);
    expect(items.every((i) => i.organizationId === tenantA)).toBe(true);
  });

  // ==========================================================
  // MovimientoBancario — REQ-CB-05/07 idempotencia + REQ-CB-13
  // ==========================================================

  it('crearMuchos — idempotencia estructural: reimportar el mismo hash no duplica', async () => {
    const imp = await crearImportacion(tenantA, cuentaBancariaA);

    const primeraTanda = await movRepo.crearMuchos(tenantA, cuentaBancariaA, imp.id, [
      movimiento('hash-1'),
      movimiento('hash-2'),
    ]);
    expect(primeraTanda.insertados).toBe(2);

    const imp2 = await crearImportacion(tenantA, cuentaBancariaA);
    const segundaTanda = await movRepo.crearMuchos(tenantA, cuentaBancariaA, imp2.id, [
      movimiento('hash-1'), // duplicado
      movimiento('hash-3'), // nuevo
    ]);
    expect(segundaTanda.insertados).toBe(1);

    const total = await movRepo.contarPorCuentaBancaria(tenantA, cuentaBancariaA);
    expect(total).toBe(3);
  });

  it('REQ-CB-13 — contarPorCuentaBancaria nunca cuenta movimientos de otro tenant', async () => {
    const impA = await crearImportacion(tenantA, cuentaBancariaA);
    const impB = await crearImportacion(tenantB, cuentaBancariaB);

    await movRepo.crearMuchos(tenantA, cuentaBancariaA, impA.id, [movimiento('hash-a')]);
    await movRepo.crearMuchos(tenantB, cuentaBancariaB, impB.id, [movimiento('hash-b')]);

    expect(await movRepo.contarPorCuentaBancaria(tenantA, cuentaBancariaA)).toBe(1);
    // Consultar la cuenta bancaria de B con el tenantId de A no debe verla:
    expect(await movRepo.contarPorCuentaBancaria(tenantA, cuentaBancariaB)).toBe(0);
  });

  it('$@unique([cuentaBancariaId, hashDedup])$ permite el MISMO hash en cuentas bancarias distintas', async () => {
    const impA = await crearImportacion(tenantA, cuentaBancariaA);
    const impB = await crearImportacion(tenantB, cuentaBancariaB);

    const resA = await movRepo.crearMuchos(tenantA, cuentaBancariaA, impA.id, [
      movimiento('hash-compartido'),
    ]);
    const resB = await movRepo.crearMuchos(tenantB, cuentaBancariaB, impB.id, [
      movimiento('hash-compartido'),
    ]);

    expect(resA.insertados).toBe(1);
    expect(resB.insertados).toBe(1);
  });
});
