import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole, TipoEmpresa } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('PeriodosFiscales (e2e)', () => {
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

  async function seedOrgConOwner(
    tipo: TipoEmpresa = TipoEmpresa.COMERCIAL,
    slug = 'org-pf',
  ): Promise<{ ownerToken: string; orgId: string; ownerId: string }> {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: {
        email: `owner+${slug}@pf.bo`,
        hashedPassword,
        isEmailVerified: true,
      },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        tipoEmpresaPrincipal: tipo,
        memberships: {
          create: { userId: owner.id, systemRole: SystemRole.OWNER },
        },
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@pf.bo`, password: 'password123' });
    return {
      ownerToken: loginRes.body.accessToken,
      orgId: org.id,
      ownerId: owner.id,
    };
  }

  beforeEach(async () => {
    await cleanup(prisma);
  });

  // ----- Creación de gestión -----

  it('COMERCIAL: crear gestión 2026 → 12 períodos enero-diciembre mismo año', async () => {
    const { ownerToken } = await seedOrgConOwner(TipoEmpresa.COMERCIAL, 'org-comercial');

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.mesInicio).toBe(1);
    expect(res.body.status).toBe('ABIERTA');
    expect(res.body.periodos).toHaveLength(12);
    expect(res.body.periodos[0]).toMatchObject({
      ordenEnGestion: 1,
      year: 2026,
      month: 1,
      status: 'ABIERTO',
    });
    expect(res.body.periodos[11]).toMatchObject({
      ordenEnGestion: 12,
      year: 2026,
      month: 12,
    });
  });

  it('INDUSTRIAL: crear gestión 2026 → períodos abril/2026 a marzo/2027', async () => {
    const { ownerToken } = await seedOrgConOwner(TipoEmpresa.INDUSTRIAL, 'org-industrial');

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.mesInicio).toBe(4);
    expect(res.body.periodos[0]).toMatchObject({
      ordenEnGestion: 1,
      year: 2026,
      month: 4,
    });
    expect(res.body.periodos[8]).toMatchObject({
      ordenEnGestion: 9,
      year: 2026,
      month: 12,
    });
    expect(res.body.periodos[9]).toMatchObject({
      ordenEnGestion: 10,
      year: 2027,
      month: 1,
    });
    expect(res.body.periodos[11]).toMatchObject({
      ordenEnGestion: 12,
      year: 2027,
      month: 3,
    });
  });

  it('AGROPECUARIA: crear gestión 2026 → termina junio/2027', async () => {
    const { ownerToken } = await seedOrgConOwner(TipoEmpresa.AGROPECUARIA, 'org-agro');

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.mesInicio).toBe(7);
    expect(res.body.periodos[0]).toMatchObject({ year: 2026, month: 7 });
    expect(res.body.periodos[11]).toMatchObject({ year: 2027, month: 6 });
  });

  it('MINERA: crear gestión 2026 → termina septiembre/2027', async () => {
    const { ownerToken } = await seedOrgConOwner(TipoEmpresa.MINERA, 'org-minera');

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.mesInicio).toBe(10);
    expect(res.body.periodos[0]).toMatchObject({ year: 2026, month: 10 });
    expect(res.body.periodos[11]).toMatchObject({ year: 2027, month: 9 });
  });

  it('rechaza duplicada con GESTION_DUPLICADA', async () => {
    const { ownerToken } = await seedOrgConOwner();
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GESTION_DUPLICADA');
  });

  it('rechaza year=1999 con GESTION_YEAR_FUERA_DE_RANGO', async () => {
    const { ownerToken } = await seedOrgConOwner();

    const res = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 1999 });

    // 1999 < Min(2000) del DTO → ValidationPipe tira BAD_REQUEST antes que
    // nuestro servicio; verificamos que rechaza con 400.
    expect(res.status).toBe(400);
  });

  // ----- Inmutabilidad de tipoEmpresaPrincipal -----

  it('permite cambiar tipoEmpresaPrincipal si no hay gestiones', async () => {
    const { ownerToken, orgId } = await seedOrgConOwner();

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ tipoEmpresaPrincipal: 'INDUSTRIAL' });

    expect(res.status).toBe(200);
    expect(res.body.tipoEmpresaPrincipal).toBe('INDUSTRIAL');
  });

  it('rechaza cambio de tipoEmpresaPrincipal cuando ya hay gestiones (TENANT_EMPRESA_INMUTABLE)', async () => {
    const { ownerToken, orgId } = await seedOrgConOwner();

    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ tipoEmpresaPrincipal: 'INDUSTRIAL' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TENANT_EMPRESA_INMUTABLE');
  });

  // ----- Listar / detalle -----

  it('GET /gestiones devuelve la lista del tenant', async () => {
    const { ownerToken } = await seedOrgConOwner();
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    const res = await request(app.getHttpServer())
      .get('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].year).toBe(2026);
  });

  it('GET /periodos lista los 12 del tenant', async () => {
    const { ownerToken } = await seedOrgConOwner();
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    const res = await request(app.getHttpServer())
      .get('/api/periodos')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
  });

  it('GET /periodos/:id/resumen-precierre sobre período vacío devuelve ceros y puedeCerrar=true', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;

    const res = await request(app.getHttpServer())
      .get(`/api/periodos/${periodoId}/resumen-precierre`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.comprobantes).toEqual({
      contabilizados: 0,
      borradores: 0,
      anulados: 0,
    });
    expect(res.body.puedeCerrar).toBe(true);
    expect(res.body.periodo.fechaInicio).toBe('2026-01-01');
    expect(res.body.periodo.fechaFin).toBe('2026-01-31');
  });

  // ----- Cierre de período -----

  it('cerrar período sin borradores → OK', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CERRADO');
    expect(res.body.closedAt).toBeDefined();
  });

  it('cerrar período ya cerrado → PERIODO_CERRADO', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;
    await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERIODO_CERRADO');
  });

  // ----- Reapertura -----

  it('reabrir con motivo corto → 400 (DTO ValidationPipe)', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;
    await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/reabrir`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ motivo: 'corto' });

    expect(res.status).toBe(400);
  });

  it('reabrir con motivo válido → OK y crea fila de auditoría', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;
    await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/reabrir`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        motivo: 'Corrección de asiento mal contabilizado en auditoría',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ABIERTO');

    const reopenings = await prisma.periodoFiscalReopening.findMany({
      where: { periodoId },
    });
    expect(reopenings).toHaveLength(1);
    expect(reopenings[0]?.motivo).toContain('Corrección de asiento');
  });

  it('reabrir período abierto → PERIODO_YA_ABIERTO', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/reabrir`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ motivo: 'Reapertura de un período que nunca se cerró' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERIODO_YA_ABIERTO');
  });

  // ----- Cierre definitivo -----

  it('marcar-definitivo período cerrado → OK; después NO permite reabrir', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;
    await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const mk = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/marcar-definitivo`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(mk.status).toBe(201);
    expect(mk.body.esDefinitivo).toBe(true);

    const reabrir = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/reabrir`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        motivo: 'Intento de reapertura de período marcado definitivo',
      });
    expect(reabrir.status).toBe(409);
    expect(reabrir.body.error.code).toBe('PERIODO_DEFINITIVO_NO_REABRIBLE');
  });

  it('marcar-definitivo período abierto → PERIODO_NO_CERRADO', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    const periodoId = g.body.periodos[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/periodos/${periodoId}/marcar-definitivo`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PERIODO_NO_CERRADO');
  });

  // ----- Cierre de gestión -----

  it('cerrar gestión con 11 abiertos → GESTION_CON_PERIODOS_ABIERTOS con lista', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });
    // Cerramos solo el primer período
    await request(app.getHttpServer())
      .post(`/api/periodos/${g.body.periodos[0].id}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app.getHttpServer())
      .post(`/api/gestiones/${g.body.id}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GESTION_CON_PERIODOS_ABIERTOS');
    expect(res.body.error.details.periodosAbiertos).toHaveLength(11);
  });

  it('cerrar gestión con 12 períodos cerrados → OK', async () => {
    const { ownerToken } = await seedOrgConOwner();
    const g = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 });

    for (const p of g.body.periodos) {
      await request(app.getHttpServer())
        .post(`/api/periodos/${p.id}/cerrar`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post(`/api/gestiones/${g.body.id}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CERRADA');
  });
});

async function cleanup(prisma: PrismaService): Promise<void> {
  await prisma.refreshToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.periodoFiscalReopening.deleteMany({});
  await prisma.periodoFiscal.deleteMany({});
  await prisma.gestionFiscal.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
