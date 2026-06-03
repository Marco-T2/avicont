import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import * as bcrypt from 'bcrypt';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.impersonationAction.deleteMany({});
    await prisma.impersonationLog.deleteMany({});
    await prisma.invitation.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.customRole.deleteMany({});
    await prisma.featureFlag.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(400);
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'invalid', password: 'password123' })
        .expect(400);
    });

    it('should reject short password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short' })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          email: 'login@example.com',
          hashedPassword,
        },
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      // refreshToken ya NO viene en el body — ahora se emite como cookie
      // httpOnly, SameSite=Strict, Path=/api/auth (ver auth.controller).
      expect(response.body).not.toHaveProperty('refreshToken');
      const setCookie = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const refreshCookie = cookies.find(
        (c): c is string => typeof c === 'string' && c.startsWith('refreshToken='),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('SameSite=Strict');
      expect(refreshCookie).toContain('Path=/api/auth');
    });

    it('should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'wrongpassword' })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' })
        .expect(401);
    });

    it('should reject deactivated user', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          email: 'deactivated@example.com',
          hashedPassword,
          isActive: false,
        },
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'deactivated@example.com', password: 'password123' })
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    // Helper: extrae el header `Cookie` para mandarlo en el próximo request.
    // supertest guarda el Set-Cookie completo, pero el request outgoing solo
    // necesita `name=value` (sin flags).
    function extractCookieHeader(setCookieHeader: string | string[] | undefined): string {
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader !== undefined
          ? [setCookieHeader]
          : [];
      const refresh = cookies.find(
        (c): c is string => typeof c === 'string' && c.startsWith('refreshToken='),
      );
      if (refresh === undefined) throw new Error('No refreshToken cookie in response');
      return refresh.split(';')[0] ?? '';
    }

    let refreshCookieHeader: string;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          email: 'refresh@example.com',
          hashedPassword,
        },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'refresh@example.com', password: 'password123' });

      refreshCookieHeader = extractCookieHeader(loginRes.headers['set-cookie']);
    });

    it('should refresh tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookieHeader)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      // El nuevo refresh viene como cookie rotada, NO en el body.
      expect(response.body).not.toHaveProperty('refreshToken');
      const newCookie = extractCookieHeader(response.headers['set-cookie']);
      expect(newCookie).not.toBe(refreshCookieHeader);
    });

    it('should reject used refresh token (rotation)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookieHeader)
        .expect(200);

      // El mismo cookie ya fue rotado; reutilizarlo debe fallar.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookieHeader)
        .expect(401);
    });

    it('should reject missing refresh cookie', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });
  });
});
