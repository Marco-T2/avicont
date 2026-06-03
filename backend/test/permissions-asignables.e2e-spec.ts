import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

/**
 * E2E del cierre de la deuda RBAC (packs-riel Slice 7): el catálogo asignable
 * (`GET /api/permissions/grouped`) y la validación de `POST /api/custom-roles`
 * se filtran server-authoritative por el vertical activo + los packs activos de
 * la org. Ver `docs/disenos/packs-eje2.md` §7.
 *
 * Convención del riel: un submódulo `{modulo}.{submodulo}` que sea CLAVE de un
 * `Pack` solo es asignable si ese pack está activo. Aquí se usa el submódulo
 * REAL `contabilidad.ventas` (tiene permisos en el catálogo) como pack de
 * dominio para ejercitar el candado sobre permisos exactos.
 */
describe('Permisos asignables filtrados por vertical + packs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  // ---- Helpers ----

  async function crearOrgConOwner(opts: {
    slug: string;
    contabilidad: boolean;
    granja: boolean;
  }): Promise<{ orgId: string; token: string; ownerId: string }> {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner-${opts.slug}@test.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: opts.slug,
        name: opts.slug,
        contabilidadEnabled: opts.contabilidad,
        granjaEnabled: opts.granja,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner-${opts.slug}@test.bo`, password: 'password123' });
    return { orgId: org.id, token: loginRes.body.accessToken, ownerId: owner.id };
  }

  // Crea el pack `contabilidad.ventas` en el catálogo y, opcionalmente, lo
  // habilita+activa para la org. Devuelve el packId.
  async function seedPackVentas(orgId: string, ownerId: string, activo: boolean): Promise<string> {
    const pack = await prisma.pack.create({
      data: {
        clave: 'contabilidad.ventas',
        nombre: 'Ventas',
        verticalAplicable: 'CONTABILIDAD',
        tipo: 'DOMINIO',
      },
    });
    await prisma.orgPackEntitlement.create({
      data: { organizationId: orgId, packId: pack.id, activo, habilitadoPorUserId: ownerId },
    });
    return pack.id;
  }

  function clavesDe(body: Array<{ submodulos: Array<{ permisos: Array<{ key: string }> }> }>): string[] {
    return body.flatMap((g) => g.submodulos.flatMap((s) => s.permisos.map((p) => p.key)));
  }

  // ---- GET /api/permissions/grouped (catálogo asignable) ----

  describe('GET /api/permissions/grouped', () => {
    it('org de contabilidad sin packs → contabilidad + cross-vertical, sin granja', async () => {
      const { token, orgId } = await crearOrgConOwner({
        slug: 'org-cont',
        contabilidad: true,
        granja: false,
      });

      const res = await request(app.getHttpServer())
        .get('/api/permissions/grouped')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBe(200);
      const keys = clavesDe(res.body);
      expect(keys).toContain('contabilidad.asientos.read');
      expect(keys).toContain('organizacion.roles.read');
      expect(keys).toContain('sistema.feature-flags.admin');
      expect(keys.some((k) => k.startsWith('granja.'))).toBe(false);
    });

    it('org de granja → solo granja + cross-vertical, sin contabilidad', async () => {
      const { token, orgId } = await crearOrgConOwner({
        slug: 'org-granja',
        contabilidad: false,
        granja: true,
      });

      const res = await request(app.getHttpServer())
        .get('/api/permissions/grouped')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBe(200);
      const keys = clavesDe(res.body);
      expect(keys).toContain('granja.lotes.read');
      expect(keys).toContain('organizacion.roles.read');
      expect(keys.some((k) => k.startsWith('contabilidad.'))).toBe(false);
    });

    it('pack contabilidad.ventas inactivo → NO ofrece contabilidad.ventas.*', async () => {
      const { token, orgId, ownerId } = await crearOrgConOwner({
        slug: 'org-pack-off',
        contabilidad: true,
        granja: false,
      });
      await seedPackVentas(orgId, ownerId, false);

      const res = await request(app.getHttpServer())
        .get('/api/permissions/grouped')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBe(200);
      const keys = clavesDe(res.body);
      expect(keys.some((k) => k.startsWith('contabilidad.ventas.'))).toBe(false);
      // Core del vertical sigue presente.
      expect(keys).toContain('contabilidad.asientos.read');
    });

    it('pack contabilidad.ventas activo → ofrece contabilidad.ventas.*', async () => {
      const { token, orgId, ownerId } = await crearOrgConOwner({
        slug: 'org-pack-on',
        contabilidad: true,
        granja: false,
      });
      await seedPackVentas(orgId, ownerId, true);

      const res = await request(app.getHttpServer())
        .get('/api/permissions/grouped')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId);

      expect(res.status).toBe(200);
      const keys = clavesDe(res.body);
      expect(keys).toContain('contabilidad.ventas.read');
    });
  });

  // ---- POST /api/custom-roles (el candado) ----

  describe('POST /api/custom-roles (validatePermissions con filtro de pack)', () => {
    it('rechaza permiso de pack inactivo con CUSTOM_ROLE_PERMISO_NO_HABILITADO', async () => {
      const { token, orgId, ownerId } = await crearOrgConOwner({
        slug: 'org-rol-off',
        contabilidad: true,
        granja: false,
      });
      await seedPackVentas(orgId, ownerId, false);

      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'vendedor', name: 'Vendedor', permissions: ['contabilidad.ventas.read'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ROLE_PERMISO_NO_HABILITADO');
    });

    it('acepta permiso de pack activo', async () => {
      const { token, orgId, ownerId } = await crearOrgConOwner({
        slug: 'org-rol-on',
        contabilidad: true,
        granja: false,
      });
      await seedPackVentas(orgId, ownerId, true);

      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'vendedor', name: 'Vendedor', permissions: ['contabilidad.ventas.read'] });

      expect(res.status).toBe(201);
      expect(res.body.permissions).toContain('contabilidad.ventas.read');
    });

    it('rechaza permiso de OTRO vertical (granja.*) en una org de contabilidad', async () => {
      const { token, orgId } = await crearOrgConOwner({
        slug: 'org-rol-vert',
        contabilidad: true,
        granja: false,
      });

      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId)
        .send({ slug: 'granjero', name: 'Granjero', permissions: ['granja.lotes.read'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ROLE_PERMISO_NO_HABILITADO');
    });

    it('acepta permiso core del vertical y cross-vertical sin pack', async () => {
      const { token, orgId } = await crearOrgConOwner({
        slug: 'org-rol-core',
        contabilidad: true,
        granja: false,
      });

      const res = await request(app.getHttpServer())
        .post('/api/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', orgId)
        .send({
          slug: 'contador',
          name: 'Contador',
          permissions: ['contabilidad.asientos.read', 'organizacion.miembros.read'],
        });

      expect(res.status).toBe(201);
    });
  });
});

async function cleanup(prisma: PrismaService) {
  await prisma.refreshToken.deleteMany({});
  await prisma.platformAudit.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.orgPackEntitlement.deleteMany({});
  await prisma.pack.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
