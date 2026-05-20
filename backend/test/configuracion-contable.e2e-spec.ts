import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta } from '@prisma/client';
import request from 'supertest';

import {
  poblarConfiguracionContableRequerida,
  sembrarPlanCuentasComercial,
} from '../prisma/seeds/prod/planes-cuentas/comercial';
import { AppModule } from '../src/app.module';

import {
  cleanupTestData,
  createTestUserWithTenant,
  ensurePuctSeeded,
  prisma,
} from './helpers/test-factory';

describe('ConfiguracionContable (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await ensurePuctSeeded();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  async function setupTenant(email = `owner-${Date.now()}@e2e.bo`): Promise<{
    accessToken: string;
    tenantId: string;
  }> {
    const { tenant } = await createTestUserWithTenant({ email, password: 'pass12345' });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'pass12345' });
    expect(res.status).toBe(200);
    return { accessToken: res.body.accessToken as string, tenantId: tenant.id };
  }

  // ---------------------------------------------------------------
  // 12. GET /configuracion-contable devuelve config vacía en tenant sin fila
  // ---------------------------------------------------------------
  it('12. GET /configuracion-contable devuelve config vacía cuando aún no hay fila', async () => {
    const { accessToken, tenantId } = await setupTenant();

    const res = await request(app.getHttpServer())
      .get('/api/configuracion-contable')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);

    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe(tenantId);
    expect(res.body.ivaCreditoId).toBeNull();
    expect(res.body.ivaDebitoId).toBeNull();
    expect(res.body.resultadoEjercicioId).toBeNull();
  });

  // ---------------------------------------------------------------
  // 13. PATCH con cuenta de clase incorrecta
  // ---------------------------------------------------------------
  it('13. PATCH con cuenta ACTIVO mapeada al ivaDebitoId devuelve CONFIG_CUENTA_CLASE_INCORRECTA', async () => {
    const { accessToken, tenantId } = await setupTenant();

    // Crear una cuenta ACTIVO detalle del tenant para usarla como mapeo (incorrecto).
    const cuentaActivo = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.1.001',
        codigoPuct: '1.1.1.001',
        nombre: 'CAJA',
        claseCuenta: ClaseCuenta.ACTIVO,
        subClaseCuenta: 'ACTIVO_CORRIENTE',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
      },
    });

    const res = await request(app.getHttpServer())
      .patch('/api/configuracion-contable')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId)
      .send({ ivaDebitoId: cuentaActivo.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONFIG_CUENTA_CLASE_INCORRECTA');
    expect(res.body.error.details.claseEsperada).toBe('PASIVO');
    expect(res.body.error.details.claseRecibida).toBe('ACTIVO');
  });

  // ---------------------------------------------------------------
  // 14. Flujo cruzado: cuenta NO-requerida-sistema mapeada → desactivar falla → remap → desactivar OK
  // ---------------------------------------------------------------
  // Usamos cuentas creadas manualmente (esRequeridaSistema = false) para aislar
  // el camino CUENTA_CONFIGURADA_COMO_CONCEPTO. Las cuentas que vienen del seed
  // COMERCIAL tienen esRequeridaSistema = true y disparan otro error antes
  // (CUENTA_REQUERIDA_SISTEMA_INMUTABLE) — ese camino se cubre en tests unitarios.
  it('14. flujo cruzado: desactivar cuenta mapeada como concepto falla, remap y luego OK', async () => {
    const { accessToken, tenantId } = await setupTenant();

    // Dos cuentas ACTIVO detalle del mismo tenant, creadas manualmente.
    const original = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.6.001',
        nombre: 'IVA CRÉDITO FISCAL (manual)',
        claseCuenta: ClaseCuenta.ACTIVO,
        subClaseCuenta: 'ACTIVO_CORRIENTE',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
      },
    });
    const alternativa = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.6.099',
        nombre: 'IVA CRÉDITO FISCAL (alternativa)',
        claseCuenta: ClaseCuenta.ACTIVO,
        subClaseCuenta: 'ACTIVO_CORRIENTE',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
      },
    });

    // 1. Mapear la original como ivaCreditoId vía PATCH.
    const map = await request(app.getHttpServer())
      .patch('/api/configuracion-contable')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId)
      .send({ ivaCreditoId: original.id });
    expect(map.status).toBe(200);
    expect(map.body.ivaCreditoId).toBe(original.id);

    // 2. Intentar desactivar la original → rechazo con lista de conceptos.
    const delFail = await request(app.getHttpServer())
      .delete(`/api/cuentas/${original.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);
    expect(delFail.status).toBe(409);
    expect(delFail.body.error.code).toBe('CUENTA_CONFIGURADA_COMO_CONCEPTO');
    expect(delFail.body.error.details.conceptos).toContain('ivaCreditoId');

    // 3. Remapear ivaCreditoId a la alternativa.
    const remap = await request(app.getHttpServer())
      .patch('/api/configuracion-contable')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId)
      .send({ ivaCreditoId: alternativa.id });
    expect(remap.status).toBe(200);
    expect(remap.body.ivaCreditoId).toBe(alternativa.id);

    // 4. Ahora sí se puede desactivar la original.
    const delOk = await request(app.getHttpServer())
      .delete(`/api/cuentas/${original.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);
    expect(delOk.status).toBe(200);
    expect(delOk.body.activa).toBe(false);
  });

  // ---------------------------------------------------------------
  // 15. DELETE /:concepto desmapea sin tocar el resto
  // ---------------------------------------------------------------
  it('15. DELETE /configuracion-contable/:concepto desmapea solo ese campo', async () => {
    const { accessToken, tenantId } = await setupTenant();

    const stats = await sembrarPlanCuentasComercial(prisma, tenantId);
    await poblarConfiguracionContableRequerida(prisma, tenantId, stats.porCodigoInterno);

    const del = await request(app.getHttpServer())
      .delete('/api/configuracion-contable/ivaDebitoId')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);
    expect(del.status).toBe(200);
    expect(del.body.ivaDebitoId).toBeNull();
    // Otros conceptos siguen mapeados.
    expect(del.body.ivaCreditoId).toBeTruthy();
    expect(del.body.resultadoEjercicioId).toBeTruthy();

    // Concepto inválido → 400.
    const invalido = await request(app.getHttpServer())
      .delete('/api/configuracion-contable/fooBar')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);
    expect(invalido.status).toBe(400);
    expect(invalido.body.error.code).toBe('CONFIG_CONCEPTO_INVALIDO');
  });
});
