import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

/**
 * E2E spec de `PATCH /api/tenants/current`.
 *
 * Cubre el riel de seguridad del paso 1 del super-admin
 * (docs/disenos/super-admin-plataforma.md §8):
 *  - el endpoint exige `organizacion.configuracion.update` (defecto A: antes
 *    cualquier miembro activo entraba sin permiso);
 *  - `plan` y `status` (entitlement) NO son editables por el Owner (defecto B:
 *    son potestad de plataforma — el super-admin del paso 7). El Owner solo
 *    administra el perfil de su org (name, tipoEmpresaPrincipal).
 */
describe('PATCH /api/tenants/current (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanup(prisma);
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: 'owner@tu.bo', hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: 'org-tu',
        name: 'Org TU',
        contabilidadEnabled: true,
        granjaEnabled: false,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    orgId = org.id;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@tu.bo', password: 'password123' });
    ownerToken = loginRes.body.accessToken;
  });

  it('un Owner con permiso edita el name de su org → 200', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ name: 'Org TU Renombrada' });
    expect(res.status).toBe(200);

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    expect(org?.name).toBe('Org TU Renombrada');
  });

  it('defecto B: el Owner NO puede cambiar plan ni status (entitlement de plataforma)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ name: 'Org TU', plan: 'PRO', status: 'SUSPENDED' });
    // El name (perfil) sí se acepta; plan/status se descartan por whitelist.
    expect(res.status).toBe(200);

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    expect(org?.plan).toBe('FREE');
    expect(org?.status).toBe('ACTIVE');
  });

  it('defecto A: un miembro sin organizacion.configuracion.update → 403', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const contador = await prisma.user.create({
      data: { email: 'cont@tu.bo', hashedPassword },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.*'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: contador.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cont@tu.bo', password: 'password123' });
    const contToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${contToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ name: 'Hackeado' });
    expect(res.status).toBe(403);
  });
});

async function cleanup(prisma: PrismaService) {
  await prisma.refreshToken.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
