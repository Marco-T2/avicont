import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
  cleanupTestData,
  createTestTenant,
  createTestUserWithTenant,
  ensurePuctSeeded,
  prisma,
} from './helpers/test-factory';

describe('Cuentas (e2e)', () => {
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

  // Crea user + tenant + membership + login. Devuelve accessToken y tenantId.
  async function setupTenant(email = `owner-${Date.now()}@e2e.bo`): Promise<{
    accessToken: string;
    tenantId: string;
    userId: string;
  }> {
    const { user, tenant } = await createTestUserWithTenant({ email, password: 'pass12345' });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'pass12345' });
    expect(res.status).toBe(200);
    return { accessToken: res.body.accessToken as string, tenantId: tenant.id, userId: user.id };
  }

  async function crearCuenta(
    accessToken: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/api/cuentas')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId)
      .send(payload);
  }

  // ---------------------------------------------------------------
  // 1. Creación de cuenta raíz con nivel calculado
  // ---------------------------------------------------------------
  it('1. POST /cuentas crea raíz con nivel calculado desde codigoInterno', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.nivel).toBe(1);
    expect(res.body.parentId).toBeNull();
    expect(res.body.esSystemSeed).toBe(false);
  });

  // ---------------------------------------------------------------
  // 2. Parent de otro tenant → CUENTA_PADRE_INVALIDA
  // ---------------------------------------------------------------
  it('2. POST /cuentas con parent de otro tenant devuelve CUENTA_PADRE_INVALIDA', async () => {
    const { accessToken, tenantId } = await setupTenant();

    // Parent creado en un tenant DISTINTO.
    const otroTenant = await createTestTenant({ name: 'Ajeno', slug: `ajeno-${Date.now()}` });
    const parentAjeno = await prisma.cuenta.create({
      data: {
        organizationId: otroTenant.id,
        codigoInterno: '1',
        nombre: 'ACTIVO',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 1,
        esDetalle: false,
      },
    });

    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1.1',
      nombre: 'ACTIVO CORRIENTE',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      parentId: parentAjeno.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_PADRE_INVALIDA');
  });

  // ---------------------------------------------------------------
  // 3. codigoPuct inexistente → CUENTA_CODIGO_PUCT_INVALIDO
  // ---------------------------------------------------------------
  it('3. POST /cuentas con codigoPuct inexistente devuelve CUENTA_CODIGO_PUCT_INVALIDO', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      codigoPuct: '9.9.9.999',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_CODIGO_PUCT_INVALIDO');
  });

  // ---------------------------------------------------------------
  // 4. codigoPuct de nivel 3 → CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE
  // ---------------------------------------------------------------
  it('4. POST /cuentas con codigoPuct de nivel 3 devuelve CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE', async () => {
    const { accessToken, tenantId } = await setupTenant();
    // 1.1.1 es un subgrupo de nivel 3 real del PUCT (DISPONIBILIDADES → CAJA).
    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      codigoPuct: '1.1.1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE');
  });

  // ---------------------------------------------------------------
  // 5. GAP 1: subClase inconsistente con clase → CUENTA_SUBCLASE_INCONSISTENTE
  // ---------------------------------------------------------------
  it('5. GAP — subClase inconsistente con clase devuelve CUENTA_SUBCLASE_INCONSISTENTE', async () => {
    const { accessToken, tenantId } = await setupTenant();
    // Creamos una raíz válida primero para tener parent válido en nivel 2.
    const raiz = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    expect(raiz.status).toBe(201);

    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1.1',
      nombre: 'ACTIVO ??',
      claseCuenta: ClaseCuenta.ACTIVO,
      // Subclase de INGRESO en una cuenta ACTIVO — inválido.
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      parentId: raiz.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_SUBCLASE_INCONSISTENTE');
  });

  // ---------------------------------------------------------------
  // 6. GAP 2: nivel derivado != parent.nivel + 1
  // ---------------------------------------------------------------
  it('6. GAP — nivel derivado != parent.nivel + 1 devuelve CUENTA_CODIGO_INTERNO_INVALIDO', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const raiz = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    expect(raiz.status).toBe(201);

    // codigoInterno "1.1.1.001" → nivel 4, pero parent es nivel 1 → mismatch.
    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1.1.1.001',
      nombre: 'Salto de nivel',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: true,
      parentId: raiz.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_CODIGO_INTERNO_INVALIDO');
    expect(res.body.error.details.nivelDerivado).toBe(4);
    expect(res.body.error.details.nivelEsperado).toBe(2);
  });

  // ---------------------------------------------------------------
  // 7. GAP 3: esContraria con naturaleza igual al default
  // ---------------------------------------------------------------
  it('7. GAP — esContraria sin invertir naturaleza devuelve CUENTA_CONTRARIA_NATURALEZA_INVALIDA', async () => {
    const { accessToken, tenantId } = await setupTenant();
    // ACTIVO default = DEUDORA. Si esContraria = true, naturaleza debe ser ACREEDORA.
    // Aquí la dejamos DEUDORA (default) → debe fallar.
    const res = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'Contraria mal definida',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      esContraria: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUENTA_CONTRARIA_NATURALEZA_INVALIDA');
  });

  // ---------------------------------------------------------------
  // 8. mapear-puct captura snapshot (nombre + versión)
  // ---------------------------------------------------------------
  it('8. POST /cuentas/:id/mapear-puct captura nombrePuctSnapshot y versionPuctMapeado', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const creada = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    expect(creada.status).toBe(201);

    // 1.1.1.001 = CAJA (nivel 4 en el PUCT).
    const map = await request(app.getHttpServer())
      .post(`/api/cuentas/${creada.body.id}/mapear-puct`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId)
      .send({ codigoPuct: '1.1.1.001' });

    expect(map.status).toBe(201);
    expect(map.body.codigoPuct).toBe('1.1.1.001');
    expect(map.body.nombrePuctSnapshot).toBe('CAJA');
    expect(map.body.versionPuctMapeado).toBeTruthy();
  });

  // ---------------------------------------------------------------
  // 9. GET /cuentas/tree devuelve jerarquía ordenada
  // ---------------------------------------------------------------
  it('9. GET /cuentas/tree devuelve jerarquía con hijas agrupadas bajo sus padres', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const raiz = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1.1',
      nombre: 'ACTIVO CORRIENTE',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
      parentId: raiz.body.id,
    });

    const tree = await request(app.getHttpServer())
      .get('/api/cuentas/tree')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);

    expect(tree.status).toBe(200);
    expect(tree.body).toHaveLength(1);
    expect(tree.body[0].codigoInterno).toBe('1');
    expect(tree.body[0].hijas).toHaveLength(1);
    expect(tree.body[0].hijas[0].codigoInterno).toBe('1.1');
  });

  // ---------------------------------------------------------------
  // 10. DELETE /cuentas/:id desactiva cuando no hay conceptos configurados
  // ---------------------------------------------------------------
  it('10. DELETE /cuentas/:id desactiva (activa=false) si no está configurada como concepto', async () => {
    const { accessToken, tenantId } = await setupTenant();
    const creada = await crearCuenta(accessToken, tenantId, {
      codigoInterno: '1',
      nombre: 'ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });
    expect(creada.status).toBe(201);

    const del = await request(app.getHttpServer())
      .delete(`/api/cuentas/${creada.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenantId);

    expect(del.status).toBe(200);
    expect(del.body.activa).toBe(false);
  });

  // ---------------------------------------------------------------
  // 11. Tenant isolation: GET /cuentas no lista cuentas de otro tenant
  // ---------------------------------------------------------------
  it('11. GET /cuentas solo devuelve cuentas del tenant autenticado', async () => {
    const t1 = await setupTenant('t1@e2e.bo');
    const t2 = await setupTenant('t2@e2e.bo');

    await crearCuenta(t1.accessToken, t1.tenantId, {
      codigoInterno: '1',
      nombre: 'T1 ACTIVO',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      esDetalle: false,
    });

    const listT2 = await request(app.getHttpServer())
      .get('/api/cuentas')
      .set('Authorization', `Bearer ${t2.accessToken}`)
      .set('x-tenant-id', t2.tenantId);

    expect(listT2.status).toBe(200);
    expect(listT2.body.items).toHaveLength(0);
    expect(listT2.body.total).toBe(0);
  });
});
