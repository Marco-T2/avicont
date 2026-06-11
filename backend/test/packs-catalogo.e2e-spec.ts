import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TipoPack, VerticalPack } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { cleanupTestData, createTestMembership, createTestTenant, createTestUser, prisma } from './helpers/test-factory';

/**
 * E2E del Slice 0: catálogo global de packs para super-admin.
 * GET /api/admin/platform/packs devuelve el catálogo de packs vendibles.
 *
 * TDD: el primer describe prueba que 404 (endpoint aún no existe).
 * Tras la implementación los tests positivos/negativos pasan.
 */
async function buildApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
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

describe('Catálogo de packs (GET /api/admin/platform/packs) — super-admin', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Sembrar packs en el catálogo
    await prisma.pack.createMany({
      data: [
        {
          clave: 'contabilidad.adjuntos',
          nombre: 'Adjuntos a comprobantes',
          descripcion: 'Guarda documentos de respaldo vinculados a un comprobante.',
          verticalAplicable: VerticalPack.CONTABILIDAD,
          tipo: TipoPack.CAPACIDAD,
        },
        {
          clave: 'contabilidad.rag',
          nombre: 'RAG + Agente inteligente',
          descripcion: 'Corpus curado de documentos vectorizados.',
          verticalAplicable: VerticalPack.CONTABILIDAD,
          tipo: TipoPack.CAPACIDAD,
        },
        {
          clave: 'granja.rag',
          nombre: 'RAG + Agente inteligente (Granja)',
          descripcion: 'Corpus curado del vertical Granja.',
          verticalAplicable: VerticalPack.GRANJA,
          tipo: TipoPack.CAPACIDAD,
        },
      ],
    });

    // Super-admin
    const superAdminPassword = 'superpass123';
    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    await prisma.user.create({
      data: { email: 'superadmin-packs@test.com', hashedPassword, isSuperAdmin: true },
    });
    superAdminToken = await login(app, 'superadmin-packs@test.com', superAdminPassword);

    // OWNER normal (no SA)
    const owner = await createTestUser({ email: 'owner-packs@test.com', password: 'pass12345' });
    const tenant = await createTestTenant({ name: `Org Owner Packs ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    ownerToken = await login(app, 'owner-packs@test.com', 'pass12345');
  });

  it('[+] super-admin puede listar el catálogo de packs → 200 con array de packs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/packs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    // Verificar shape del DTO
    const pack = res.body[0] as Record<string, unknown>;
    expect(pack).toHaveProperty('id');
    expect(pack).toHaveProperty('clave');
    expect(pack).toHaveProperty('nombre');
    expect(pack).toHaveProperty('verticalAplicable');
    expect(pack).toHaveProperty('tipo');
    expect(pack).toHaveProperty('activo');
  });

  it('[+] los packs del catálogo tienen las claves correctas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/packs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const claves = (res.body as Array<{ clave: string }>).map((p) => p.clave);
    expect(claves).toContain('contabilidad.adjuntos');
    expect(claves).toContain('contabilidad.rag');
    expect(claves).toContain('granja.rag');
  });

  it('[-] OWNER (no super-admin) → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/packs')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });

  it('[-] sin JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/packs');

    expect(res.status).toBe(401);
  });
});
