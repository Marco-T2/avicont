import { Controller, Get, INestApplication, Module, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole, TipoPack, VerticalPack } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { RequirePack } from '../src/common/decorators/require-pack.decorator';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PackEnabledGuard } from '../src/common/guards/pack-enabled.guard';
import { PacksModule } from '../src/packs/pack.module';
import {
  cleanupTestData,
  createTestMembership,
  createTestTenant,
  createTestUser,
  prisma,
} from './helpers/test-factory';

/**
 * SHAKEDOWN e2e del riel de packs (Slice 6): valida la cadena completa
 * catálogo → entitlement → activación → guard, de punta a punta, contra HTTP real.
 *
 * Como en esta fase NINGÚN controller de dominio se decora con @RequirePack (no
 * hay pack concreto todavía), el guard se ejercita con un controller de PRUEBA
 * que vive SOLO en este e2e (`ShakedownProtegidoController`), nunca en producción.
 * El controller expone un endpoint guardado por @RequirePack('contabilidad.adjuntos').
 *
 * Flujo cubierto:
 *  1. org sin entitlement → endpoint guardado 404 (pack no activo)
 *  2. super-admin habilita el pack (slice 5) → entitlement activo=false → SIGUE 404
 *  3. Owner activa (PATCH) → endpoint guardado 200
 *  4. Owner activa un pack NO habilitado → 403 PACK_NO_HABILITADO (frontera §4.5)
 *  5. Owner desactiva → endpoint guardado vuelve a 404
 *  6. aislamiento por tenant: activar en org A no prende el pack en org B
 *  7. gating SystemRole: un NO-OWNER (custom role) no puede activar → 403
 */
const CLAVE = 'contabilidad.adjuntos';

@Controller('shakedown')
class ShakedownProtegidoController {
  @Get('protegido')
  @UseGuards(JwtAuthGuard, PackEnabledGuard)
  @RequirePack(CLAVE)
  protegido(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [PacksModule],
  controllers: [ShakedownProtegidoController],
})
class ShakedownModule {}

async function buildApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule, ShakedownModule],
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

async function seedPack(clave: string, vertical: VerticalPack): Promise<string> {
  const pack = await prisma.pack.create({
    data: { clave, nombre: clave, verticalAplicable: vertical, tipo: TipoPack.CAPACIDAD },
  });
  return pack.id;
}

function getProtegido(app: INestApplication, token: string) {
  return request(app.getHttpServer())
    .get('/api/shakedown/protegido')
    .set('Authorization', `Bearer ${token}`);
}

describe('Packs — shakedown end-to-end del riel (Slice 6)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;
  let orgAId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    const hashedPassword = await bcrypt.hash('superpass123', 10);
    await prisma.user.create({
      data: { email: 'sa-shakedown@test.com', hashedPassword, isSuperAdmin: true },
    });
    superAdminToken = await login(app, 'sa-shakedown@test.com', 'superpass123');

    const owner = await createTestUser({ email: 'owner-shakedown@test.com', password: 'pass12345' });
    const tenant = await createTestTenant({ name: `Org A Shakedown ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id, SystemRole.OWNER);
    orgAId = tenant.id;
    ownerToken = await login(app, 'owner-shakedown@test.com', 'pass12345');
  });

  async function habilitarComoSuperAdmin(orgId: string, clave: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${orgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave })
      .expect(201);
  }

  function patchActivo(token: string, clave: string, activo: boolean) {
    return request(app.getHttpServer())
      .patch(`/api/packs/${clave}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo });
  }

  it('[1] org SIN entitlement → endpoint guardado responde 404', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);
    const res = await getProtegido(app, ownerToken);
    expect(res.status).toBe(404);
  });

  it('[2] pack HABILITADO pero NO activo → endpoint guardado SIGUE 404', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);
    await habilitarComoSuperAdmin(orgAId, CLAVE);

    const res = await getProtegido(app, ownerToken);
    expect(res.status).toBe(404);
  });

  it('[3] Owner activa (PATCH) → endpoint guardado responde 200', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);
    await habilitarComoSuperAdmin(orgAId, CLAVE);

    const patch = await patchActivo(ownerToken, CLAVE, true);
    expect(patch.status).toBe(200);
    expect(patch.body.activo).toBe(true);

    const res = await getProtegido(app, ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('[4] Owner activa un pack NO habilitado → 403 PACK_NO_HABILITADO (frontera)', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);

    const res = await patchActivo(ownerToken, CLAVE, true);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PACK_NO_HABILITADO');
  });

  it('[5] Owner desactiva → endpoint guardado vuelve a 404', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);
    await habilitarComoSuperAdmin(orgAId, CLAVE);
    await patchActivo(ownerToken, CLAVE, true).expect(200);
    await getProtegido(app, ownerToken).expect(200);

    await patchActivo(ownerToken, CLAVE, false).expect(200);

    const res = await getProtegido(app, ownerToken);
    expect(res.status).toBe(404);
  });

  it('[6] aislamiento por tenant: activar en org A no prende el pack en org B', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);

    // Org B con su propio Owner, ambos packs habilitados por el super-admin.
    const ownerB = await createTestUser({ email: 'owner-b-shakedown@test.com', password: 'pass12345' });
    const tenantB = await createTestTenant({ name: `Org B Shakedown ${Date.now()}` });
    await createTestMembership(ownerB.id, tenantB.id, SystemRole.OWNER);
    const ownerBToken = await login(app, 'owner-b-shakedown@test.com', 'pass12345');

    await habilitarComoSuperAdmin(orgAId, CLAVE);
    await habilitarComoSuperAdmin(tenantB.id, CLAVE);

    // Solo A activa.
    await patchActivo(ownerToken, CLAVE, true).expect(200);

    // A ve el endpoint; B sigue 404 (su pack está habilitado pero no activo).
    await getProtegido(app, ownerToken).expect(200);
    const resB = await getProtegido(app, ownerBToken);
    expect(resB.status).toBe(404);
  });

  it('[7] gating SystemRole: un miembro con custom role (no OWNER/ADMIN) no puede activar → 403', async () => {
    await seedPack(CLAVE, VerticalPack.CONTABILIDAD);

    // Org con un miembro de custom role (sin SystemRole).
    const tenant = await createTestTenant({ name: `Org Contador ${Date.now()}` });
    const owner = await createTestUser({ email: 'owner-c@test.com', password: 'pass12345' });
    await createTestMembership(owner.id, tenant.id, SystemRole.OWNER);
    await habilitarComoSuperAdmin(tenant.id, CLAVE);

    const customRole = await prisma.customRole.create({
      data: { organizationId: tenant.id, slug: 'contador', name: 'Contador' },
    });
    const contador = await createTestUser({ email: 'contador-c@test.com', password: 'pass12345' });
    await prisma.membership.create({
      data: { userId: contador.id, organizationId: tenant.id, customRoleId: customRole.id },
    });
    const contadorToken = await login(app, 'contador-c@test.com', 'pass12345');

    const res = await patchActivo(contadorToken, CLAVE, true);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SYSTEM_ROLE_REQUERIDO');
  });
});
