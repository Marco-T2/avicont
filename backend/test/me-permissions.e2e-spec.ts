import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { CATALOGO_PERMISOS } from '../src/common/permisos/catalogo';
import { cleanupTestData } from './helpers/test-factory';

// SystemRole solo tiene OWNER y ADMIN. Los miembros regulares tienen systemRole null.
type SystemRoleOrNull = SystemRole | null;

describe('GET /api/me/permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    await cleanupTestData();
  });

  async function crearUsuarioYToken(
    email: string,
    systemRole: SystemRoleOrNull,
    customRolePermissions?: string[],
  ): Promise<string> {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: { email, hashedPassword, isEmailVerified: true },
    });

    let customRoleId: string | undefined;
    if (customRolePermissions !== undefined) {
      const customRole = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: `rol-${Date.now()}`,
          name: `Rol Test ${Date.now()}`,
          permissions: customRolePermissions,
        },
      });
      customRoleId = customRole.id;
    }

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        ...(systemRole !== null ? { systemRole } : {}),
        ...(customRoleId !== undefined ? { customRoleId } : {}),
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' });

    return loginRes.body.accessToken as string;
  }

  describe('sin autenticación', () => {
    it('sin JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/me/permissions');
      expect(res.status).toBe(401);
    });
  });

  describe('con autenticación pero sin tenant activo', () => {
    it('usuario sin membresía (JWT sin activeTenantId) → 403 con código ME_PERMISSIONS_SIN_TENANT', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      // Usuario sin membresía en ninguna organización → JWT sin activeTenantId
      await prisma.user.create({
        data: { email: 'sin-tenant@test.bo', hashedPassword, isEmailVerified: true },
      });
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'sin-tenant@test.bo', password: 'password123' });
      const token = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ME_PERMISSIONS_SIN_TENANT');
      // El 403 NO debe exponer el campo vertical (no hay tenant resuelto)
      expect(res.body.vertical).toBeUndefined();
    });
  });

  describe('con tenant activo', () => {
    beforeEach(async () => {
      const org = await prisma.organization.create({
        data: { slug: `org-me-${Date.now()}`, name: 'Org Me Test' },
      });
      orgId = org.id;
    });

    it('OWNER → 200, isOwner: true, permissions contiene todos los keys del catálogo, sin "*"', async () => {
      const token = await crearUsuarioYToken('owner@me.bo', SystemRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isOwner).toBe(true);
      expect(res.body.activeTenantId).toBe(orgId);

      const todosLosKeys = CATALOGO_PERMISOS.map((p) => p.key);
      expect(res.body.permissions).toEqual(expect.arrayContaining(todosLosKeys));
      expect(res.body.permissions).toHaveLength(todosLosKeys.length);
      expect(res.body.permissions).not.toContain('*');
    });

    it('ADMIN → 200, isOwner: false, permissions contiene todos los keys del catálogo', async () => {
      const token = await crearUsuarioYToken('admin@me.bo', SystemRole.ADMIN);

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.activeTenantId).toBe(orgId);

      const todosLosKeys = CATALOGO_PERMISOS.map((p) => p.key);
      expect(res.body.permissions).toEqual(expect.arrayContaining(todosLosKeys));
      expect(res.body.permissions).not.toContain('*');
    });

    it('MEMBER con CustomRole de 2 permisos → 200, isOwner: false, solo esos permisos', async () => {
      const token = await crearUsuarioYToken('member@me.bo', null, [
        'contabilidad.libro-diario.read',
        'contabilidad.libro-mayor.read',
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.permissions).toHaveLength(2);
      expect(res.body.permissions).toContain('contabilidad.libro-diario.read');
      expect(res.body.permissions).toContain('contabilidad.libro-mayor.read');
    });

    it('MEMBER sin CustomRole → 200, isOwner: false, permissions: []', async () => {
      const token = await crearUsuarioYToken('member-sin-rol@me.bo', null);

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.permissions).toEqual([]);
    });

    it('membresía desactivada → 403 con código ME_PERMISSIONS_MEMBRESIA_INACTIVA', async () => {
      // Loguear ANTES de desactivar la membresía para obtener JWT con activeTenantId.
      const token = await crearUsuarioYToken('desactivado@me.bo', null);

      // Desactivar la membresía después de haber obtenido el token.
      await prisma.membership.updateMany({
        where: { organizationId: orgId },
        data: { deactivatedAt: new Date('2020-01-01') },
      });

      const res = await request(app.getHttpServer())
        .get('/api/me/permissions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ME_PERMISSIONS_MEMBRESIA_INACTIVA');
    });

    describe('campo vertical', () => {
      it('org con contabilidadEnabled=true → vertical: "CONTABILIDAD"', async () => {
        // La org del beforeEach externo se crea con contabilidadEnabled: true (default)
        // y granjaEnabled: false (default). Solo verificamos que el campo esté presente.
        const token = await crearUsuarioYToken('vertical-cont@me.bo', SystemRole.OWNER);

        const res = await request(app.getHttpServer())
          .get('/api/me/permissions')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.vertical).toBe('CONTABILIDAD');
        // Regresión: los demás campos siguen presentes
        expect(res.body).toHaveProperty('permissions');
        expect(res.body).toHaveProperty('isOwner');
        expect(res.body).toHaveProperty('activeTenantId');
      });

      it('org con granjaEnabled=true → vertical: "GRANJA"', async () => {
        // Crear org con vertical granja para este caso
        const orgGranja = await prisma.organization.create({
          data: {
            slug: `org-granja-${Date.now()}`,
            name: 'Org Granja Test',
            contabilidadEnabled: false,
            granjaEnabled: true,
          },
        });
        orgId = orgGranja.id;
        const token = await crearUsuarioYToken('vertical-granja@me.bo', SystemRole.OWNER);

        const res = await request(app.getHttpServer())
          .get('/api/me/permissions')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.vertical).toBe('GRANJA');
        expect(res.body).toHaveProperty('permissions');
        expect(res.body).toHaveProperty('isOwner');
        expect(res.body).toHaveProperty('activeTenantId');
      });

      it('org con ambos flags false → vertical: null', async () => {
        // Crear org sin ningún vertical activo (caso OTROS del alta)
        const orgSinVertical = await prisma.organization.create({
          data: {
            slug: `org-sin-vertical-${Date.now()}`,
            name: 'Org Sin Vertical Test',
            contabilidadEnabled: false,
            granjaEnabled: false,
          },
        });
        orgId = orgSinVertical.id;
        const token = await crearUsuarioYToken('vertical-null@me.bo', SystemRole.OWNER);

        const res = await request(app.getHttpServer())
          .get('/api/me/permissions')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.vertical).toBeNull();
        expect(res.body).toHaveProperty('permissions');
        expect(res.body).toHaveProperty('isOwner');
        expect(res.body).toHaveProperty('activeTenantId');
      });
    });
  });
});
