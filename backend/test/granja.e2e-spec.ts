import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NaturalezaRegistro, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

/**
 * E2E del vertical Granja (S5). Cubre la spec granja-rbac-activacion + aislamiento
 * multi-tenant a través de HTTP real (Supertest + AppModule):
 *   - Module gating (@RequireModule('granja') → 404 si el módulo está apagado).
 *   - RBAC: sin permiso fino → 403.
 *   - Aislamiento multi-tenant: recursos de otra org → 404.
 *   - cantidadInicial inmutable → 422 GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE.
 *   - Invariante avesVivas ≥ 0 → 422 GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS.
 *   - Seed-on-activation: activar granja siembra 12 tipos (idempotente).
 */
describe('Granja (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Fixtures
  let orgAId: string; // granja ON
  let orgBId: string; // granja ON (para aislamiento)
  let orgNoGranjaId: string; // granja OFF (contabilidad ON)
  let orgActivarId: string; // ambos OFF (para test de activación)

  let tokenA: string; // OWNER de orgA
  let tokenB: string; // OWNER de orgB
  let tokenNoGranja: string; // OWNER de orgNoGranja
  let tokenActivar: string; // OWNER de orgActivar
  let tokenLimitadoA: string; // miembro de orgA con permisos granja read-only

  let tipoInversionAId: string;
  let tipoCantidadAId: string;
  let tipoInversionBId: string;

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    await cleanup(prisma);

    const hashed = await bcrypt.hash('password123', 10);

    async function crearOrgConOwner(
      slug: string,
      email: string,
      flags: { contabilidadEnabled: boolean; granjaEnabled: boolean },
    ): Promise<string> {
      const owner = await prisma.user.create({
        data: { email, hashedPassword: hashed, isEmailVerified: true },
      });
      const org = await prisma.organization.create({
        data: {
          slug,
          name: slug,
          ...flags,
          memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
        },
      });
      return org.id;
    }

    orgAId = await crearOrgConOwner('org-granja-a', 'ownera@granja.bo', {
      contabilidadEnabled: false,
      granjaEnabled: true,
    });
    orgBId = await crearOrgConOwner('org-granja-b', 'ownerb@granja.bo', {
      contabilidadEnabled: false,
      granjaEnabled: true,
    });
    orgNoGranjaId = await crearOrgConOwner('org-sin-granja', 'ownerng@granja.bo', {
      contabilidadEnabled: true,
      granjaEnabled: false,
    });
    orgActivarId = await crearOrgConOwner('org-activar', 'owneract@granja.bo', {
      contabilidadEnabled: false,
      granjaEnabled: false,
    });

    // Miembro de orgA con permisos granja read-only (sin create/update/delete).
    const limitado = await prisma.user.create({
      data: { email: 'limitadoa@granja.bo', hashedPassword: hashed, isEmailVerified: true },
    });
    const rolReadOnly = await prisma.customRole.create({
      data: {
        organizationId: orgAId,
        slug: 'granjero-lector',
        name: 'Granjero lector',
        permissions: ['granja.lotes.read', 'granja.dashboard.read', 'granja.tipos-registro.read'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgAId, userId: limitado.id, customRoleId: rolReadOnly.id },
    });

    // Tipos de registro por org (creados directo en BD: las orgs nacieron vía
    // prisma.create, que no dispara el seed del service).
    const tipoInvA = await prisma.tipoRegistro.create({
      data: {
        organizationId: orgAId,
        nombre: 'Alimento',
        naturaleza: NaturalezaRegistro.INVERSION,
        esSistema: false,
      },
    });
    tipoInversionAId = tipoInvA.id;
    const tipoCantA = await prisma.tipoRegistro.create({
      data: {
        organizationId: orgAId,
        nombre: 'Mortalidad',
        naturaleza: NaturalezaRegistro.CANTIDAD,
        esSistema: false,
      },
    });
    tipoCantidadAId = tipoCantA.id;
    const tipoInvB = await prisma.tipoRegistro.create({
      data: {
        organizationId: orgBId,
        nombre: 'Alimento',
        naturaleza: NaturalezaRegistro.INVERSION,
        esSistema: false,
      },
    });
    tipoInversionBId = tipoInvB.id;

    tokenA = await login('ownera@granja.bo', 'password123');
    tokenB = await login('ownerb@granja.bo', 'password123');
    tokenNoGranja = await login('ownerng@granja.bo', 'password123');
    tokenActivar = await login('owneract@granja.bo', 'password123');
    tokenLimitadoA = await login('limitadoa@granja.bo', 'password123');
  });

  afterAll(async () => {
    await cleanup(prisma);
    await app.close();
  });

  // Helper para crear un lote vía API y devolver su id.
  async function crearLote(token: string, orgId: string, cantidadInicial = 1000): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/granja/lotes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-ID', orgId)
      .send({ cantidadInicial, fechaIngreso: '2026-06-01' });
    return res.body.id;
  }

  describe('Module gating — granja', () => {
    it('org con granjaEnabled=false → GET /granja/dashboard → 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/granja/dashboard')
        .set('Authorization', `Bearer ${tokenNoGranja}`)
        .set('X-Tenant-ID', orgNoGranjaId);
      expect(res.status).toBe(404);
    });

    it('org con granjaEnabled=true + OWNER → GET /granja/dashboard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/granja/dashboard')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('sin permiso granja.lotes.create → POST /granja/lotes → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/granja/lotes')
        .set('Authorization', `Bearer ${tokenLimitadoA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ cantidadInicial: 500, fechaIngreso: '2026-06-01' });
      expect(res.status).toBe(403);
    });

    it('sin permiso granja.lotes.update → POST /granja/lotes/:id/cerrar → 403', async () => {
      const loteId = await crearLote(tokenA, orgAId);
      const res = await request(app.getHttpServer())
        .post(`/api/granja/lotes/${loteId}/cerrar`)
        .set('Authorization', `Bearer ${tokenLimitadoA}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(403);
    });
  });

  describe('Aislamiento multi-tenant — lotes', () => {
    it('usuario org A no puede ver lote de org B → 404', async () => {
      const loteB = await crearLote(tokenB, orgBId);
      const res = await request(app.getHttpServer())
        .get(`/api/granja/lotes/${loteB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId);
      expect(res.status).toBe(404);
    });

    it('usuario org A no puede editar lote de org B → 404', async () => {
      const loteB = await crearLote(tokenB, orgBId);
      const res = await request(app.getHttpServer())
        .patch(`/api/granja/lotes/${loteB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ galpon: 'hackeado' });
      expect(res.status).toBe(404);
    });

    it('usuario org A no puede registrar movimiento en lote de org B → 404', async () => {
      const loteB = await crearLote(tokenB, orgBId);
      const res = await request(app.getHttpServer())
        .post(`/api/granja/lotes/${loteB}/movimientos/inversion`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ monto: '100.00', fecha: '2026-06-02', tipoRegistroId: tipoInversionAId });
      expect(res.status).toBe(404);
    });

    it('usuario org A no puede usar TipoRegistro de org B → 404', async () => {
      const loteA = await crearLote(tokenA, orgAId);
      const res = await request(app.getHttpServer())
        .post(`/api/granja/lotes/${loteA}/movimientos/inversion`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ monto: '100.00', fecha: '2026-06-02', tipoRegistroId: tipoInversionBId });
      expect(res.status).toBe(404);
    });
  });

  describe('cantidadInicial inmutable', () => {
    it('PATCH /lotes/:id con cantidadInicial → 422 GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE', async () => {
      const loteId = await crearLote(tokenA, orgAId, 5000);
      const res = await request(app.getHttpServer())
        .patch(`/api/granja/lotes/${loteId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ cantidadInicial: 4800 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE');

      // El lote conserva cantidadInicial
      const detalle = await request(app.getHttpServer())
        .get(`/api/granja/lotes/${loteId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId);
      expect(detalle.body.cantidadInicial).toBe(5000);
    });
  });

  describe('invariante avesVivas', () => {
    it('mortalidad que excede avesVivas → 422 GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS', async () => {
      const loteId = await crearLote(tokenA, orgAId, 10);

      // 8 muertes: avesVivas = 2 → OK
      const ok = await request(app.getHttpServer())
        .post(`/api/granja/lotes/${loteId}/movimientos/cantidad`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ cantidad: 8, fecha: '2026-06-02', tipoRegistroId: tipoCantidadAId });
      expect(ok.status).toBe(201);

      // 5 muertes más: 5 > avesVivas(2) → rechazo
      const exceso = await request(app.getHttpServer())
        .post(`/api/granja/lotes/${loteId}/movimientos/cantidad`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', orgAId)
        .send({ cantidad: 5, fecha: '2026-06-03', tipoRegistroId: tipoCantidadAId });
      expect(exceso.status).toBe(422);
      expect(exceso.body.error.code).toBe('GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS');
    });
  });

  describe('Seed al activar granja (seed-on-activation)', () => {
    it('activar granja en org elegible siembra 12 tipos; re-activar sigue en 12 (idempotente)', async () => {
      // OFF→ON: dispara el seed
      const activar = await request(app.getHttpServer())
        .patch('/api/tenants/current/features')
        .set('Authorization', `Bearer ${tokenActivar}`)
        .set('X-Tenant-ID', orgActivarId)
        .send({ granjaEnabled: true });
      expect(activar.status).toBe(200);
      expect(activar.body).toEqual({ contabilidadEnabled: false, granjaEnabled: true });

      const tipos = await request(app.getHttpServer())
        .get('/api/granja/tipos-registro?activo=all')
        .set('Authorization', `Bearer ${tokenActivar}`)
        .set('X-Tenant-ID', orgActivarId);
      expect(tipos.status).toBe(200);
      expect(tipos.body).toHaveLength(12);

      // Ciclo OFF→ON de nuevo: el seeder re-corre idempotente (upsert), sigue 12.
      await request(app.getHttpServer())
        .patch('/api/tenants/current/features')
        .set('Authorization', `Bearer ${tokenActivar}`)
        .set('X-Tenant-ID', orgActivarId)
        .send({ granjaEnabled: false });
      await request(app.getHttpServer())
        .patch('/api/tenants/current/features')
        .set('Authorization', `Bearer ${tokenActivar}`)
        .set('X-Tenant-ID', orgActivarId)
        .send({ granjaEnabled: true });

      const tipos2 = await request(app.getHttpServer())
        .get('/api/granja/tipos-registro?activo=all')
        .set('Authorization', `Bearer ${tokenActivar}`)
        .set('X-Tenant-ID', orgActivarId);
      expect(tipos2.body).toHaveLength(12);
    });
  });
});

async function cleanup(prisma: PrismaService) {
  const emails = [
    'ownera@granja.bo',
    'ownerb@granja.bo',
    'ownerng@granja.bo',
    'owneract@granja.bo',
    'limitadoa@granja.bo',
  ];
  const slugs = ['org-granja-a', 'org-granja-b', 'org-sin-granja', 'org-activar'];

  const orgs = await prisma.organization.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);

  if (orgIds.length > 0) {
    // Borrar en orden FK-safe: movimientos → lotes → tipos → membership/customRole.
    await prisma.movimientoInversion.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.movimientoCantidad.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.lote.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.tipoRegistro.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.refreshToken.deleteMany({});
    await prisma.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.customRole.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}
