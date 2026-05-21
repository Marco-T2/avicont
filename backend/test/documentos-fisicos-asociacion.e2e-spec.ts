import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { TIPOS_UNIVERSALES } from '../src/tipos-documento-fisico/seed/tipos-universales';
import {
  TIPO_DOCUMENTO_FISICO_SEEDER_PORT,
  TipoDocumentoFisicoSeederPort,
} from '../src/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';

import { cleanupTestData } from './helpers/test-factory';

describe('DocumentosFisicos asociación + contabilizar (e2e)', () => {
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
  // Fixtures — org directa por Prisma + setup manual
  // ==========================================================

  async function seed(slug = 'org-asoc') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@asoc.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@asoc.bo`, password: 'password123' });
    return { token: loginRes.body.accessToken as string, orgId: org.id };
  }

  async function prepararContabilidad(token: string, orgId: string) {
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 })
      .expect(201);
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

  function lineasBasicas(cajaId: string, ventasId: string) {
    return [
      {
        cuentaId: cajaId,
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

  async function crearComprobante(
    token: string,
    cajaId: string,
    ventasId: string,
    tipo = 'INGRESO',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo,
        fechaContable: '2026-04-22',
        glosa: `Comprobante ${tipo} para asociación`,
        lineas: lineasBasicas(cajaId, ventasId),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function crearTipo(
    token: string,
    overrides: {
      nombre?: string;
      codigo?: string;
      esTributario?: boolean;
      tiposComprobanteAplicables?: string[];
    } = {},
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: overrides.nombre ?? 'Recibo de ingreso',
        codigo: overrides.codigo ?? 'recibo-ingreso',
        esTributario: overrides.esTributario ?? false,
        tiposComprobanteAplicables: overrides.tiposComprobanteAplicables ?? ['INGRESO', 'DIARIO'],
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function crearDocumento(
    token: string,
    tipoId: string,
    opts: { numero: string; monto?: string; moneda?: string },
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/documentos-fisicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipoDocumentoFisicoId: tipoId,
        numero: opts.numero,
        fechaEmision: '2026-04-22',
        ...(opts.monto !== undefined ? { monto: opts.monto } : {}),
        ...(opts.moneda !== undefined ? { moneda: opts.moneda } : {}),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function asociar(token: string, comprobanteId: string, docIds: string[]) {
    return request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/documentos-fisicos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ documentoFisicoIds: docIds });
  }

  function desasociar(token: string, comprobanteId: string, docId: string) {
    return request(app.getHttpServer())
      .delete(`/api/comprobantes/${comprobanteId}/documentos-fisicos/${docId}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function contabilizar(token: string, comprobanteId: string) {
    return request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
  }

  function anular(token: string, comprobanteId: string) {
    return request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Anulación de prueba para liberar documento' });
  }

  // Org creada por el flujo real de creación de tenant (siembra 8 tipos).
  async function seedOrgContabilidad(slug = 'org-seed') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    await prisma.user.create({
      data: { email: `owner+${slug}@seed.bo`, hashedPassword, isEmailVerified: true },
    });
    const login1 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@seed.bo`, password: 'password123' });
    const tenantRes = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${login1.body.accessToken}`)
      .send({ name: `Org ${slug}`, modulo: 'CONTABILIDAD' });
    expect(tenantRes.status).toBe(201);
    // Re-login para que el JWT incluya activeTenantId de la nueva org.
    const login2 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@seed.bo`, password: 'password123' });
    return { token: login2.body.accessToken as string, orgId: tenantRes.body.id as string };
  }

  function getTipos(token: string) {
    return request(app.getHttpServer())
      .get('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`);
  }

  // ==========================================================
  // E-A-01 / E-A-02 — asociar a borradores
  // ==========================================================

  it('E-A-01: asociar un documento a un borrador → 201', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A01-1' });
    const compId = await crearComprobante(token, cajaId, ventasId);

    const res = await asociar(token, compId, [docId]);
    expect(res.status).toBe(201);
  });

  it('E-A-02: asociar el mismo documento a dos borradores → ambos 201', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A02-1' });
    const compA = await crearComprobante(token, cajaId, ventasId);
    const compB = await crearComprobante(token, cajaId, ventasId);

    await asociar(token, compA, [docId]).expect(201);
    await asociar(token, compB, [docId]).expect(201);
  });

  // ==========================================================
  // E-A-03 — UNIQUE PARCIAL: un solo contabilizado por documento
  // ==========================================================

  it('E-A-03: contabilizar dos comprobantes con el mismo documento → el segundo 409', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A03-1' });
    const compA = await crearComprobante(token, cajaId, ventasId);
    const compB = await crearComprobante(token, cajaId, ventasId);
    await asociar(token, compA, [docId]).expect(201);
    await asociar(token, compB, [docId]).expect(201);

    await contabilizar(token, compA).expect(201);

    const res = await contabilizar(token, compB);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO');
  });

  // ==========================================================
  // E-A-04 / E-A-05 — desasociar
  // ==========================================================

  it('E-A-04: desasociar un documento de un borrador → 204', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A04-1' });
    const compId = await crearComprobante(token, cajaId, ventasId);
    await asociar(token, compId, [docId]).expect(201);

    const res = await desasociar(token, compId, docId);
    expect(res.status).toBe(204);
  });

  it('E-A-05: desasociar un documento de un contabilizado → 409', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A05-1' });
    const compId = await crearComprobante(token, cajaId, ventasId);
    await asociar(token, compId, [docId]).expect(201);
    await contabilizar(token, compId).expect(201);

    const res = await desasociar(token, compId, docId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO');
  });

  // ==========================================================
  // E-A-06 — anular libera el documento
  // ==========================================================

  it('E-A-06: anular un comprobante contabilizado deja el documento suelto y re-asociable', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const docId = await crearDocumento(token, tipoId, { numero: 'A06-1' });
    const compA = await crearComprobante(token, cajaId, ventasId);
    await asociar(token, compA, [docId]).expect(201);
    await contabilizar(token, compA).expect(201);
    await anular(token, compA).expect(201);

    // El documento quedó suelto: GET /:id sin asociaciones.
    const detalle = await request(app.getHttpServer())
      .get(`/api/documentos-fisicos/${docId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.comprobantesAsociados).toHaveLength(0);

    // Y es re-asociable a un nuevo borrador.
    const compB = await crearComprobante(token, cajaId, ventasId);
    await asociar(token, compB, [docId]).expect(201);
  });

  // ==========================================================
  // E-A-07 / E-A-08 — tenant ajeno + múltiples docs
  // ==========================================================

  it('E-A-07: asociar un documento de otro tenant → 404', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    const contA = await prepararContabilidad(a.token, a.orgId);
    const tipoB = await crearTipo(b.token);
    const docB = await crearDocumento(b.token, tipoB, { numero: 'AJENO-1' });
    const compA = await crearComprobante(a.token, contA.cajaId, contA.ventasId);

    const res = await asociar(a.token, compA, [docB]);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE');
  });

  it('E-A-08: asociar múltiples documentos en una sola llamada → 201', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoId = await crearTipo(token);
    const doc1 = await crearDocumento(token, tipoId, { numero: 'MULTI-1' });
    const doc2 = await crearDocumento(token, tipoId, { numero: 'MULTI-2' });
    const compId = await crearComprobante(token, cajaId, ventasId);

    await asociar(token, compId, [doc1, doc2]).expect(201);

    const asociados = await request(app.getHttpServer())
      .get(`/api/comprobantes/${compId}/documentos-fisicos`)
      .set('Authorization', `Bearer ${token}`);
    expect(asociados.status).toBe(200);
    expect(asociados.body).toHaveLength(2);
  });

  // ==========================================================
  // E-A-09 / E-A-10 / E-A-11 — compatibilidad de tipo (D11)
  // ==========================================================

  it('E-A-09: asociar Recibo de Egreso a Comprobante INGRESO → 422 incompatible', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoEgreso = await crearTipo(token, {
      codigo: 'recibo-egreso',
      nombre: 'Recibo de egreso',
      esTributario: false,
      tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
    });
    const docId = await crearDocumento(token, tipoEgreso, { numero: 'INC-1' });
    const compIngreso = await crearComprobante(token, cajaId, ventasId, 'INGRESO');

    const res = await asociar(token, compIngreso, [docId]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE');
  });

  it('E-A-10: asociar Factura Emitida a Comprobante INGRESO → 201 (compatible)', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoFactura = await crearTipo(token, {
      codigo: 'factura-emitida',
      nombre: 'Factura emitida',
      esTributario: true,
      tiposComprobanteAplicables: ['INGRESO', 'DIARIO'],
    });
    const docId = await crearDocumento(token, tipoFactura, {
      numero: 'FC-A10',
      monto: '1500.00',
      moneda: 'BOB',
    });
    const compIngreso = await crearComprobante(token, cajaId, ventasId, 'INGRESO');

    await asociar(token, compIngreso, [docId]).expect(201);
  });

  it('E-A-11: asociar Comprobante Interno a Comprobante TRASPASO → 201 (lista con los 7 tipos)', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipoInterno = await crearTipo(token, {
      codigo: 'comprobante-interno',
      nombre: 'Comprobante interno',
      esTributario: false,
      tiposComprobanteAplicables: [
        'APERTURA',
        'DIARIO',
        'INGRESO',
        'EGRESO',
        'AJUSTE',
        'TRASPASO',
        'CIERRE',
      ],
    });
    const docId = await crearDocumento(token, tipoInterno, { numero: 'INT-1' });
    const compTraspaso = await crearComprobante(token, cajaId, ventasId, 'TRASPASO');

    await asociar(token, compTraspaso, [docId]).expect(201);
  });

  // ==========================================================
  // E-SEED-01 a E-SEED-04 — seed al crear tenant CONTABILIDAD
  // ==========================================================

  it('E-SEED-01: una org CONTABILIDAD nueva nace con exactamente los 8 tipos universales', async () => {
    const { token } = await seedOrgContabilidad();
    const res = await getTipos(token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8);
    const codigos = (res.body.items as Array<{ codigo: string }>).map((t) => t.codigo).sort();
    expect(codigos).toEqual(TIPOS_UNIVERSALES.map((t) => t.codigo).sort());
  });

  it('E-SEED-02: el seed es idempotente — re-ejecutarlo no duplica (sigue en 8)', async () => {
    const { token, orgId } = await seedOrgContabilidad();
    const seeder = app.get<TipoDocumentoFisicoSeederPort>(TIPO_DOCUMENTO_FISICO_SEEDER_PORT, {
      strict: false,
    });
    await seeder.seedDefaultsForTenant(orgId);

    const res = await getTipos(token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8);
  });

  it('E-SEED-03: los tipos sembrados son editables (PATCH activo: false)', async () => {
    const { token } = await seedOrgContabilidad();
    const lista = await getTipos(token);
    const [primero] = lista.body.items as Array<{ id: string }>;
    if (!primero) throw new Error('se esperaban tipos sembrados');
    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${primero.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
  });

  it('E-SEED-04: cada tipo sembrado tiene los tiposComprobanteAplicables de la matriz', async () => {
    const { token } = await seedOrgContabilidad();
    const res = await getTipos(token);
    const porCodigo = new Map(
      (res.body.items as Array<{ codigo: string; tiposComprobanteAplicables: string[] }>).map(
        (t) => [t.codigo, [...t.tiposComprobanteAplicables].sort()],
      ),
    );
    for (const esperado of TIPOS_UNIVERSALES) {
      expect(porCodigo.get(esperado.codigo)).toEqual([...esperado.tiposComprobanteAplicables].sort());
    }
  });

  // ==========================================================
  // E-T-11 / E-T-12 — tiposComprobanteAplicables explícito / vacío
  // ==========================================================

  it('E-T-11: crear tipo con tiposComprobanteAplicables ["EGRESO","DIARIO"] → 201 con el array', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo egreso explícito',
        codigo: 'tipo-egreso',
        esTributario: false,
        tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
      });
    expect(res.status).toBe(201);
    expect(res.body.tiposComprobanteAplicables).toEqual(['EGRESO', 'DIARIO']);
  });

  it('E-T-12: crear tipo con tiposComprobanteAplicables [] → 201 (array vacío válido)', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Tipo sin comprobantes',
        codigo: 'tipo-vacio',
        esTributario: false,
        tiposComprobanteAplicables: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.tiposComprobanteAplicables).toEqual([]);
  });
});
