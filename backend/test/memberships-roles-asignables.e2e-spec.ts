import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

/**
 * E2E — GET /api/memberships/roles-asignables
 *
 * Cubre: REQ-RA-01 (shape + orden), REQ-RA-02 (gating 401/403/200),
 * REQ-RA-03 (OWNER-only), REQ-RA-04 (multi-tenant sin fuga), REQ-RA-06 (ruta).
 */
describe('GET /api/memberships/roles-asignables (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let orgBId: string;

  // tokens de cada actor
  let ownerAToken: string;
  let adminAToken: string;
  let memberSinPermisoToken: string;
  let memberConPermisoInviteToken: string;

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

    // ------- Org A -------
    const ownerA = await prisma.user.create({
      data: { email: 'owner-a@ra.bo', hashedPassword, isEmailVerified: true },
    });
    const adminA = await prisma.user.create({
      data: { email: 'admin-a@ra.bo', hashedPassword, isEmailVerified: true },
    });
    const memberSin = await prisma.user.create({
      data: { email: 'member-sin@ra.bo', hashedPassword, isEmailVerified: true },
    });
    const memberCon = await prisma.user.create({
      data: { email: 'member-con@ra.bo', hashedPassword, isEmailVerified: true },
    });

    const orgA = await prisma.organization.create({
      data: { slug: 'org-ra-a', name: 'Org RA A' },
    });
    orgAId = orgA.id;

    // Custom rol en A con permiso organizacion.miembros.invite
    const rolConInvite = await prisma.customRole.create({
      data: {
        organizationId: orgAId,
        slug: 'rol-con-invite',
        name: 'Rol Con Invite',
        permissions: ['organizacion.miembros.invite'],
      },
    });

    await prisma.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgAId, systemRole: SystemRole.OWNER },
        { userId: adminA.id, organizationId: orgAId, systemRole: SystemRole.ADMIN },
        // MEMBER puro — sin permisos
        { userId: memberSin.id, organizationId: orgAId },
        // MEMBER con custom rol que tiene miembros.invite
        { userId: memberCon.id, organizationId: orgAId, customRoleId: rolConInvite.id },
      ],
    });

    // ------- Org B -------
    const ownerB = await prisma.user.create({
      data: { email: 'owner-b@ra.bo', hashedPassword, isEmailVerified: true },
    });
    const orgB = await prisma.organization.create({
      data: { slug: 'org-ra-b', name: 'Org RA B' },
    });
    orgBId = orgB.id;
    await prisma.customRole.create({
      data: {
        organizationId: orgBId,
        slug: 'contador-b',
        name: 'Contador B',
        permissions: [],
      },
    });
    await prisma.membership.create({
      data: { userId: ownerB.id, organizationId: orgBId, systemRole: SystemRole.OWNER },
    });

    // ------- Obtener tokens -------
    const loginOwnerA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner-a@ra.bo', password: 'password123' });
    ownerAToken = loginOwnerA.body.accessToken as string;

    const loginAdminA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin-a@ra.bo', password: 'password123' });
    adminAToken = loginAdminA.body.accessToken as string;

    const loginMemberSin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'member-sin@ra.bo', password: 'password123' });
    memberSinPermisoToken = loginMemberSin.body.accessToken as string;

    const loginMemberCon = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'member-con@ra.bo', password: 'password123' });
    memberConPermisoInviteToken = loginMemberCon.body.accessToken as string;
  });

  describe('sin autenticación', () => {
    it('sin JWT → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('X-Tenant-ID', 'cualquier-id');
      expect(res.status).toBe(401);
    });
  });

  describe('gating de permisos', () => {
    it('MEMBER sin permiso organizacion.miembros.invite → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${memberSinPermisoToken}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(403);
    });

    it('OWNER → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(200);
    });

    it('ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(200);
    });

    it('MEMBER con custom role que incluye organizacion.miembros.invite → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${memberConPermisoInviteToken}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(200);
    });
  });

  describe('filtro OWNER-only (REQ-RA-03)', () => {
    it('OWNER consulta → respuesta incluye ítem con id OWNER y kind system', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; kind: string }[];
      expect(items.find((r) => r.id === 'OWNER' && r.kind === 'system')).toBeDefined();
    });

    it('ADMIN consulta → respuesta NO contiene OWNER, SÍ contiene ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; kind: string }[];
      expect(items.find((r) => r.id === 'OWNER')).toBeUndefined();
      expect(items.find((r) => r.id === 'ADMIN' && r.kind === 'system')).toBeDefined();
    });

    it('MEMBER con custom role invite → sin OWNER, con ADMIN y custom roles del tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${memberConPermisoInviteToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; kind: string }[];
      expect(items.find((r) => r.id === 'OWNER')).toBeUndefined();
      expect(items.find((r) => r.id === 'ADMIN')).toBeDefined();
      // debe incluir el custom role de la org
      expect(items.find((r) => r.kind === 'custom')).toBeDefined();
    });
  });

  describe('aislamiento multi-tenant (REQ-RA-04)', () => {
    it('OWNER de orgA → respuesta incluye custom de orgA y NO incluye custom de orgB', async () => {
      // Agregar un custom role extra en orgA para distinguir bien
      await prisma.customRole.create({
        data: {
          organizationId: orgAId,
          slug: 'contador-a',
          name: 'Contador A',
          permissions: [],
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; name: string; kind: string }[];
      const customItems = items.filter((r) => r.kind === 'custom');
      expect(customItems.find((r) => r.name === 'Contador A')).toBeDefined();
      expect(customItems.find((r) => r.name === 'Contador B')).toBeUndefined();
    });

    it('org sin custom roles → respuesta contiene solo system roles (REQ-RA-04 escenario vacío)', async () => {
      // orgB tiene solo 1 custom role "Contador B", pero el ownerB pide su propio tenant
      // Creamos una org sin ningún custom role
      const hashedPassword = await bcrypt.hash('password123', 10);
      const ownerVacio = await prisma.user.create({
        data: { email: 'owner-vacio@ra.bo', hashedPassword, isEmailVerified: true },
      });
      const orgVacia = await prisma.organization.create({
        data: { slug: 'org-ra-vacia', name: 'Org RA Vacia' },
      });
      await prisma.membership.create({
        data: { userId: ownerVacio.id, organizationId: orgVacia.id, systemRole: SystemRole.OWNER },
      });
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'owner-vacio@ra.bo', password: 'password123' });
      const tokenVacio = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${tokenVacio}`)
        .set('X-Tenant-ID', orgVacia.id);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; kind: string }[];
      const customItems = items.filter((r) => r.kind === 'custom');
      expect(customItems).toHaveLength(0);
      expect(items.find((r) => r.id === 'OWNER')).toBeDefined();
      expect(items.find((r) => r.id === 'ADMIN')).toBeDefined();
    });
  });

  describe('shape de respuesta y orden (REQ-RA-01)', () => {
    it('cada ítem tiene id, name y kind; custom items tienen id UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; name: string; kind: string }[];
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('kind');
        expect(['system', 'custom']).toContain(item.kind);
      }

      const customItems = items.filter((r) => r.kind === 'custom');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const c of customItems) {
        expect(c.id).toMatch(uuidRegex);
      }
    });

    it('system roles aparecen antes que custom roles', async () => {
      await prisma.customRole.create({
        data: {
          organizationId: orgAId,
          slug: 'zzzz-ultimo',
          name: 'ZZZZ Ultimo',
          permissions: [],
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; kind: string }[];
      const firstCustomIndex = items.findIndex((r) => r.kind === 'custom');
      const lastSystemIndex = items.reduce((acc, r, i) => (r.kind === 'system' ? i : acc), -1);
      expect(lastSystemIndex).toBeLessThan(firstCustomIndex);
    });

    it('custom roles ordenados por nombre ASC', async () => {
      await prisma.customRole.createMany({
        data: [
          { organizationId: orgAId, slug: 'zapador', name: 'Zapador', permissions: [] },
          { organizationId: orgAId, slug: 'auditor-x', name: 'Auditor X', permissions: [] },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/memberships/roles-asignables')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .set('X-Tenant-ID', orgAId);

      expect(res.status).toBe(200);
      const items = res.body as { id: string; name: string; kind: string }[];
      const customItems = items.filter((r) => r.kind === 'custom');
      const names = customItems.map((r) => r.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });
  });
});
