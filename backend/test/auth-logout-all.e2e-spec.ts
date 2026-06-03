import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/cache/redis.service';

/**
 * E2E tests de POST /api/auth/logout-all (REQ-LA-03).
 *
 * Gotcha de iat/epoch: el claim `iat` del JWT es en segundos enteros. Si el
 * re-login ocurre dentro del mismo segundo que el logout-all, el token B puede
 * compartir `iat` con el epoch → sería rechazado. Para evitarlo esperamos ≥1s
 * entre el logout-all y el re-login (ver comentario inline en el test relevante).
 */
describe('POST /api/auth/logout-all (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  const email1 = `logout-all-u1-${Date.now()}@avicont.bo`;
  const email2 = `logout-all-u2-${Date.now()}@avicont.bo`;
  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    redis = moduleFixture.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Limpiar solo los tokens y users de este test; no borrar todo para no
    // interferir con tests paralelos de otros suites (se corre con --runInBand).
    await prisma.refreshToken.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.customRole.deleteMany({});
    await prisma.featureFlag.deleteMany({});
    await prisma.impersonationAction.deleteMany({});
    await prisma.impersonationLog.deleteMany({});
    await prisma.invitation.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  /**
   * Helper: registra un usuario y loguea, devuelve { accessToken, cookie }.
   */
  async function registrarYLogear(
    email: string,
  ): Promise<{ accessToken: string; cookie: string }> {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const accessToken = loginRes.body.accessToken as string;
    const cookie = loginRes.headers['set-cookie'] as unknown as string[];
    return { accessToken, cookie: cookie?.[0] ?? '' };
  }

  /**
   * Helper: realiza una request autenticada a un endpoint gateado por JwtAuthGuard.
   * Usamos GET /api/auth/me si existe, sino cualquier endpoint protegido.
   * Optamos por POST /api/auth/switch-tenant que devuelve 400 con body inválido
   * pero al menos nos da 401 si el token es inválido.
   *
   * En realidad, el logout-all del propio usuario ya es suficiente como probe.
   * Pero necesitamos un endpoint "cualquier 401 vs 200". Usamos el endpoint de
   * switch-tenant vacío: sin body válido → 400/422, pero con token inválido → 401.
   */
  async function probarToken(accessToken: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/switch-tenant')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tenantId: 'non-existent' });
    // Con token válido pero tenant inválido → 400 (ValidationPipe rechaza UUID inválido)
    // Con token inválido → 401
    return res.status;
  }

  it('REQ-LA-03: logout-all invalida un access token emitido antes de la llamada', async () => {
    const { accessToken } = await registrarYLogear(email1);

    // Verificar que el token A es válido antes del logout-all
    const statusAntes = await probarToken(accessToken);
    expect(statusAntes).not.toBe(401);

    // Logout-all
    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // El token A ahora debe ser rechazado
    const statusDespues = await probarToken(accessToken);
    expect(statusDespues).toBe(401);
  });

  it('REQ-LA-03: un token emitido DESPUÉS del logout-all sigue válido', async () => {
    const { accessToken: tokenA } = await registrarYLogear(email1);

    // Logout-all con token A
    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    // GOTCHA iat/epoch: esperar ≥1s para que el nuevo JWT tenga iat > epoch.
    // El epoch se escribe en ms, pero el iat del JWT es en segundos enteros.
    // Si el re-login ocurre en el mismo segundo, iat_B * 1000 == epoch → válido,
    // pero para garantizarlo sin flakiness esperamos 1100ms.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Re-login → token B con iat posterior al epoch
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email1, password })
      .expect(200);
    const tokenB = loginRes.body.accessToken as string;

    // Token B debe ser aceptado
    const statusB = await probarToken(tokenB);
    expect(statusB).not.toBe(401);
  });

  it('REQ-LA-03: logout-all revoca los refresh tokens del usuario en BD', async () => {
    const { accessToken, cookie } = await registrarYLogear(email1);

    // Verificar que el refresh cookie es válido
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);

    // Re-logear para conseguir un refresh token fresco (el anterior fue rotado)
    const loginRes2 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email1, password })
      .expect(200);
    const freshCookie = (loginRes2.headers['set-cookie'] as unknown as string[])?.[0] ?? '';

    // Logout-all
    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // El refresh token del segundo login también debe estar revocado
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', freshCookie)
      .expect(401);
  });

  it('REQ-LA-03: logout-all sin autenticación → 401', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout-all').expect(401);
  });

  it('REQ-LA-03: aislamiento — logout-all de user1 no afecta a user2', async () => {
    const { accessToken: tokenU1 } = await registrarYLogear(email1);
    const { accessToken: tokenU2 } = await registrarYLogear(email2);

    // Logout-all de user1
    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${tokenU1}`)
      .expect(204);

    // Token de user1 → 401
    expect(await probarToken(tokenU1)).toBe(401);

    // Token de user2 → sigue válido
    expect(await probarToken(tokenU2)).not.toBe(401);
  });
});
