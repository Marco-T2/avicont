/**
 * E2E — Importación de extractos bancarios (slice 3 de `conciliacion-bancaria`,
 * pack `contabilidad.conciliacion`).
 *
 * Requiere Postgres corriendo. Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/conciliacion-importaciones.e2e-spec.ts --runInBand --forceExit
 *
 * Cubre (task 3.32):
 *   - Flujo completo vía HTTP: crear cuenta bancaria -> importar -> contadores correctos.
 *   - 403 sin `.importar`.
 *   - 404 sin pack activo.
 *   - 422 en cada rechazo (perfil no coincide, .xls legacy, cuenta no coincide).
 *   - GET /perfiles.
 *   - Flujo de confirmación de número de cuenta (REQ-CB-16).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta, SystemRole, TipoPack, VerticalPack } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

const PACK_CLAVE = 'contabilidad.conciliacion';
const PASSWORD = 'password123';
const FIXTURES_DIR = join(
  __dirname,
  '..',
  'src',
  'conciliacion-bancaria',
  'adapters',
  '__fixtures__',
);

function fixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

describe('ConciliacionImportaciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // ==========================================================
  // Fixtures
  // ==========================================================

  async function crearPack(): Promise<string> {
    const pack = await prisma.pack.create({
      data: {
        clave: PACK_CLAVE,
        nombre: 'Conciliación bancaria',
        descripcion: 'Importa extractos bancarios y concilia movimientos.',
        verticalAplicable: VerticalPack.CONTABILIDAD,
        tipo: TipoPack.DOMINIO,
        otorgadoPorDefecto: true,
      },
    });
    return pack.id;
  }

  async function otorgarPackActivo(orgId: string, packId: string, userId: string): Promise<void> {
    await prisma.orgPackEntitlement.create({
      data: { organizationId: orgId, packId, activo: true, habilitadoPorUserId: userId },
    });
  }

  async function seed(slug = 'org-imp') {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@cb.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: org.id,
        codigoInterno: '1.1.1.001',
        nombre: 'Caja Moneda Nacional',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@cb.bo`, password: PASSWORD });
    const token = loginRes.body.accessToken as string;

    return { token, orgId: org.id, ownerId: owner.id, cuentaId: cuenta.id };
  }

  async function seedMiembroSinImportar(orgId: string, slug = 'org-imp') {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@cb.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'solo-lectura-conciliacion',
        name: 'Solo lectura conciliación',
        permissions: ['contabilidad.conciliacion.read'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@cb.bo`, password: PASSWORD });
    return loginRes.body.accessToken as string;
  }

  async function crearCuentaBancaria(
    token: string,
    cuentaId: string,
    overrides: { perfilExtracto?: string; numeroCuenta?: string | null } = {},
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/cuentas-bancarias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cuentaId,
        alias: 'Cuenta corriente BancoSol',
        perfilExtracto: overrides.perfilExtracto ?? 'BANCOSOL_XLSX',
        moneda: 'BOB',
        ...(overrides.numeroCuenta !== undefined ? { numeroCuenta: overrides.numeroCuenta } : {}),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function importar(token: string, cuentaBancariaId: string, buffer: Buffer, confirmar?: boolean) {
    const req = request(app.getHttpServer())
      .post(`/api/cuentas-bancarias/${cuentaBancariaId}/importaciones`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'extracto.xlsx');
    if (confirmar !== undefined) {
      return req.field('confirmarNumeroCuenta', confirmar ? 'true' : 'false');
    }
    return req;
  }

  // ==========================================================
  // GET /perfiles
  // ==========================================================

  it('GET /perfiles — catálogo de perfiles con adapter registrado (BancoSol + Económico + Unión, task 4.12)', async () => {
    const { token, orgId, ownerId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);

    const res = await request(app.getHttpServer())
      .get('/api/cuentas-bancarias/perfiles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const perfiles = res.body.map((p: { perfil: string }) => p.perfil);
    // Regresión (task 4.12): los 3 perfiles de v1 conviven sin colisión —
    // el bootstrap de `ExtractoParserRegistry` (fail-fast) no rompe el
    // arranque de la app y `GET /perfiles` sigue respondiendo.
    expect(perfiles).toContain('BANCOSOL_XLSX');
    expect(perfiles).toContain('ECONOMICO_XLSX');
    expect(perfiles).toContain('UNION_XLSX');
    expect(perfiles).toHaveLength(3);
  });

  // ==========================================================
  // 404 sin pack activo
  // ==========================================================

  it('404 sin pack activo', async () => {
    const { token, cuentaId } = await seed();
    const cuentaBancariaId = 'no-existe'; // pack no está activo -> el guard corta antes de tocar el service

    const res = await importar(token, cuentaBancariaId, fixture('bancosol-a-mayo-junio.xlsx'));
    expect(res.status).toBe(404);
    void cuentaId;
  });

  // ==========================================================
  // 403 sin permiso .importar
  // ==========================================================

  it('403 sin permiso contabilidad.conciliacion.importar', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: '5799375-760-305' });
    const tokenSinPermiso = await seedMiembroSinImportar(orgId);

    const res = await importar(tokenSinPermiso, cbId, fixture('bancosol-a-mayo-junio.xlsx'));
    expect(res.status).toBe(403);
  });

  // ==========================================================
  // Flujo completo — éxito con contadores correctos
  // ==========================================================

  it('flujo completo: crear cuenta bancaria -> importar -> contadores correctos (60 nuevos)', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: '5799375-760-305' });

    const res = await importar(token, cbId, fixture('bancosol-a-mayo-junio.xlsx'), false);

    expect(res.status).toBe(200);
    expect(res.body.requiereConfirmacionCuenta).toBe(false);
    expect(res.body.movimientosNuevos).toBe(60);
    expect(res.body.movimientosDuplicados).toBe(0);
    expect(res.body.filasLeidas).toBe(60);
    expect(res.body.estadoVerificacion).toBe('VERIFICADO');

    const listado = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${cbId}/importaciones`)
      .set('Authorization', `Bearer ${token}`);
    expect(listado.status).toBe(200);
    expect(listado.body.total).toBe(1);
    expect(listado.body.items[0].movimientosNuevos).toBe(60);
  });

  // ==========================================================
  // 422 — REQ-CB-03 perfil no coincide
  // ==========================================================

  it('422 CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE — archivo de Económico contra cuenta BancoSol', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: '5799375-760-305' });

    const res = await importar(token, cbId, fixture('economico-extracto.xlsx'), false);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE');
  });

  // ==========================================================
  // 422 — REQ-CB-04 .xls legacy
  // ==========================================================

  it('422 CONCILIACION_ARCHIVO_XLS_LEGACY — magic bytes OLE2', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: '5799375-760-305' });

    const ole2 = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);
    const res = await importar(token, cbId, ole2, false);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_ARCHIVO_XLS_LEGACY');
  });

  // ==========================================================
  // 422 — REQ-CB-16 cuenta no coincide
  // ==========================================================

  it('422 CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE — número de otra cuenta del mismo banco', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: '5799375-760-999' });

    const res = await importar(
      token,
      cbId,
      fixture('bancosol-20-movimientos-checksum.xlsx'),
      false,
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE');
    expect(res.body.error.details.numeroArchivo).toBe('5799375-760-305');
    expect(res.body.error.details.numeroCuentaDestino).toBe('5799375-760-999');
  });

  // ==========================================================
  // REQ-CB-16 — flujo de confirmación de número de cuenta
  // ==========================================================

  it('numeroCuenta=null -> requiereConfirmacionCuenta; confirmando -> importa y persiste el número', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const cbId = await crearCuentaBancaria(token, cuentaId, { numeroCuenta: null });

    const primerViaje = await importar(
      token,
      cbId,
      fixture('bancosol-20-movimientos-checksum.xlsx'),
      false,
    );
    expect(primerViaje.status).toBe(200);
    expect(primerViaje.body.requiereConfirmacionCuenta).toBe(true);
    expect(primerViaje.body.numeroDetectado).toBe('5799375-760-305');

    const listadoTrasPrimero = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${cbId}/importaciones`)
      .set('Authorization', `Bearer ${token}`);
    expect(listadoTrasPrimero.body.total).toBe(0);

    const segundoViaje = await importar(
      token,
      cbId,
      fixture('bancosol-20-movimientos-checksum.xlsx'),
      true,
    );
    expect(segundoViaje.status).toBe(200);
    expect(segundoViaje.body.requiereConfirmacionCuenta).toBe(false);
    expect(segundoViaje.body.movimientosNuevos).toBe(20);

    const cbActualizada = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${cbId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(cbActualizada.body.numeroCuenta).toBe('5799375-760-305');
  });
});
