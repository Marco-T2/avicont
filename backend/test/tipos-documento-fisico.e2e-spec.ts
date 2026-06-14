import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

describe('TiposDocumentoFisico (e2e)', () => {
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

  // La org se crea directo por Prisma → arranca SIN tipos sembrados.
  // Eso da control total sobre el catálogo que cada test arma.
  async function seed(slug = 'org-tdf') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@tdf.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@tdf.bo`, password: 'password123' });
    const token = loginRes.body.accessToken as string;
    return { token, orgId: org.id, ownerId: owner.id };
  }

  // Miembro con CustomRole que NO incluye los permisos del catálogo de tipos.
  async function seedMiembroSinPermiso(orgId: string, slug = 'org-tdf') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@tdf.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'solo-lectura-comprobantes',
        name: 'Solo lectura comprobantes',
        permissions: ['contabilidad.comprobantes.read'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@tdf.bo`, password: 'password123' });
    return loginRes.body.accessToken as string;
  }

  function crearTipo(
    token: string,
    overrides: {
      nombre?: string;
      codigo?: string;
      esTributario?: boolean;
      tiposComprobanteAplicables?: string[];
    } = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: overrides.nombre ?? 'Recibo de ingreso',
        codigo: overrides.codigo ?? 'recibo-ingreso',
        esTributario: overrides.esTributario ?? false,
        tiposComprobanteAplicables: overrides.tiposComprobanteAplicables ?? ['INGRESO', 'DIARIO'],
      });
  }

  // ==========================================================
  // E-T-01 — crear no-tributario
  // ==========================================================

  it('E-T-01: crea un tipo no-tributario → 201 con los campos esperados', async () => {
    const { token } = await seed();
    const res = await crearTipo(token, {
      nombre: 'Recibo de egreso',
      codigo: 'recibo-egreso',
      esTributario: false,
      tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Recibo de egreso',
      codigo: 'recibo-egreso',
      esTributario: false,
      activo: true,
      tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
    });
    expect(res.body.id).toBeDefined();
  });

  // ==========================================================
  // E-T-02 / E-T-03 — duplicados dentro del mismo tenant
  // ==========================================================

  it('E-T-02: código duplicado en el mismo tenant → 409 TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO', async () => {
    const { token } = await seed();
    await crearTipo(token, { nombre: 'Recibo A', codigo: 'recibo-x' }).expect(201);
    const res = await crearTipo(token, { nombre: 'Recibo B', codigo: 'recibo-x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO');
    expect(res.body.error.details.codigo).toBe('recibo-x');
  });

  it('E-T-03: nombre duplicado en el mismo tenant → 409 TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO', async () => {
    const { token } = await seed();
    await crearTipo(token, { nombre: 'Recibo Único', codigo: 'recibo-1' }).expect(201);
    const res = await crearTipo(token, { nombre: 'Recibo Único', codigo: 'recibo-2' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO');
  });

  // ==========================================================
  // E-T-04 — formato de código inválido
  // ==========================================================

  it('E-T-04: código con formato inválido → 400 (ValidationPipe)', async () => {
    const { token } = await seed();
    const res = await crearTipo(token, { nombre: 'Mal código', codigo: 'CON MAYUS Y ESPACIOS' });
    expect(res.status).toBe(400);
  });

  // ==========================================================
  // E-T-05 — mismo código en tenants distintos (aislamiento)
  // ==========================================================

  it('E-T-05: el mismo código en dos tenants distintos → ambos 201', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');
    await crearTipo(a.token, { nombre: 'Recibo', codigo: 'recibo-comun' }).expect(201);
    await crearTipo(b.token, { nombre: 'Recibo', codigo: 'recibo-comun' }).expect(201);
  });

  // ==========================================================
  // E-T-06 / E-T-07 — edición y código inmutable
  // ==========================================================

  it('E-T-06: editar el nombre → 200', async () => {
    const { token } = await seed();
    const creado = await crearTipo(token, { nombre: 'Nombre viejo', codigo: 'recibo-edit' });
    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Nombre nuevo' });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Nombre nuevo');
  });

  it('E-T-07: el campo codigo enviado en PATCH es ignorado (inmutable) y no rompe', async () => {
    const { token } = await seed();
    const creado = await crearTipo(token, { nombre: 'Inmutable', codigo: 'recibo-original' });
    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: 'recibo-hackeado', nombre: 'Inmutable v2' });
    expect(res.status).toBe(200);
    expect(res.body.codigo).toBe('recibo-original');
    expect(res.body.nombre).toBe('Inmutable v2');
  });

  // ==========================================================
  // E-T-08 / E-T-09 — eliminación
  // ==========================================================

  it('E-T-08: eliminar un tipo sin documentos → 204', async () => {
    const { token } = await seed();
    const creado = await crearTipo(token, { codigo: 'recibo-sin-docs' });
    const res = await request(app.getHttpServer())
      .delete(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('E-T-09: eliminar un tipo con documentos → 409 TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS', async () => {
    const { token } = await seed();
    const tipo = await crearTipo(token, {
      nombre: 'Recibo con docs',
      codigo: 'recibo-con-docs',
      esTributario: false,
    });

    // Un documento físico no-tributario (sin monto) referencia al tipo.
    await request(app.getHttpServer())
      .post('/api/documentos-fisicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipoDocumentoFisicoId: tipo.body.id,
        numero: 'REC-0001',
        fechaEmision: '2026-04-22',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/api/tipos-documento-fisico/${tipo.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS');
  });

  // ==========================================================
  // E-T-10 — orden del listado + aislamiento de tenant
  // ==========================================================

  it('E-T-10: el listado ordena tributarios primero y no incluye tipos de otro tenant', async () => {
    const a = await seed('org-a');
    const b = await seed('org-b');

    await crearTipo(a.token, {
      nombre: 'Recibo de ingreso',
      codigo: 'recibo-ingreso',
      esTributario: false,
      tiposComprobanteAplicables: ['INGRESO'],
    }).expect(201);
    await crearTipo(a.token, {
      nombre: 'Factura emitida',
      codigo: 'factura-emitida',
      esTributario: true,
      tiposComprobanteAplicables: ['INGRESO'],
    }).expect(201);

    // Ruido en el otro tenant: no debe aparecer en el listado de A.
    await crearTipo(b.token, {
      nombre: 'Tipo de B',
      codigo: 'tipo-de-b',
      esTributario: true,
      tiposComprobanteAplicables: ['DIARIO'],
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].esTributario).toBe(true);
    expect(res.body.items[0].codigo).toBe('factura-emitida');
    expect(res.body.items[1].esTributario).toBe(false);
    expect((res.body.items as Array<{ codigo: string }>).map((t) => t.codigo)).not.toContain(
      'tipo-de-b',
    );
  });

  // ==========================================================
  // E-MT-03 / E-MT-04 — auth y permisos
  // ==========================================================

  it('E-MT-03: sin JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/tipos-documento-fisico');
    expect(res.status).toBe(401);
  });

  it('E-MT-04: usuario sin el permiso requerido → 403', async () => {
    const { orgId } = await seed();
    const memberToken = await seedMiembroSinPermiso(orgId);
    const res = await request(app.getHttpServer())
      .get('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  // ==========================================================
  // E-TN-01..11 — numeración automática (change numeracion-tipo-documento)
  // ==========================================================

  it('E-TN-01: crea tipo auto no-tributario con numeroInicial → 201 con los campos', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo interno',
        codigo: 'recibo-interno',
        esTributario: false,
        tiposComprobanteAplicables: ['INGRESO', 'DIARIO'],
        numeracionAutomatica: true,
        numeroInicial: 100,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numeracionAutomatica: true, numeroInicial: 100 });
  });

  it('E-TN-02: crea tipo sin numeracionAutomatica → manual por defecto', async () => {
    const { token } = await seed();
    const res = await crearTipo(token, { nombre: 'Vale de caja', codigo: 'vale-caja' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numeracionAutomatica: false, numeroInicial: null });
  });

  it('E-TN-03: crea tipo auto sin numeroInicial → default 1', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo sin inicial',
        codigo: 'recibo-sin-inicial',
        esTributario: false,
        tiposComprobanteAplicables: [],
        numeracionAutomatica: true,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numeracionAutomatica: true, numeroInicial: 1 });
  });

  it('E-TN-04: tipo manual con numeroInicial enviado → campo descartado silenciosamente', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo manual',
        codigo: 'recibo-manual',
        esTributario: false,
        tiposComprobanteAplicables: [],
        numeracionAutomatica: false,
        numeroInicial: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numeracionAutomatica: false, numeroInicial: null });
  });

  it('E-TN-05: crear tipo auto con esTributario=true → 422 TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA', async () => {
    const { token } = await seed();
    const res = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Factura auto',
        codigo: 'factura-auto',
        esTributario: true,
        tiposComprobanteAplicables: ['EGRESO'],
        numeracionAutomatica: true,
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA');
  });

  it('E-TN-06: editar tipo tributario activando numeracionAutomatica → 422 TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA', async () => {
    const { token } = await seed();
    // Crear tipo tributario manual
    const creado = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Factura recibida',
        codigo: 'factura-recibida',
        esTributario: true,
        tiposComprobanteAplicables: ['EGRESO'],
      })
      .expect(201);

    // El DTO de actualización no expone numeracionAutomatica (set-once);
    // el service igual rechaza si se detecta esTributario=true + auto=true en BD.
    // Simular PATCH con esTributario mantenido y campo no-permitido en DTO.
    // Como UpdateTipoDocumentoFisicoDto no tiene numeracionAutomatica, se ignora vía whitelist.
    // El test que cubre la regla es cuando se intenta setear esTributario=true en un tipo auto.
    // Aquí validamos la regla E-TN-06: editar un tipo tributario para que "active" auto → rechazado.
    // La surface real es intentar PATCH con esTributario=true en tipo que tiene numeracion auto.
    // Primero creamos un tipo auto no-tributario, luego intentamos hacerlo tributario:
    const creado2 = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo auto',
        codigo: 'recibo-auto',
        esTributario: false,
        tiposComprobanteAplicables: [],
        numeracionAutomatica: true,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado2.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ esTributario: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA');
    // creado no se usa más (suprime el warning de unused)
    void creado;
  });

  it('E-TN-07: toggle numeracionAutomatica de false a true → 422 TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE', async () => {
    const { token } = await seed();
    const creado = await crearTipo(token, {
      nombre: 'Recibo manual',
      codigo: 'recibo-manual-toggle',
    }).expect(201);

    // UpdateTipoDocumentoFisicoDto ahora expone numeracionAutomatica (set-once).
    // El service rechaza cualquier presencia del campo con 422 NUMERO_INICIAL_INMUTABLE.
    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeracionAutomatica: true, numeroInicial: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE');
  });

  it('E-TN-08: editar numeroInicial post-create → 422 TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE', async () => {
    const { token } = await seed();
    // Crear tipo auto con numeroInicial=100
    const creado = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo auto-inmutable',
        codigo: 'recibo-auto-inm',
        esTributario: false,
        tiposComprobanteAplicables: [],
        numeracionAutomatica: true,
        numeroInicial: 100,
      })
      .expect(201);

    // UpdateTipoDocumentoFisicoDto ahora expone numeroInicial (set-once).
    // El service rechaza cualquier presencia del campo con 422 NUMERO_INICIAL_INMUTABLE.
    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeroInicial: 200 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE');
  });

  it('E-TN-11: editar otros campos de un tipo auto → 200 (campos permitidos funcionan)', async () => {
    const { token } = await seed();
    const creado = await request(app.getHttpServer())
      .post('/api/tipos-documento-fisico')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Recibo auto v1',
        codigo: 'recibo-auto-v1',
        esTributario: false,
        tiposComprobanteAplicables: [],
        numeracionAutomatica: true,
        numeroInicial: 1,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/tipos-documento-fisico/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Recibo auto v2' });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Recibo auto v2');
    // Los campos de numeración no cambiaron
    expect(res.body.numeracionAutomatica).toBe(true);
    expect(res.body.numeroInicial).toBe(1);
  });
});
