import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('CustomRoles (e2e)', () => {
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
      data: { email: 'owner@test.bo', hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: 'org-test',
        name: 'Org Test',
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    orgId = org.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@test.bo', password: 'password123' });
    ownerToken = loginRes.body.accessToken;
  });

  describe('POST /api/custom-roles', () => {
    it('debe crear un rol custom con permisos exactos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({
          slug: 'cobrador',
          name: 'Cobrador',
          permissions: ['contabilidad.ventas.read', 'contabilidad.compras.read'],
        });
      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('cobrador');
      expect(res.body.permissions).toHaveLength(2);
    });

    it('debe aceptar wildcards válidos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({
          slug: 'contador-junior',
          name: 'Contador Junior',
          permissions: ['contabilidad.*.read', 'contabilidad.asientos.create'],
        });
      expect(res.status).toBe(201);
    });

    it('debe rechazar permiso inexistente en el catálogo', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'bad', name: 'Bad', permissions: ['foo.bar.bazz'] });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/desconocido/i);
    });

    it('debe rechazar wildcards inválidos como *.read', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'bad2', name: 'Bad', permissions: ['*.read'] });
      expect(res.status).toBe(400);
    });

    it('debe rechazar slug duplicado en la misma organización', async () => {
      await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'rol-dup', name: 'Dup', permissions: ['contabilidad.ventas.read'] });

      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'rol-dup', name: 'Dup 2', permissions: ['contabilidad.ventas.read'] });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/permissions', () => {
    it('debe devolver el catálogo completo con al menos 50 permisos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/permissions')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(50);
    });

    it('debe devolver el catálogo agrupado FILTRADO por el vertical de la org', async () => {
      // La org de test es de CONTABILIDAD (contabilidadEnabled default true). El
      // catálogo asignable agrupado ahora se filtra server-authoritative por
      // vertical + packs (cierre deuda RBAC §7): incluye contabilidad +
      // cross-vertical, excluye granja.
      const res = await request(app.getHttpServer())
        .get('/api/permissions/grouped')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId);
      expect(res.status).toBe(200);
      const modulos = res.body.map((g: { modulo: string }) => g.modulo);
      expect(modulos).toContain('contabilidad');
      expect(modulos).toContain('organizacion');
      expect(modulos).not.toContain('granja');
    });
  });
});

async function cleanup(prisma: PrismaService) {
  await prisma.refreshToken.deleteMany({});
  await prisma.platformAudit.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.orgPackEntitlement.deleteMany({});
  await prisma.pack.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
