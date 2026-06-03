import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

/**
 * E2E — mutaciones de /api/memberships a través del stack HTTP real.
 *
 * Cubre dos bugs detectados en smoke (engram bugs/memberships-leave-y-tenant-als):
 *  - Bug 1: la ruta literal DELETE /leave quedaba ensombrecida por DELETE /:id.
 *  - Bug 2: invite/updateRole/remove resolvían el tenant del AsyncLocalStorage,
 *    que está vacío en tiempo de ejecución del handler (el run() del interceptor
 *    ya retornó cuando Nest se suscribe al Observable).
 *
 * Estos tests pegan HTTP real (no mockean el tenant context) — es la única forma
 * de cazar el Bug 2, que los unit con `getTenantId` mockeado no detectan.
 */
describe('Mutaciones /api/memberships (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let ownerToken: string;

  let memberToRemoveId: string;
  let memberToUpdateId: string;
  let leaverToken: string;
  let leaverUserId: string;

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
      data: { email: 'owner@ml.bo', hashedPassword, isEmailVerified: true },
    });
    const memberToRemove = await prisma.user.create({
      data: { email: 'remove@ml.bo', hashedPassword, isEmailVerified: true },
    });
    const memberToUpdate = await prisma.user.create({
      data: { email: 'update@ml.bo', hashedPassword, isEmailVerified: true },
    });
    const leaver = await prisma.user.create({
      data: { email: 'leaver@ml.bo', hashedPassword, isEmailVerified: true },
    });
    leaverUserId = leaver.id;

    const org = await prisma.organization.create({
      data: { slug: 'org-ml', name: 'Org ML' },
    });
    orgId = org.id;

    await prisma.membership.create({
      data: { userId: owner.id, organizationId: orgId, systemRole: SystemRole.OWNER },
    });
    const mRemove = await prisma.membership.create({
      data: { userId: memberToRemove.id, organizationId: orgId },
    });
    memberToRemoveId = mRemove.id;
    const mUpdate = await prisma.membership.create({
      data: { userId: memberToUpdate.id, organizationId: orgId },
    });
    memberToUpdateId = mUpdate.id;
    await prisma.membership.create({
      data: { userId: leaver.id, organizationId: orgId },
    });

    const loginOwner = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@ml.bo', password: 'password123' });
    ownerToken = loginOwner.body.accessToken as string;

    const loginLeaver = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'leaver@ml.bo', password: 'password123' });
    leaverToken = loginLeaver.body.accessToken as string;
  });

  describe('DELETE /api/memberships/:id (remove)', () => {
    it('OWNER quita a un miembro → 200 y la membresía desaparece', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/memberships/${memberToRemoveId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBe(200);

      const sigue = await prisma.membership.findUnique({ where: { id: memberToRemoveId } });
      expect(sigue).toBeNull();
    });
  });

  describe('DELETE /api/memberships/leave (leave)', () => {
    it('un miembro abandona la organización → éxito y su membresía desaparece', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/memberships/leave')
        .set('Authorization', `Bearer ${leaverToken}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBeLessThan(300);

      const sigue = await prisma.membership.findFirst({
        where: { userId: leaverUserId, organizationId: orgId },
      });
      expect(sigue).toBeNull();
    });
  });

  describe('PATCH /api/memberships/:id (updateRole)', () => {
    it('OWNER cambia el rol de un miembro a ADMIN → 200 y el rol queda persistido', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/memberships/${memberToUpdateId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ systemRole: 'ADMIN' });

      expect(res.status).toBe(200);

      const actualizado = await prisma.membership.findUnique({ where: { id: memberToUpdateId } });
      expect(actualizado?.systemRole).toBe('ADMIN');
    });
  });

  describe('POST /api/memberships/invite', () => {
    it('OWNER agrega a un usuario existente → 201 y se crea la membresía', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const invitee = await prisma.user.create({
        data: { email: 'invitee@ml.bo', hashedPassword, isEmailVerified: true },
      });

      const res = await request(app.getHttpServer())
        .post('/api/memberships/invite')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ email: 'invitee@ml.bo', systemRole: 'ADMIN' });

      expect(res.status).toBe(201);

      const creada = await prisma.membership.findFirst({
        where: { userId: invitee.id, organizationId: orgId },
      });
      expect(creada).not.toBeNull();
    });
  });
});
