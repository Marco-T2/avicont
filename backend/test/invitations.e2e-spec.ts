import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let orgId: string;
  let contadorRoleId: string;

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
      data: { email: 'owner@inv.bo', hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: 'org-inv',
        name: 'Org Inv',
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    orgId = org.id;
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.*'],
      },
    });
    contadorRoleId = role.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@inv.bo', password: 'password123' });
    ownerToken = loginRes.body.accessToken;
  });

  it('debe crear invitación, aceptar con cuenta nueva y dar acceso al tenant', async () => {
    // 1. Crear invitación
    const createRes = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ email: 'nuevo@inv.bo', customRoleId: contadorRoleId });
    expect(createRes.status).toBe(201);
    const token = createRes.body.token;
    expect(typeof token).toBe('string');

    // 2. Preview público
    const previewRes = await request(app.getHttpServer())
      .get('/api/invitations/preview')
      .query({ token });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.email).toBe('nuevo@inv.bo');
    expect(previewRes.body.organization.id).toBe(orgId);

    // 3. Accept-and-register
    const acceptRes = await request(app.getHttpServer())
      .post('/api/invitations/accept-and-register')
      .send({ token, password: 'micl4v3.', displayName: 'Nuevo' });
    expect(acceptRes.status).toBe(201);
    expect(acceptRes.body.invitation.status).toBe('ACCEPTED');

    // 4. Login con la nueva cuenta y verificar JWT trae rol contador
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nuevo@inv.bo', password: 'micl4v3.' });
    expect(loginRes.status).toBe(200);
    const payload = JSON.parse(
      Buffer.from(loginRes.body.accessToken.split('.')[1] ?? '', 'base64').toString(),
    );
    expect(payload.roles).toEqual(['contador']);
    expect(payload.activeTenantId).toBe(orgId);
  });

  it('debe rechazar accept-and-register si el email ya tiene cuenta', async () => {
    const hashedPassword = await bcrypt.hash('otra123', 10);
    await prisma.user.create({ data: { email: 'existe@inv.bo', hashedPassword } });

    const createRes = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ email: 'existe@inv.bo', customRoleId: contadorRoleId });
    const token = createRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/invitations/accept-and-register')
      .send({ token, password: 'cualquier', displayName: 'X' });
    expect(res.status).toBe(409);
  });

  it('debe rechazar duplicar invitación PENDING para el mismo email', async () => {
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ email: 'dup@inv.bo', customRoleId: contadorRoleId });

    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ email: 'dup@inv.bo', customRoleId: contadorRoleId });
    expect(res.status).toBe(409);
  });

  it('debe rechazar invitación con un token revocado', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ email: 'revocar@inv.bo', customRoleId: contadorRoleId });
    const invId = createRes.body.invitation.id;
    const token = createRes.body.token;

    await request(app.getHttpServer())
      .delete(`/api/invitations/${invId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId);

    const res = await request(app.getHttpServer())
      .post('/api/invitations/accept-and-register')
      .send({ token, password: 'algo1234' });
    expect(res.status).toBe(410); // Gone
  });
});

async function cleanup(prisma: PrismaService) {
  await prisma.refreshToken.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
