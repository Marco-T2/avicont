import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

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
    await cleanupTestData();
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

  describe('perfil fiscal', () => {
    it('GET /tenants/current devuelve los 6 campos con null cuando no se han configurado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        razonSocial: null,
        nit: null,
        direccion: null,
        representanteLegal: null,
        telefono: null,
        email: null,
      });
    });

    it('PATCH con razonSocial único → 200, solo ese campo cambia', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ razonSocial: 'Avicultura del Norte S.R.L.' });
      expect(res.status).toBe(200);
      expect(res.body.razonSocial).toBe('Avicultura del Norte S.R.L.');
      // Los otros siguen siendo null
      expect(res.body.nit).toBeNull();
    });

    it('PATCH con nit válido (7 dígitos) → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '1234567' });
      expect(res.status).toBe(200);
      expect(res.body.nit).toBe('1234567');
    });

    it('PATCH con nit válido (12 dígitos) → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '123456789012' });
      expect(res.status).toBe(200);
      expect(res.body.nit).toBe('123456789012');
    });

    it('PATCH con nit inválido (letras) → 400 con error.code === "TENANT_NIT_INVALIDO"', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '12345AB' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_NIT_INVALIDO');
    });

    it('PATCH con nit demasiado corto (< 7 dígitos) → 400 con code TENANT_NIT_INVALIDO', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '12345' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_NIT_INVALIDO');
    });

    it('PATCH con nit demasiado largo (> 12 dígitos) → 400 con code TENANT_NIT_INVALIDO', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '1234567890123' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_NIT_INVALIDO');
    });

    it('PATCH con email malformado → 400 con error.code === "TENANT_EMAIL_INVALIDO"', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ email: 'no-es-un-email' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_EMAIL_INVALIDO');
    });

    it('PATCH con email válido → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ email: 'contacto@empresa.com' });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('contacto@empresa.com');
    });

    it('PATCH con payload vacío {} → 200 y valores sin cambio', async () => {
      // Primero setear un valor
      await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ razonSocial: 'Test S.R.L.' });

      // Luego enviar payload vacío: no debe cambiar nada
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.razonSocial).toBe('Test S.R.L.');
    });

    it('PATCH con nit: null desmapea el campo (queda null en BD)', async () => {
      // Primero setear nit
      await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: '1234567' });

      // Luego desmapear
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ nit: null });
      expect(res.status).toBe(200);
      expect(res.body.nit).toBeNull();
    });

    it('PATCH con razonSocial de 201 caracteres → 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ razonSocial: 'A'.repeat(201) });
      expect(res.status).toBe(400);
    });

    it('aislamiento: solo afecta el tenant del JWT (tenantId del token)', async () => {
      // Crear segunda org con su propio owner
      const owner2 = await prisma.user.create({
        data: {
          email: 'owner2@tu.bo',
          hashedPassword: await import('bcrypt').then((b) => b.hash('password123', 10)),
          isEmailVerified: true,
        },
      });
      const org2 = await prisma.organization.create({
        data: {
          slug: 'org-tu-2',
          name: 'Org TU 2',
          contabilidadEnabled: true,
          granjaEnabled: false,
          memberships: { create: { userId: owner2.id, systemRole: SystemRole.OWNER } },
        },
      });
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'owner2@tu.bo', password: 'password123' });
      const token2 = loginRes.body.accessToken;

      // owner2 edita su org2
      await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', org2.id)
        .send({ razonSocial: 'Solo mía S.R.L.' });

      // La org original no fue afectada
      const org1 = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org1?.razonSocial).toBeNull();
    });
  });

  describe('tipoEmpresaEditable', () => {
    it('GET /tenants/current devuelve tipoEmpresaEditable: true cuando no hay gestiones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId);
      expect(res.status).toBe(200);
      expect(res.body.tipoEmpresaEditable).toBe(true);
      expect(res.body.tipoEmpresaPrincipal).toBe('COMERCIAL');
    });

    it('GET /tenants/current devuelve tipoEmpresaEditable: false cuando existe al menos una gestión', async () => {
      // Crear una gestión fiscal para bloquear la edición.
      // El endpoint /gestiones usa activeTenantId del JWT, no X-Tenant-ID.
      await request(app.getHttpServer())
        .post('/api/gestiones')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ year: 2026 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId);
      expect(res.status).toBe(200);
      expect(res.body.tipoEmpresaEditable).toBe(false);
    });

    it('PATCH con tipoEmpresaPrincipal: "MINERA" → 200 cuando no hay gestiones', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ tipoEmpresaPrincipal: 'MINERA' });
      expect(res.status).toBe(200);
      expect(res.body.tipoEmpresaPrincipal).toBe('MINERA');
    });

    it('PATCH con tipoEmpresaPrincipal cuando ya hay gestión → 409 TENANT_EMPRESA_INMUTABLE', async () => {
      // Crear una gestión fiscal para bloquear el cambio.
      // El endpoint /gestiones usa activeTenantId del JWT, no X-Tenant-ID.
      await request(app.getHttpServer())
        .post('/api/gestiones')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ year: 2026 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ tipoEmpresaPrincipal: 'SERVICIOS' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TENANT_EMPRESA_INMUTABLE');
    });

    it('PATCH con tipoEmpresaPrincipal inválido → 400 (validación enum)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/tenants/current')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ tipoEmpresaPrincipal: 'OTRO' });
      expect(res.status).toBe(400);
    });
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
