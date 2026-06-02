import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TipoPack, VerticalPack } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { RedisService } from '../src/cache/redis.service';
import {
  cleanupTestData,
  createTestMembership,
  createTestTenant,
  createTestUser,
  prisma,
} from './helpers/test-factory';

/**
 * E2E del Slice 5 (entitlement admin): el super-admin habilita/revoca packs a
 * una org vía `/admin/platform/orgs/:id/packs`. Cubre autorización (403 si no
 * SA), validación de vertical (§8), creación con `activo=false`, revocación,
 * invalidación de cache y auditoría en `platform_audit`.
 *
 * `cleanupTestData` borra todos los `Pack`, así que cada test siembra el
 * catálogo que necesita.
 */
async function buildApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
  );
  await app.init();
  return app;
}

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function seedPack(overrides: {
  clave: string;
  verticalAplicable: VerticalPack;
}): Promise<{ id: string; clave: string }> {
  const pack = await prisma.pack.create({
    data: {
      clave: overrides.clave,
      nombre: overrides.clave,
      verticalAplicable: overrides.verticalAplicable,
      tipo: TipoPack.CAPACIDAD,
    },
  });
  return { id: pack.id, clave: pack.clave };
}

describe('Packs entitlement admin (Slice 5)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;
  let contabilidadOrgId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Super-admin
    const hashedPassword = await bcrypt.hash('superpass123', 10);
    await prisma.user.create({
      data: { email: 'superadmin@test.com', hashedPassword, isSuperAdmin: true },
    });
    superAdminToken = await login(app, 'superadmin@test.com', 'superpass123');

    // OWNER normal (no super-admin) con su org de Contabilidad (default).
    const owner = await createTestUser({ email: 'owner-packs@test.com', password: 'pass12345' });
    const tenant = await createTestTenant({ name: `Org Packs ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    contabilidadOrgId = tenant.id;
    ownerToken = await login(app, 'owner-packs@test.com', 'pass12345');
  });

  // ---------------------------------------------------------------
  // Autorización (TDD rojo primero)
  // ---------------------------------------------------------------

  it('[-] OWNER (no super-admin) hace POST /orgs/:id/packs → 403', async () => {
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });
    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ packId: pack.id });
    expect(res.status).toBe(403);
  });

  it('[-] OWNER hace DELETE /orgs/:id/packs/:packId → 403', async () => {
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/platform/orgs/${contabilidadOrgId}/packs/${pack.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('[-] sin JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .send({ clave: 'contabilidad.adjuntos' });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  // Habilitar (camino feliz + vertical)
  // ---------------------------------------------------------------

  it('[+] super-admin habilita pack del vertical correcto (por clave) → 201 + fila activo=false', async () => {
    await seedPack({ clave: 'contabilidad.adjuntos', verticalAplicable: VerticalPack.CONTABILIDAD });

    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: 'contabilidad.adjuntos' });

    expect(res.status).toBe(201);
    expect(res.body.activo).toBe(false);
    expect(res.body.organizationId).toBe(contabilidadOrgId);

    const fila = await prisma.orgPackEntitlement.findFirst({
      where: { organizationId: contabilidadOrgId },
      include: { pack: true },
    });
    expect(fila).not.toBeNull();
    expect(fila?.activo).toBe(false);
    expect(fila?.pack.clave).toBe('contabilidad.adjuntos');
  });

  it('[+] super-admin habilita por packId → 201', async () => {
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ packId: pack.id });

    expect(res.status).toBe(201);
    expect(res.body.packId).toBe(pack.id);
  });

  it('[-] habilitar pack de vertical ajeno (GRANJA en org CONTABILIDAD) → 400 PACK_VERTICAL_NO_APLICABLE, sin fila', async () => {
    await seedPack({ clave: 'granja.rag', verticalAplicable: VerticalPack.GRANJA });

    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: 'granja.rag' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PACK_VERTICAL_NO_APLICABLE');

    const fila = await prisma.orgPackEntitlement.findFirst({
      where: { organizationId: contabilidadOrgId },
    });
    expect(fila).toBeNull();
  });

  it('[-] habilitar clave inexistente → 404 PACK_NO_ENCONTRADO', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: 'no.existe' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PACK_NO_ENCONTRADO');
  });

  it('[-] habilitar en org inexistente → 404', async () => {
    await seedPack({ clave: 'contabilidad.adjuntos', verticalAplicable: VerticalPack.CONTABILIDAD });
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs/00000000-0000-0000-0000-000000000000/packs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: 'contabilidad.adjuntos' });
    expect(res.status).toBe(404);
  });

  it('[+] habilitar deja fila en platform_audit con targetOrganizationId', async () => {
    await seedPack({ clave: 'contabilidad.adjuntos', verticalAplicable: VerticalPack.CONTABILIDAD });

    const res = await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: 'contabilidad.adjuntos' });
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 150));

    const auditRow = await prisma.platformAudit.findFirst({
      where: { targetOrganizationId: contabilidadOrgId, action: { contains: 'POST' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.targetOrganizationId).toBe(contabilidadOrgId);
  });

  // ---------------------------------------------------------------
  // Revocar
  // ---------------------------------------------------------------

  it('[+] super-admin revoca → 204 y borra la fila', async () => {
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });
    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ packId: pack.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/api/admin/platform/orgs/${contabilidadOrgId}/packs/${pack.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(204);

    const fila = await prisma.orgPackEntitlement.findFirst({
      where: { organizationId: contabilidadOrgId, packId: pack.id },
    });
    expect(fila).toBeNull();
  });

  // ---------------------------------------------------------------
  // Invalidación de cache
  // ---------------------------------------------------------------

  it('[+] habilitar+activar invalida el cache org-packs:<id> (el guard/me lo refleja en caliente)', async () => {
    const redis = app.get(RedisService);
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });

    // Sembramos un cache "viejo" (sin el pack) para verificar que habilitar lo purga.
    await redis.set(`org-packs:${contabilidadOrgId}`, [], 300);

    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ packId: pack.id })
      .expect(201);

    const cachedTrasHabilitar = await redis.get<string[]>(`org-packs:${contabilidadOrgId}`);
    expect(cachedTrasHabilitar).toBeNull();
  });

  // ---------------------------------------------------------------
  // GET listado de entitlements de la org
  // ---------------------------------------------------------------

  it('[+] super-admin lista entitlements de la org → 200 con el pack habilitado', async () => {
    const pack = await seedPack({
      clave: 'contabilidad.adjuntos',
      verticalAplicable: VerticalPack.CONTABILIDAD,
    });
    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ packId: pack.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].pack.clave).toBe('contabilidad.adjuntos');
    expect(res.body[0].activo).toBe(false);
  });

  it('[-] OWNER lista entitlements → 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/orgs/${contabilidadOrgId}/packs`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });
});
