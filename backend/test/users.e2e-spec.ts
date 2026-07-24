import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { cleanupTestData } from './helpers/test-factory';

describe('Users /me (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'leak@example.com', password: 'password123', displayName: 'Antes' });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'leak@example.com', password: 'password123' });

    accessToken = login.body.accessToken;
  });

  describe('PATCH /api/users/me', () => {
    it('nunca filtra hashedPassword en el response', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: 'Nuevo Nombre' })
        .expect(200);

      expect(response.body).not.toHaveProperty('hashedPassword');
      // Allow-list implícita: todos los campos esperados están, ningún otro.
      expect(Object.keys(response.body).sort()).toEqual(
        [
          'createdAt',
          'displayName',
          'email',
          'id',
          'isActive',
          'isEmailVerified',
          'updatedAt',
        ].sort(),
      );
      expect(response.body.displayName).toBe('Nuevo Nombre');
      expect(response.body.email).toBe('leak@example.com');
    });
  });

  describe('GET /api/users/me', () => {
    it('nunca filtra hashedPassword en el profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('hashedPassword');
      expect(response.body.email).toBe('leak@example.com');
    });
  });
});
