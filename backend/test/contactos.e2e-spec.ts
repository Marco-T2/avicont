import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  NaturalezaCuenta,
  SystemRole,
  TipoComprobante,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

describe('Contactos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // ==========================================================
  // Fixture: tenant con OWNER
  // ==========================================================

  async function seed(slug = 'org-ct') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@ct.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@ct.bo`, password: 'password123' });
    const token = loginRes.body.accessToken as string;
    return { token, orgId: org.id, ownerId: owner.id };
  }

  async function seedCuentasYGestion(token: string, orgId: string) {
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    const [caja, ventas] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);
    return { cajaId: caja.id, ventasId: ventas.id };
  }

  function lineasBasicas(cajaId: string, ventasId: string, contactoId?: string) {
    return [
      {
        cuentaId: cajaId,
        ...(contactoId !== undefined ? { contactoId } : {}),
        moneda: 'BOB',
        debito: '1000.00',
        credito: '0',
        tipoCambio: '1',
        debitoBob: '1000.00',
        creditoBob: '0',
      },
      {
        cuentaId: ventasId,
        moneda: 'BOB',
        debito: '0',
        credito: '1000.00',
        tipoCambio: '1',
        debitoBob: '0',
        creditoBob: '1000.00',
      },
    ];
  }

  // ==========================================================
  // Auth
  // ==========================================================

  it('rechaza con 401 si no hay token', async () => {
    const res = await request(app.getHttpServer()).get('/api/contactos');
    expect(res.status).toBe(401);
  });

  // ==========================================================
  // CRUD happy path
  // ==========================================================

  it('flujo CRUD completo: POST → GET list → GET detail → PATCH → desactivar → reactivar → DELETE', async () => {
    const { token } = await seed();

    // POST
    const postRes = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razonSocial: 'Granjas El Sol SRL',
        documento: '1234567019',
        esCliente: true,
        esProveedor: false,
        email: 'ventas@elsol.bo',
      });
    expect(postRes.status).toBe(201);
    expect(postRes.body).toMatchObject({
      razonSocial: 'Granjas El Sol SRL',
      documento: '1234567019',
      esCliente: true,
      esProveedor: false,
      activo: true,
    });
    const contactoId = postRes.body.id as string;

    // GET list
    const listRes = await request(app.getHttpServer())
      .get('/api/contactos')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].id).toBe(contactoId);
    expect(listRes.body.page).toBe(1);
    expect(listRes.body.pageSize).toBe(50);

    // GET detail
    const getRes = await request(app.getHttpServer())
      .get(`/api/contactos/${contactoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.razonSocial).toBe('Granjas El Sol SRL');

    // PATCH
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/contactos/${contactoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombreComercial: 'El Sol', esProveedor: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.nombreComercial).toBe('El Sol');
    expect(patchRes.body.esProveedor).toBe(true);
    expect(patchRes.body.esCliente).toBe(true);

    // Desactivar
    const desRes = await request(app.getHttpServer())
      .post(`/api/contactos/${contactoId}/desactivar`)
      .set('Authorization', `Bearer ${token}`);
    expect(desRes.status).toBe(200);
    expect(desRes.body.activo).toBe(false);

    // Listado por default excluye inactivos
    const listActivosRes = await request(app.getHttpServer())
      .get('/api/contactos')
      .set('Authorization', `Bearer ${token}`);
    expect(listActivosRes.body.total).toBe(0);

    // Reactivar
    const reaRes = await request(app.getHttpServer())
      .post(`/api/contactos/${contactoId}/reactivar`)
      .set('Authorization', `Bearer ${token}`);
    expect(reaRes.status).toBe(200);
    expect(reaRes.body.activo).toBe(true);

    // DELETE (no hay líneas referenciadoras)
    const delRes = await request(app.getHttpServer())
      .delete(`/api/contactos/${contactoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    const getAfterDel = await request(app.getHttpServer())
      .get(`/api/contactos/${contactoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAfterDel.status).toBe(404);
  });

  // ==========================================================
  // Validación
  // ==========================================================

  it('POST rechaza ambos flags en false con 400', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razonSocial: 'X SRL',
        esCliente: false,
        esProveedor: false,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONTACTO_FLAGS_INVALIDOS');
  });

  it('POST rechaza documento duplicado dentro del mismo tenant con 409', async () => {
    const { token } = await seed();
    await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razonSocial: 'Primero',
        documento: '9988776',
        esCliente: true,
        esProveedor: false,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razonSocial: 'Duplicado',
        documento: '9988776',
        esCliente: false,
        esProveedor: true,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACTO_DOCUMENTO_DUPLICADO');
    expect(res.body.error.details.documento).toBe('9988776');
  });

  it('POST permite documento repetido entre tenants distintos', async () => {
    const a = await seed('org-ct-a');
    const b = await seed('org-ct-b');
    await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ razonSocial: 'Org A', documento: '111', esCliente: true, esProveedor: false })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ razonSocial: 'Org B', documento: '111', esCliente: true, esProveedor: false })
      .expect(201);
  });

  it('búsqueda q encuentra por infix case-insensitive (GIN trigram)', async () => {
    const { token } = await seed();
    await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Marcos Pérez Olivera', esCliente: true, esProveedor: false })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Granjas El Sol', esCliente: true, esProveedor: false })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/contactos?q=marc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].razonSocial).toBe('Marcos Pérez Olivera');
  });

  it('DELETE con contacto referenciado por una línea → 409 CONTACTO_REFERENCIADO', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await seedCuentasYGestion(token, orgId);

    const contactoRes = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Referenciado', esCliente: true, esProveedor: false });
    expect(contactoRes.status).toBe(201);
    const contactoId = contactoRes.body.id as string;

    await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.INGRESO,
        fechaContable: '2026-04-22',
        glosa: 'Venta con contacto',
        lineas: lineasBasicas(cajaId, ventasId, contactoId),
      })
      .expect(201);

    const delRes = await request(app.getHttpServer())
      .delete(`/api/contactos/${contactoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(409);
    expect(delRes.body.error.code).toBe('CONTACTO_REFERENCIADO');
    expect(delRes.body.error.details.lineasCount).toBe(1);
  });

  // ==========================================================
  // Integración con comprobantes — contactoId inexistente e inactivo
  // ==========================================================

  it('crear comprobante con contactoId inexistente → 422 COMPROBANTE_CONTACTO_NO_EXISTE', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await seedCuentasYGestion(token, orgId);
    const ghostId = '11111111-1111-4111-a111-111111111111';

    const res = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.INGRESO,
        fechaContable: '2026-04-22',
        glosa: 'Venta a fantasma',
        lineas: lineasBasicas(cajaId, ventasId, ghostId),
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COMPROBANTE_CONTACTO_NO_EXISTE');
    expect(res.body.error.details).toEqual({ orden: 1, contactoId: ghostId });
  });

  it('flujo: borrador con contacto activo → desactivar contacto → editar OK → contabilizar falla → reactivar → contabilizar OK', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await seedCuentasYGestion(token, orgId);

    // 1) Crear contacto activo.
    const contactoRes = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Cliente Importante', esCliente: true, esProveedor: false });
    const contactoId = contactoRes.body.id as string;

    // 2) Crear borrador referenciando al contacto.
    const crearRes = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.INGRESO,
        fechaContable: '2026-04-22',
        glosa: 'Venta con contacto asociado',
        lineas: lineasBasicas(cajaId, ventasId, contactoId),
      });
    expect(crearRes.status).toBe(201);
    const comprobanteId = crearRes.body.id as string;

    // 3) Desactivar el contacto mientras el borrador está abierto.
    const desRes = await request(app.getHttpServer())
      .post(`/api/contactos/${contactoId}/desactivar`)
      .set('Authorization', `Bearer ${token}`);
    expect(desRes.status).toBe(200);
    expect(desRes.body.activo).toBe(false);

    // 4) Editar el borrador: debe permitir, la regla es de existencia (no de activo).
    const editRes = await request(app.getHttpServer())
      .patch(`/api/comprobantes/${comprobanteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'Venta con contacto (editado tras desactivación)' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.glosa).toBe('Venta con contacto (editado tras desactivación)');

    // 5) Contabilizar: debe fallar con CONTACTO_INACTIVO (422).
    const contabFailRes = await request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
    expect(contabFailRes.status).toBe(422);
    expect(contabFailRes.body.error.code).toBe('COMPROBANTE_CONTACTO_INACTIVO');
    expect(contabFailRes.body.error.details).toEqual({ orden: 1, contactoId });

    // 6) Reactivar el contacto.
    const reaRes = await request(app.getHttpServer())
      .post(`/api/contactos/${contactoId}/reactivar`)
      .set('Authorization', `Bearer ${token}`);
    expect(reaRes.status).toBe(200);
    expect(reaRes.body.activo).toBe(true);

    // 7) Reintentar contabilizar: debe pasar.
    const contabOkRes = await request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
    expect(contabOkRes.status).toBe(201);
    expect(contabOkRes.body.estado).toBe('CONTABILIZADO');
    expect(contabOkRes.body.numero).toMatch(/^I2604-\d{6}$/);
  });
});
