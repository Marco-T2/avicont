/**
 * E2E — Cuentas bancarias (slice 1 de `conciliacion-bancaria`, pack
 * `contabilidad.conciliacion`).
 *
 * Requiere Postgres corriendo. Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/cuentas-bancarias.e2e-spec.ts --runInBand --forceExit
 *
 * Cubre (task 1.11):
 *   - CRUD completo (POST/GET/PATCH/DELETE) con pack activo + permisos.
 *   - 404 cross-tenant (REQ-CB-13).
 *   - 403 sin permiso.
 *   - 404 sin pack activo (PackEnabledGuard).
 */

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

describe('CuentasBancarias (e2e)', () => {
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

  // `cleanupTestData` borra la tabla `packs` entera — hay que re-sembrar el
  // pack en cada test, igual que `comprobantes-adjuntos.e2e-spec.ts`.
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

  // La org se crea directo por Prisma (no vía TenantsService.create), así que
  // el auto-otorgamiento del pack (slice 0) no corre — se arma a mano acá.
  async function seed(slug = 'org-cb') {
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

  // Miembro con CustomRole que NO incluye los permisos de conciliación.
  async function seedMiembroSinPermiso(orgId: string, slug = 'org-cb') {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@cb.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'solo-lectura-comprobantes',
        name: 'Solo lectura comprobantes',
        permissions: ['contabilidad.asientos.read'],
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

  function crear(
    token: string,
    overrides: Partial<{
      cuentaId: string;
      alias: string;
      perfilExtracto: string;
      numeroCuenta: string | null;
      moneda: string;
    }> = {},
    cuentaId?: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/cuentas-bancarias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cuentaId: overrides.cuentaId ?? cuentaId,
        alias: overrides.alias ?? 'Cuenta corriente BancoSol',
        perfilExtracto: overrides.perfilExtracto ?? 'BANCOSOL_XLSX',
        moneda: overrides.moneda ?? 'BOB',
        ...(overrides.numeroCuenta !== undefined ? { numeroCuenta: overrides.numeroCuenta } : {}),
      });
  }

  // ==========================================================
  // 404 sin pack activo
  // ==========================================================

  it('404 sin pack activo — PackEnabledGuard', async () => {
    const { token, cuentaId } = await seed();
    // Pack NO sembrado / NO entitlement — el endpoint "no existe" para esta org.

    const res = await crear(token, {}, cuentaId);
    expect(res.status).toBe(404);
  });

  it('404 sin pack activo — pack habilitado pero activo=false', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await prisma.orgPackEntitlement.create({
      data: { organizationId: orgId, packId, activo: false, habilitadoPorUserId: ownerId },
    });

    const res = await crear(token, {}, cuentaId);
    expect(res.status).toBe(404);
  });

  // ==========================================================
  // CRUD completo con pack activo
  // ==========================================================

  it('CRUD completo — crear, listar, obtener, actualizar, eliminar', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);

    // Crear
    const crearRes = await crear(token, {}, cuentaId);
    expect(crearRes.status).toBe(201);
    expect(crearRes.body.cuentaId).toBe(cuentaId);
    expect(crearRes.body.perfilExtracto).toBe('BANCOSOL_XLSX');
    expect(crearRes.body.numeroCuenta).toBeNull();
    expect(crearRes.body.activa).toBe(true);
    const id = crearRes.body.id as string;

    // Listar
    const listarRes = await request(app.getHttpServer())
      .get('/api/cuentas-bancarias')
      .set('Authorization', `Bearer ${token}`);
    expect(listarRes.status).toBe(200);
    expect(listarRes.body.items).toHaveLength(1);
    expect(listarRes.body.items[0].id).toBe(id);
    expect(listarRes.body.total).toBe(1);

    // Obtener
    const obtenerRes = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(obtenerRes.status).toBe(200);
    expect(obtenerRes.body.id).toBe(id);

    // Actualizar (alias + numeroCuenta capturado en la "primera importación" simulada)
    const actualizarRes = await request(app.getHttpServer())
      .patch(`/api/cuentas-bancarias/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ alias: 'BancoSol — cuenta principal', numeroCuenta: '1191959-000-001' });
    expect(actualizarRes.status).toBe(200);
    expect(actualizarRes.body.alias).toBe('BancoSol — cuenta principal');
    expect(actualizarRes.body.numeroCuenta).toBe('1191959-000-001');

    // Eliminar
    const eliminarRes = await request(app.getHttpServer())
      .delete(`/api/cuentas-bancarias/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(eliminarRes.status).toBe(204);

    const obtenerPostDeleteRes = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(obtenerPostDeleteRes.status).toBe(404);
  });

  it('crear — 409 CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA con cuentaId ya vinculado', async () => {
    const { token, orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);

    const primera = await crear(token, {}, cuentaId);
    expect(primera.status).toBe(201);

    const segunda = await crear(token, { perfilExtracto: 'ECONOMICO_XLSX' }, cuentaId);
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.code).toBe('CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA');
  });

  it('crear — 422 CONCILIACION_MONEDA_INCOMPATIBLE si la cuenta no permite multi-moneda', async () => {
    const { token, orgId, ownerId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);

    const cuentaRestringida = await prisma.cuenta.create({
      data: {
        organizationId: orgId,
        codigoInterno: '1.1.1.002',
        nombre: 'Caja BOB estricta',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
        permiteMultiMoneda: false,
        monedaFuncional: 'BOB',
      },
    });

    const res = await crear(token, { moneda: 'USD' }, cuentaRestringida.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_MONEDA_INCOMPATIBLE');
  });

  // ==========================================================
  // 403 sin permiso
  // ==========================================================

  it('403 sin permiso de creación', async () => {
    const { orgId, ownerId, cuentaId } = await seed();
    const packId = await crearPack();
    await otorgarPackActivo(orgId, packId, ownerId);
    const tokenSinPermiso = await seedMiembroSinPermiso(orgId);

    const res = await crear(tokenSinPermiso, {}, cuentaId);
    expect(res.status).toBe(403);
  });

  // ==========================================================
  // 404 cross-tenant (REQ-CB-13)
  // ==========================================================

  it('404 cross-tenant — obtener una cuenta bancaria de otro tenant', async () => {
    const {
      token: tokenA,
      orgId: orgA,
      ownerId: ownerA,
      cuentaId: cuentaA,
    } = await seed('org-cb-a');
    const packId = await crearPack();
    await otorgarPackActivo(orgA, packId, ownerA);

    const crearRes = await crear(tokenA, {}, cuentaA);
    expect(crearRes.status).toBe(201);
    const id = crearRes.body.id as string;

    const { token: tokenB, orgId: orgB, ownerId: ownerB } = await seed('org-cb-b');
    await otorgarPackActivo(orgB, packId, ownerB);

    const res = await request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant — listado siempre acotado al tenant activo', async () => {
    const {
      token: tokenA,
      orgId: orgA,
      ownerId: ownerA,
      cuentaId: cuentaA,
    } = await seed('org-cb-a');
    const packId = await crearPack();
    await otorgarPackActivo(orgA, packId, ownerA);
    await crear(tokenA, {}, cuentaA);

    const {
      token: tokenB,
      orgId: orgB,
      ownerId: ownerB,
      cuentaId: cuentaB,
    } = await seed('org-cb-b');
    await otorgarPackActivo(orgB, packId, ownerB);
    await crear(tokenB, {}, cuentaB);

    const listarA = await request(app.getHttpServer())
      .get('/api/cuentas-bancarias')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listarA.body.items).toHaveLength(1);
    expect(listarA.body.items[0].cuentaId).toBe(cuentaA);
  });
});
