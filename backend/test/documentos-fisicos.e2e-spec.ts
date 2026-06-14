import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

describe('DocumentosFisicos (e2e)', () => {
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
  // Fixtures
  // ==========================================================

  // Org creada directo por Prisma → arranca SIN tipos sembrados. El test arma
  // el catálogo que necesita vía API.
  async function seed(slug = 'org-df') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@df.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@df.bo`, password: 'password123' });
    return { token: loginRes.body.accessToken as string, orgId: org.id, ownerId: owner.id };
  }

  async function seedMiembroSinPermiso(orgId: string, slug = 'org-df') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@df.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'solo-comprobantes',
        name: 'Solo comprobantes',
        permissions: ['contabilidad.comprobantes.read'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@df.bo`, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  // Crea gestión 2026 + cuentas Caja/Ventas para poder armar comprobantes.
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

  async function crearComprobanteBorrador(
    token: string,
    cajaId: string,
    ventasId: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'INGRESO',
        fechaContable: '2026-04-22',
        glosa: 'Venta para asociar documento',
        lineas: lineasBasicas(cajaId, ventasId),
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

  function contabilizar(token: string, comprobanteId: string) {
    return request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
  }

  // Crea un tipo de documento físico vía API y devuelve su id.
  async function crearTipo(
    token: string,
    overrides: {
      nombre?: string;
      codigo?: string;
      esTributario?: boolean;
      tiposComprobanteAplicables?: string[];
    } = {},
  ): Promise<{ id: string; esTributario: boolean }> {
    const esTributario = overrides.esTributario ?? false;
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: overrides.nombre ?? 'Recibo de ingreso',
        codigo: overrides.codigo ?? 'recibo-ingreso',
        esTributario,
        tiposComprobanteAplicables: overrides.tiposComprobanteAplicables ?? ['INGRESO', 'DIARIO'],
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, esTributario };
  }

  function postDocumento(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/documentos-fisicos')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  // ==========================================================
  // E-D-01 / E-D-02 — creación básica + normalización
  // ==========================================================

  it('E-D-01: crea un documento no-tributario → 201 con el tipo embebido', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, { codigo: 'recibo-ingreso', esTributario: false });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'REC-0001',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      numero: 'REC-0001',
      fechaEmision: '2026-04-22',
      monto: null,
      moneda: null,
      tipoDocumentoFisico: { id: tipo.id, codigo: 'recibo-ingreso', esTributario: false },
      contacto: null,
    });
  });

  it('E-D-02: normaliza el número (trim + uppercase) → "A-001"', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: '  a-001  ',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(201);
    expect(res.body.numero).toBe('A-001');
  });

  // ==========================================================
  // E-D-03 / E-D-04 — unicidad de número por tipo
  // ==========================================================

  it('E-D-03: número duplicado en el mismo tipo y tenant → 409', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'DUP-1',
      fechaEmision: '2026-04-22',
    }).expect(201);
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'DUP-1',
      fechaEmision: '2026-04-23',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_NUMERO_DUPLICADO');
  });

  it('E-D-04: el mismo número con tipo distinto → 201', async () => {
    const { token } = await seed();
    const tipoA = await crearTipo(token, { codigo: 'recibo-a', nombre: 'Recibo A' });
    const tipoB = await crearTipo(token, { codigo: 'recibo-b', nombre: 'Recibo B' });
    await postDocumento(token, {
      tipoDocumentoFisicoId: tipoA.id,
      numero: 'MISMO-1',
      fechaEmision: '2026-04-22',
    }).expect(201);
    await postDocumento(token, {
      tipoDocumentoFisicoId: tipoB.id,
      numero: 'MISMO-1',
      fechaEmision: '2026-04-22',
    }).expect(201);
  });

  // ==========================================================
  // E-D-05 / E-D-06 — tipo inactivo / de otro tenant
  // ==========================================================

  it('E-D-05: tipo inactivo no permite crear → 422', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, { codigo: 'recibo-inactivo' });
    await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${tipo.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false })
      .expect(200);
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'INA-1',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_INACTIVO');
  });

  it('E-D-06: tipo de otro tenant → 404', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    const tipoB = await crearTipo(b.token, { codigo: 'recibo-b' });
    const res = await postDocumento(a.token, {
      tipoDocumentoFisicoId: tipoB.id,
      numero: 'X-1',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO');
  });

  // ==========================================================
  // E-D-07 — monto positivo (validación de DTO)
  // ==========================================================

  it('E-D-07: monto "0.00" → 400 (validación de DTO)', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, {
      codigo: 'factura-emitida',
      nombre: 'Factura emitida',
      esTributario: true,
    });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'FC-1',
      fechaEmision: '2026-04-22',
      monto: '0.00',
      moneda: 'BOB',
    });
    expect(res.status).toBe(400);
  });

  // ==========================================================
  // E-D-08 / E-D-09 / E-D-10 — contacto
  // ==========================================================

  async function crearContacto(token: string, razonSocial = 'Cliente X'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/contactos')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial, esCliente: true, esProveedor: false });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('E-D-08: documento con contacto válido → 201 con contacto embebido', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const contactoId = await crearContacto(token, 'Granjas El Sol');
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'CON-1',
      fechaEmision: '2026-04-22',
      contactoId,
    });
    expect(res.status).toBe(201);
    expect(res.body.contacto).toMatchObject({ id: contactoId, razonSocial: 'Granjas El Sol' });
  });

  it('E-D-09: contacto inactivo → 201 (permitido al crear)', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const contactoId = await crearContacto(token);
    await request(app.getHttpServer())
      .post(`/api/contactos/${contactoId}/desactivar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'CON-INA-1',
      fechaEmision: '2026-04-22',
      contactoId,
    });
    expect(res.status).toBe(201);
  });

  it('E-D-10: contacto de otro tenant → 404', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    const tipoA = await crearTipo(a.token);
    const contactoB = await crearContacto(b.token);
    const res = await postDocumento(a.token, {
      tipoDocumentoFisicoId: tipoA.id,
      numero: 'XT-1',
      fechaEmision: '2026-04-22',
      contactoId: contactoB,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONTACTO_NO_ENCONTRADO');
  });

  // ==========================================================
  // E-D-13 a E-D-16 — regla de monto condicional
  // ==========================================================

  it('E-D-13: tributario con monto + moneda → 201', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, {
      codigo: 'factura-emitida',
      nombre: 'Factura emitida',
      esTributario: true,
    });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'FC-13',
      fechaEmision: '2026-04-22',
      monto: '1150.55',
      moneda: 'BOB',
    });
    expect(res.status).toBe(201);
    expect(res.body.monto).toBe('1150.55');
    expect(res.body.moneda).toBe('BOB');
  });

  it('E-D-14: tributario sin monto → 422 DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, {
      codigo: 'factura-emitida',
      nombre: 'Factura emitida',
      esTributario: true,
    });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'FC-14',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO');
  });

  it('E-D-15: no-tributario sin monto → 201 (monto null)', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, { codigo: 'recibo-ingreso', esTributario: false });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'REC-15',
      fechaEmision: '2026-04-22',
    });
    expect(res.status).toBe(201);
    expect(res.body.monto).toBeNull();
  });

  it('E-D-16: no-tributario con monto → 422 DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, { codigo: 'recibo-ingreso', esTributario: false });
    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'REC-16',
      fechaEmision: '2026-04-22',
      monto: '100.00',
      moneda: 'BOB',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO');
  });

  // ==========================================================
  // E-D-11 / E-D-12 — listado con filtro + detalle
  // ==========================================================

  it('E-D-11: listar con filtro estadoAsociacion=SUELTO devuelve solo los no asociados', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });

    const sueltoRes = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'SUELTO-1',
      fechaEmision: '2026-04-22',
    });
    const asociadoRes = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'ASOC-1',
      fechaEmision: '2026-04-22',
    });
    const comprobanteId = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, comprobanteId, [asociadoRes.body.id as string]).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/documentos-fisicos?estadoAsociacion=SUELTO')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toContain(sueltoRes.body.id);
    expect(ids).not.toContain(asociadoRes.body.id);
  });

  it('E-D-12: GET /:id incluye comprobantesAsociados', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });
    const docRes = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'DET-1',
      fechaEmision: '2026-04-22',
    });
    const comprobanteId = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, comprobanteId, [docRes.body.id as string]).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/documentos-fisicos/${docRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.comprobantesAsociados).toHaveLength(1);
    expect(res.body.comprobantesAsociados[0]).toMatchObject({
      id: comprobanteId,
      numero: null,
      estado: 'BORRADOR',
    });
  });

  // ==========================================================
  // E-MT-01 a E-MT-04 — multi-tenant, auth y permisos
  // ==========================================================

  it('E-MT-01: el listado no retorna documentos de otro tenant', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    const tipoA = await crearTipo(a.token);
    await postDocumento(a.token, {
      tipoDocumentoFisicoId: tipoA.id,
      numero: 'SOLO-A',
      fechaEmision: '2026-04-22',
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/documentos-fisicos')
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('E-MT-02: acceso cross-tenant a un documento ajeno → 404', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    const tipoA = await crearTipo(a.token);
    const docA = await postDocumento(a.token, {
      tipoDocumentoFisicoId: tipoA.id,
      numero: 'AJENO-1',
      fechaEmision: '2026-04-22',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/documentos-fisicos/${docA.body.id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_NO_ENCONTRADO');
  });

  it('E-MT-03: sin JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/documentos-fisicos');
    expect(res.status).toBe(401);
  });

  it('E-MT-04: usuario sin el permiso requerido → 403', async () => {
    const { orgId } = await seed();
    const memberToken = await seedMiembroSinPermiso(orgId);
    const res = await request(app.getHttpServer())
      .get('/api/documentos-fisicos')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  // ==========================================================
  // E-E-01 a E-E-05 — edición y mutabilidad
  // ==========================================================

  it('E-E-01: editar un documento suelto → 200', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'EDIT-1',
      fechaEmision: '2026-04-22',
    });
    const res = await request(app.getHttpServer())
      .patch(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'Glosa editada' });
    expect(res.status).toBe(200);
    expect(res.body.glosa).toBe('Glosa editada');
  });

  it('E-E-02: editar un documento asociado solo a un borrador → 200', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'EDIT-BORR-1',
      fechaEmision: '2026-04-22',
    });
    const comprobanteId = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, comprobanteId, [doc.body.id as string]).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'Editado en borrador' });
    expect(res.status).toBe(200);
  });

  it('E-E-03: editar un documento asociado a un contabilizado → 409', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'EDIT-CONT-1',
      fechaEmision: '2026-04-22',
    });
    const comprobanteId = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, comprobanteId, [doc.body.id as string]).expect(201);
    await contabilizar(token, comprobanteId).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'No debería poder' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO');
  });

  it('E-E-04: documento en un borrador + un contabilizado → editar 409', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'EDIT-MIX-1',
      fechaEmision: '2026-04-22',
    });
    const compA = await crearComprobanteBorrador(token, cajaId, ventasId);
    const compB = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, compA, [doc.body.id as string]).expect(201);
    await asociar(token, compB, [doc.body.id as string]).expect(201);
    await contabilizar(token, compA).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'Sigue inmutable por el contabilizado' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO');
  });

  it('E-E-05: la normalización del número también aplica en PATCH (uppercase)', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'EDIT-NORM-1',
      fechaEmision: '2026-04-22',
    });
    const res = await request(app.getHttpServer())
      .patch(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numero: '  b-002  ' });
    expect(res.status).toBe(200);
    expect(res.body.numero).toBe('B-002');
  });

  // ==========================================================
  // E-EL-01 / E-EL-03 — eliminación
  // ==========================================================

  it('E-EL-01: eliminar un documento nunca asociado → 204', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token);
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'DEL-1',
      fechaEmision: '2026-04-22',
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('E-EL-03: eliminar un documento con borrador activo → 409', async () => {
    const { token, orgId } = await seed();
    const { cajaId, ventasId } = await prepararContabilidad(token, orgId);
    const tipo = await crearTipo(token, { tiposComprobanteAplicables: ['INGRESO', 'DIARIO'] });
    const doc = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'DEL-REF-1',
      fechaEmision: '2026-04-22',
    });
    const comprobanteId = await crearComprobanteBorrador(token, cajaId, ventasId);
    await asociar(token, comprobanteId, [doc.body.id as string]).expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/api/documentos-fisicos/${doc.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE');
  });

  // ==========================================================
  // E-D-AUTO-01..05 — numeración automática (change numeracion-tipo-documento)
  // ==========================================================

  // Helper para crear un tipo con numeracion automática vía API.
  async function crearTipoAuto(
    token: string,
    overrides: { nombre?: string; codigo?: string; numeroInicial?: number } = {},
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: overrides.nombre ?? 'Recibo auto',
        codigo: overrides.codigo ?? 'recibo-auto',
        esTributario: false,
        tiposComprobanteAplicables: ['INGRESO', 'DIARIO'],
        numeracionAutomatica: true,
        numeroInicial: overrides.numeroInicial ?? 1,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('E-D-AUTO-01: crear documento de tipo auto sin numero → sistema asigna numero desde numeroInicial', async () => {
    const { token } = await seed('org-auto-01');
    const tipoId = await crearTipoAuto(token, { codigo: 'recibo-auto-01', numeroInicial: 100 });

    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipoId,
      fechaEmision: '2026-06-14',
    });
    expect(res.status).toBe(201);
    expect(res.body.numero).toBe('100');
    // El tipo embebido expone numeracionAutomatica
    expect(res.body.tipoDocumentoFisico.numeracionAutomatica).toBe(true);
  });

  it('E-D-AUTO-02: segundo documento del tipo auto → número consecutivo', async () => {
    const { token } = await seed('org-auto-02');
    const tipoId = await crearTipoAuto(token, { codigo: 'recibo-auto-02', numeroInicial: 100 });

    // Primero: número 100
    const res1 = await postDocumento(token, {
      tipoDocumentoFisicoId: tipoId,
      fechaEmision: '2026-06-14',
    });
    expect(res1.status).toBe(201);
    expect(res1.body.numero).toBe('100');

    // Segundo: número 101
    const res2 = await postDocumento(token, {
      tipoDocumentoFisicoId: tipoId,
      fechaEmision: '2026-06-14',
    });
    expect(res2.status).toBe(201);
    expect(res2.body.numero).toBe('101');
  });

  it('E-D-AUTO-03: enviar numero en tipo auto → 422 DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO', async () => {
    const { token } = await seed('org-auto-03');
    const tipoId = await crearTipoAuto(token, { codigo: 'recibo-auto-03' });

    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipoId,
      numero: 'MI-NUM',
      fechaEmision: '2026-06-14',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO');
  });

  it('E-D-AUTO-04: tipo manual → comportamiento actual intacto (con numero → 201)', async () => {
    const { token } = await seed('org-auto-04');
    const tipo = await crearTipo(token, {
      nombre: 'Factura recibida',
      codigo: 'factura-auto04',
      esTributario: true,
    });

    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      numero: 'FC-0001',
      fechaEmision: '2026-06-14',
      monto: '1150.00',
      moneda: 'BOB',
    });
    expect(res.status).toBe(201);
    expect(res.body.numero).toBe('FC-0001');
    // El tipo embebido también expone numeracionAutomatica=false
    expect(res.body.tipoDocumentoFisico.numeracionAutomatica).toBe(false);
  });

  it('E-D-AUTO-05: tipo manual sin numero → 400 (campo requerido por DTO)', async () => {
    const { token } = await seed('org-auto-05');
    const tipo = await crearTipo(token, {
      nombre: 'Recibo manual sin num',
      codigo: 'recibo-sin-num',
      esTributario: false,
    });

    const res = await postDocumento(token, {
      tipoDocumentoFisicoId: tipo.id,
      fechaEmision: '2026-06-14',
    });
    // La rama manual exige numero; como el DTO lo tiene @IsOptional, el service lo chequea
    // y lanza DocumentoFisicoNumeroRequeridoError (422)
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENTO_FISICO_NUMERO_REQUERIDO');
  });

  it('E-D-AUTO: aislamiento multi-tenant — secuencias independientes por tenant', async () => {
    const a = await seed('org-auto-mt-a');
    const b = await seed('org-auto-mt-b');

    // Ambos tenants crean el mismo tipo (mismo codigo, tenants distintos)
    const tipoIdA = await crearTipoAuto(a.token, {
      codigo: 'recibo-comun-auto',
      numeroInicial: 1,
    });
    const tipoIdB = await crearTipoAuto(b.token, {
      codigo: 'recibo-comun-auto',
      numeroInicial: 1,
    });

    // Tenant A crea 3 documentos
    await postDocumento(a.token, { tipoDocumentoFisicoId: tipoIdA, fechaEmision: '2026-06-14' }).expect(201);
    await postDocumento(a.token, { tipoDocumentoFisicoId: tipoIdA, fechaEmision: '2026-06-14' }).expect(201);
    const resA3 = await postDocumento(a.token, { tipoDocumentoFisicoId: tipoIdA, fechaEmision: '2026-06-14' });
    expect(resA3.status).toBe(201);
    expect(resA3.body.numero).toBe('3');

    // Tenant B crea 2 documentos — contador independiente
    await postDocumento(b.token, { tipoDocumentoFisicoId: tipoIdB, fechaEmision: '2026-06-14' }).expect(201);
    const resB2 = await postDocumento(b.token, { tipoDocumentoFisicoId: tipoIdB, fechaEmision: '2026-06-14' });
    expect(resB2.status).toBe(201);
    expect(resB2.body.numero).toBe('2'); // contador B independiente de A
  });
});
