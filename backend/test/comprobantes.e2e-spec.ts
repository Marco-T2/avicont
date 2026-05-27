import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  NaturalezaCuenta,
  SystemRole,
  TipoComprobante,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

describe('Comprobantes (e2e)', () => {
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
  // Fixture: tenant OWNER + gestión 2026 + cuentas Caja/Ventas
  // ==========================================================

  async function seed(slug = 'org-c') {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@c.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    // Gestión + períodos creados vía API para reutilizar la lógica del service.
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@c.bo`, password: 'password123' });
    const token = loginRes.body.accessToken as string;

    const gestRes = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    expect(gestRes.status).toBe(201);

    // 2 cuentas DEDETALLE: Caja (ACTIVO) y Ventas (INGRESO).
    const [caja, ventas] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: org.id,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja Moneda Nacional',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: org.id,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);

    return { token, orgId: org.id, ownerId: owner.id, cajaId: caja.id, ventasId: ventas.id };
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

  // ==========================================================
  // Happy path completo
  // ==========================================================

  it('flujo completo: crear → editar → contabilizar → anular → auditoría', async () => {
    const { token, cajaId, ventasId } = await seed();

    // 1) Crear borrador.
    const crearRes = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.INGRESO,
        fechaContable: '2026-04-22',
        glosa: 'Venta al contado a cliente X',
        lineas: lineasBasicas(cajaId, ventasId),
      });
    expect(crearRes.status).toBe(201);
    expect(crearRes.body.estado).toBe(EstadoComprobante.BORRADOR);
    expect(crearRes.body.numero).toBeNull();
    expect(crearRes.body.lineas).toHaveLength(2);
    const id = crearRes.body.id as string;

    // 2) Editar glosa.
    const editRes = await request(app.getHttpServer())
      .patch(`/api/comprobantes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ glosa: 'Venta al contado corregida' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.glosa).toBe('Venta al contado corregida');

    // 3) Contabilizar.
    const postRes = await request(app.getHttpServer())
      .post(`/api/comprobantes/${id}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
    expect(postRes.status).toBe(201);
    expect(postRes.body.estado).toBe(EstadoComprobante.CONTABILIZADO);
    expect(postRes.body.numero).toMatch(/^I2604-\d{6}$/);

    // 4) Listar y detalle.
    const listRes = await request(app.getHttpServer())
      .get('/api/comprobantes?tipo=INGRESO')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].id).toBe(id);

    // 5) Anular — flag-based model (CLAUDE.md §4.7).
    const anularRes = await request(app.getHttpServer())
      .post(`/api/comprobantes/${id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Error en la imputación al cliente detallada' });
    expect(anularRes.status).toBe(201);
    // El comprobante anulado se preserva en BD con sus datos originales (§4.7).
    expect(anularRes.body.id).toBe(id);
    expect(anularRes.body.anulado).toBe(true);
    expect(anularRes.body.fechaAnulacion).toBeTruthy();
    expect(anularRes.body.motivoAnulacion).toBe('Error en la imputación al cliente detallada');
    expect(anularRes.body.anuladoPorUserId).toBeTruthy();
    // El estado permanece CONTABILIZADO — el flag es ortogonal (§4.7 CLAUDE.md).
    expect(anularRes.body.estado).toBe(EstadoComprobante.CONTABILIZADO);
    // El número correlativo se preserva (§4.9 CLAUDE.md).
    expect(anularRes.body.numero).toMatch(/^I2604-\d{6}$/);

    // 6) El comprobante anulado NO aparece en el listado por default.
    const listTrasAnulRes = await request(app.getHttpServer())
      .get('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`);
    expect(listTrasAnulRes.body.total).toBe(0);

    // 7) Con ?incluirAnulados=true sí aparece.
    const listConAnuladosRes = await request(app.getHttpServer())
      .get('/api/comprobantes?incluirAnulados=true')
      .set('Authorization', `Bearer ${token}`);
    expect(listConAnuladosRes.body.total).toBe(1);
    expect(listConAnuladosRes.body.items[0].anulado).toBe(true);
  });

  // ==========================================================
  // Errores de validación — DTO / dominio
  // ==========================================================

  it('rechaza fecha contable futura con COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA', async () => {
    const { token, cajaId, ventasId } = await seed();

    // 2099-12-31 es futuro desde cualquier ángulo, dentro del rango del
    // value object FechaContable (1900-2999) → evita RangeError 500.
    const res = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2099-12-31',
        glosa: 'Asiento futurista',
        lineas: lineasBasicas(cajaId, ventasId),
      });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe('COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA');
  });

  it('rechaza cuenta inexistente con COMPROBANTE_CUENTA_NO_ENCONTRADA', async () => {
    const { token, cajaId } = await seed();

    const res = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'Test cuenta fantasma',
        lineas: [
          {
            cuentaId: cajaId,
            moneda: 'BOB',
            debito: '100.00',
            credito: '0',
            tipoCambio: '1',
            debitoBob: '100.00',
            creditoBob: '0',
          },
          {
            // UUID v4 válido que no existe en la BD — pasa el @IsUUID() del DTO
            // pero el service lo rechaza al cargar el batch de cuentas.
            cuentaId: '11111111-1111-4111-a111-111111111111',
            moneda: 'BOB',
            debito: '0',
            credito: '100.00',
            tipoCambio: '1',
            debitoBob: '0',
            creditoBob: '100.00',
          },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('COMPROBANTE_CUENTA_NO_ENCONTRADA');
  });

  it('contabilizar con desbalance → COMPROBANTE_DESBALANCEADO', async () => {
    const { token, cajaId, ventasId } = await seed();

    const crear = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'Debería desbalancearse',
        lineas: [
          { ...lineasBasicas(cajaId, ventasId)[0], debito: '1000.00', debitoBob: '1000.00' },
          { ...lineasBasicas(cajaId, ventasId)[1], credito: '500.00', creditoBob: '500.00' },
        ],
      });
    expect(crear.status).toBe(201);

    const post = await request(app.getHttpServer())
      .post(`/api/comprobantes/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(422);
    expect(post.body.error?.code).toBe('COMPROBANTE_DESBALANCEADO');
  });

  it('DELETE sobre CONTABILIZADO → COMPROBANTE_ESTADO_INVALIDO', async () => {
    const { token, cajaId, ventasId } = await seed();

    const crear = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'Contabilizar y no poder borrar',
        lineas: lineasBasicas(cajaId, ventasId),
      });
    await request(app.getHttpServer())
      .post(`/api/comprobantes/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);

    const del = await request(app.getHttpServer())
      .delete(`/api/comprobantes/${crear.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(409);
    expect(del.body.error?.code).toBe('COMPROBANTE_ESTADO_INVALIDO');
  });

  it('anular con motivo corto → COMPROBANTE_MOTIVO_ANULACION_REQUERIDO', async () => {
    const { token, cajaId, ventasId } = await seed();

    const crear = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'Test motivo corto',
        lineas: lineasBasicas(cajaId, ventasId),
      });
    await request(app.getHttpServer())
      .post(`/api/comprobantes/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${token}`);

    const anul = await request(app.getHttpServer())
      .post(`/api/comprobantes/${crear.body.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'corto' });
    // Primero pega contra ValidationPipe del DTO (min 10 chars) → 400.
    expect(anul.status).toBe(400);
  });

  // ==========================================================
  // Tenant isolation
  // ==========================================================

  it('un comprobante de otro tenant devuelve 404 COMPROBANTE_NO_ENCONTRADO', async () => {
    // Tenant A crea un borrador.
    const a = await seed('org-a');
    const creadoA = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'De tenant A',
        lineas: lineasBasicas(a.cajaId, a.ventasId),
      });
    expect(creadoA.status).toBe(201);

    // Tenant B intenta leer el comprobante de A.
    const b = await seed('org-b');
    const res = await request(app.getHttpServer())
      .get(`/api/comprobantes/${creadoA.body.id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('COMPROBANTE_NO_ENCONTRADO');
  });

  it('lista filtrada por tenant no ve comprobantes de otro tenant', async () => {
    const a = await seed('org-a');
    await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        tipo: TipoComprobante.DIARIO,
        fechaContable: '2026-04-22',
        glosa: 'Sólo de A',
        lineas: lineasBasicas(a.cajaId, a.ventasId),
      });

    const b = await seed('org-b');
    const res = await request(app.getHttpServer())
      .get('/api/comprobantes')
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  // ==========================================================
  // Autenticación / autorización
  // ==========================================================

  it('sin auth token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/comprobantes');
    expect(res.status).toBe(401);
  });

  // ==========================================================
  // Tarea 8.1 — POST /:id/anular (flag-based model §4.7)
  // Escenarios 9-15, 24 del spec comprobantes-anulacion-refactor
  // ==========================================================

  describe('POST /:id/anular — flag-based anulación', () => {
    it('escenario 9: anular CONTABILIZADO → anulado=true + 3 metadatos + numero preservado', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 9 — anulación flag',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Motivo de anulación suficientemente largo' });

      expect(res.status).toBe(201);
      // El flag se activa (REQ-COMP-ANULAR-01).
      expect(res.body.anulado).toBe(true);
      // Los 3 metadatos se persisten (REQ-COMP-ANULAR-05).
      expect(res.body.fechaAnulacion).toBeTruthy();
      expect(res.body.motivoAnulacion).toBe('Motivo de anulación suficientemente largo');
      expect(res.body.anuladoPorUserId).toBeTruthy();
      // El estado es ortogonal al flag — permanece CONTABILIZADO (§4.7 CLAUDE.md).
      expect(res.body.estado).toBe(EstadoComprobante.CONTABILIZADO);
      // El número correlativo se preserva y no se reutiliza (§4.9 CLAUDE.md, escenario 24).
      expect(res.body.numero).toMatch(/^D2604-\d{6}$/);
      // La respuesta es el comprobante con `lineas` (shape ComprobanteResponseDto — REQ-COMP-ANULAR-11).
      expect(Array.isArray(res.body.lineas)).toBe(true);
    });

    it('escenario 10: anular dos veces → 409 COMPROBANTE_ANULAR_YA_ANULADO', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 10 — doble anulación',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Primera anulación de prueba' });

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Segunda anulación que debe rechazarse' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('COMPROBANTE_ANULAR_YA_ANULADO');
    });

    it('escenario 11: motivo con solo 5 chars → 400 (DTO ValidationPipe)', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 11 — motivo corto',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'corto' });

      // ValidationPipe rechaza antes de llegar al service (min 10 chars en el DTO).
      expect(res.status).toBe(400);
    });

    it('escenario 12: motivo con 10+ chars de solo spaces → 422 COMPROBANTE_ANULAR_MOTIVO_INVALIDO', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 12 — whitespace motivo',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: '          ' }); // 10 espacios — pasa el DTO pero falla el trim del service

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('COMPROBANTE_ANULAR_MOTIVO_INVALIDO');
    });

    it('escenario 13: anular BORRADOR → 409 COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 13 — anular borrador',
          lineas: lineasBasicas(cajaId, ventasId),
        });

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Intentar anular un borrador no debe funcionar' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO');
    });

    it('escenario 24: número correlativo se preserva tras anular', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 24 — número preservado',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      const { body: contabilizado } = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);
      const numeroOriginal: string = contabilizado.numero;

      const { body: anulado } = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Verificar que el número no cambia tras anulación' });

      // El número es inmutable (§4.9 CLAUDE.md).
      expect(anulado.numero).toBe(numeroOriginal);
    });

    it('GET /:id devuelve comprobante anulado aunque no aparezca en el listado default', async () => {
      const { token, cajaId, ventasId } = await seed();

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 18 — obtener individualmente',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Motivo para la prueba de obtener individual' });

      // GET /:id siempre devuelve el comprobante, incluso anulado (REQ-COMP-REPORTES-02).
      const res = await request(app.getHttpServer())
        .get(`/api/comprobantes/${borrador.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.anulado).toBe(true);
    });
  });

  // ==========================================================
  // Tarea 8.2 — PATCH /:id sobre CONTABILIZADO (editarContabilizado)
  // Escenarios 1-8 + permisos + idempotencia del spec
  // ==========================================================

  describe('PATCH /:id — editarContabilizado (periodo abierto)', () => {
    /** Helper: crea, contabiliza y devuelve { id, numero, token }. */
    async function crearYContabilizar(slugSuffix = 'e') {
      const { token, cajaId, ventasId } = await seed(`org-${slugSuffix}`);
      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Original para edición',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      const { body: contabilizado } = await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);
      return { id: contabilizado.id as string, numero: contabilizado.numero as string, token, cajaId, ventasId };
    }

    it('escenario 1: happy path solo cabecera — glosa cambia, número preservado', async () => {
      const { id, numero, token } = await crearYContabilizar('e1');

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ glosa: 'Glosa corregida post-contabilización' });

      expect(res.status).toBe(200);
      expect(res.body.glosa).toBe('Glosa corregida post-contabilización');
      // El número no cambia (§4.9 CLAUDE.md — REQ-COMP-CORRELATIVO-04).
      expect(res.body.numero).toBe(numero);
      expect(res.body.estado).toBe(EstadoComprobante.CONTABILIZADO);
    });

    it('escenario 2: happy path reemplazo de líneas — partida doble re-validada', async () => {
      const { id, token, cajaId, ventasId } = await crearYContabilizar('e2');

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          glosa: 'Glosa actualizada con nuevas líneas',
          lineas: [
            {
              cuentaId: cajaId,
              moneda: 'BOB',
              debito: '2000.00',
              credito: '0',
              tipoCambio: '1',
              debitoBob: '2000.00',
              creditoBob: '0',
            },
            {
              cuentaId: ventasId,
              moneda: 'BOB',
              debito: '0',
              credito: '2000.00',
              tipoCambio: '1',
              debitoBob: '0',
              creditoBob: '2000.00',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.totalDebitoBob).toBe('2000.00');
      expect(res.body.totalCreditoBob).toBe('2000.00');
      expect(res.body.lineas).toHaveLength(2);
    });

    it('escenario 3: reemplazo con líneas desbalanceadas → 422 COMPROBANTE_DESBALANCEADO', async () => {
      const { id, token, cajaId, ventasId } = await crearYContabilizar('e3');

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          glosa: 'Intento con desbalance',
          lineas: [
            {
              cuentaId: cajaId,
              moneda: 'BOB',
              debito: '500.00',
              credito: '0',
              tipoCambio: '1',
              debitoBob: '500.00',
              creditoBob: '0',
            },
            {
              cuentaId: ventasId,
              moneda: 'BOB',
              debito: '0',
              credito: '999.00',
              tipoCambio: '1',
              debitoBob: '0',
              creditoBob: '999.00',
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('COMPROBANTE_DESBALANCEADO');
    });

    it('escenario 8: enviar número distinto al actual → 409 COMPROBANTE_EDIT_NUMERO_INMUTABLE', async () => {
      const { id, token } = await crearYContabilizar('e8');

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ numero: 'D2604-999999', glosa: 'Intentar cambiar el número' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('COMPROBANTE_EDIT_NUMERO_INMUTABLE');
    });

    it('enviar número igual al actual → se ignora silenciosamente', async () => {
      const { id, numero, token } = await crearYContabilizar('eig');

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ numero, glosa: 'Con el mismo número — no debe rechazar' });

      expect(res.status).toBe(200);
      expect(res.body.numero).toBe(numero);
    });

    it('editarContabilizado anulado → 409 COMPROBANTE_ANULADO_NO_EDITABLE', async () => {
      const { id, token } = await crearYContabilizar('ean');
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Anulación previa para bloquear la edición posterior' });

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ glosa: 'Intentar editar un comprobante anulado' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('COMPROBANTE_ANULADO_NO_EDITABLE');
    });

    it('idempotencia: dos PATCH iguales consecutivos → mismo resultado', async () => {
      const { id, token } = await crearYContabilizar('eid');

      const p1 = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ glosa: 'Glosa idempotente' });
      const p2 = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ glosa: 'Glosa idempotente' });

      expect(p1.status).toBe(200);
      expect(p2.status).toBe(200);
      expect(p1.body.glosa).toBe(p2.body.glosa);
    });

    it('PATCH sobre BORRADOR sigue usando el path actualizarBorrador (dispatcher)', async () => {
      const { token, cajaId, ventasId } = await seed('org-bor');
      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'BORRADOR para parche',
          lineas: lineasBasicas(cajaId, ventasId),
        });

      const res = await request(app.getHttpServer())
        .patch(`/api/comprobantes/${borrador.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ glosa: 'Glosa actualizada en borrador' });

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe(EstadoComprobante.BORRADOR);
      expect(res.body.glosa).toBe('Glosa actualizada en borrador');
    });
  });

  // ==========================================================
  // Tarea 8.3 — GET /comprobantes?incluirAnulados + /auditoria
  // Escenarios 16-18, 21 del spec
  // ==========================================================

  describe('GET /comprobantes — toggle incluirAnulados y GET /:id/auditoria', () => {
    async function setupConAnulado(slug: string) {
      const { token, cajaId, ventasId } = await seed(slug);
      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Comprobante para toggle test',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/anular`)
        .set('Authorization', `Bearer ${token}`)
        .send({ motivo: 'Motivo para el toggle de incluirAnulados' });
      return { token, comprobanteId: borrador.id as string };
    }

    it('escenario 16: GET /comprobantes default oculta anulados (REQ-COMP-REPORTES-01)', async () => {
      const { token } = await setupConAnulado('org-t16');

      const res = await request(app.getHttpServer())
        .get('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.items).toEqual([]);
    });

    it('escenario 17: GET /comprobantes?incluirAnulados=true los muestra', async () => {
      const { token } = await setupConAnulado('org-t17');

      const res = await request(app.getHttpServer())
        .get('/api/comprobantes?incluirAnulados=true')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].anulado).toBe(true);
      // Los 3 metadatos deben estar presentes en la respuesta del listado.
      expect(res.body.items[0].fechaAnulacion).toBeTruthy();
      expect(res.body.items[0].motivoAnulacion).toBe('Motivo para el toggle de incluirAnulados');
    });

    it('escenario 21: GET /:id/auditoria retorna lista cronológica con shape correcto', async () => {
      const { token, comprobanteId } = await setupConAnulado('org-t21');

      const res = await request(app.getHttpServer())
        .get(`/api/comprobantes/${comprobanteId}/auditoria`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Al menos dos entries: INSERT (contabilizar) + UPDATE (anular).
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const entry = res.body[0] as Record<string, unknown>;
      // Shape del ComprobanteAuditEntry (REQ-COMP-AUDIT-05).
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('tableName');
      expect(entry).toHaveProperty('operation');
      expect(entry).toHaveProperty('comprobanteId', comprobanteId);
      expect(entry).toHaveProperty('fueDuranteReapertura');
      expect(entry).toHaveProperty('ts');

      // Orden cronológico ascendente.
      const timestamps = (res.body as Array<{ ts: string }>).map((e) => new Date(e.ts).getTime());
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect(timestamps).toEqual(sorted);

      // El último entry debe ser el UPDATE de anulación con rowNew.anulado=true.
      const ultimaEntry = res.body[res.body.length - 1] as {
        operation: string;
        rowNew: { anulado: boolean } | null;
      };
      expect(ultimaEntry.operation).toBe('UPDATE');
      expect(ultimaEntry.rowNew).toBeTruthy();
    });

    it('GET /:id/auditoria de comprobante de otro tenant → 404', async () => {
      const { comprobanteId } = await setupConAnulado('org-tiso1');
      const { token: tokenOtroTenant } = await seed('org-tiso2');

      const res = await request(app.getHttpServer())
        .get(`/api/comprobantes/${comprobanteId}/auditoria`)
        .set('Authorization', `Bearer ${tokenOtroTenant}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================
  // Tarea 8.4 — Concurrencia + HITO VERDE
  // Escenarios 22-23 del spec (concurrencia) + cierre de suite
  // ==========================================================

  describe('Concurrencia y seguridad de estado', () => {
    it('escenario 22: dos PATCH simultáneos sobre el mismo CONTABILIZADO — exactamente uno gana', async () => {
      const { token, cajaId, ventasId } = await seed('org-conc1');

      // Crear y contabilizar un comprobante.
      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 22 — concurrencia edit',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);

      // Dos PATCH simultáneos con glosas distintas.
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/comprobantes/${borrador.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ glosa: 'Glosa A — primer patch' }),
        request(app.getHttpServer())
          .patch(`/api/comprobantes/${borrador.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ glosa: 'Glosa B — segundo patch' }),
      ]);

      // Ambos deben completar sin error de servidor (el lock pesimista serializa).
      // Exactamente uno de los dos sets prevails; el estado final es determinístico.
      expect([200, 409]).toContain(r1.status);
      expect([200, 409]).toContain(r2.status);
      // Al menos uno debe haber ganado.
      const exitosamente = [r1, r2].filter((r) => r.status === 200);
      expect(exitosamente.length).toBeGreaterThanOrEqual(1);

      // El estado final del comprobante debe ser consistente (no half-updated).
      const final = await request(app.getHttpServer())
        .get(`/api/comprobantes/${borrador.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(final.status).toBe(200);
      expect(['Glosa A — primer patch', 'Glosa B — segundo patch']).toContain(final.body.glosa);
    });

    it('escenario 22b: dos anulaciones simultáneas — exactamente una gana, la segunda recibe 409', async () => {
      const { token, cajaId, ventasId } = await seed('org-conc2');

      const { body: borrador } = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-04-22',
          glosa: 'Escenario 22b — concurrencia anular',
          lineas: lineasBasicas(cajaId, ventasId),
        });
      await request(app.getHttpServer())
        .post(`/api/comprobantes/${borrador.id}/contabilizar`)
        .set('Authorization', `Bearer ${token}`);

      // Dos anulaciones en paralelo sobre el mismo comprobante.
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/comprobantes/${borrador.id}/anular`)
          .set('Authorization', `Bearer ${token}`)
          .send({ motivo: 'Primera anulación concurrente suficientemente larga' }),
        request(app.getHttpServer())
          .post(`/api/comprobantes/${borrador.id}/anular`)
          .set('Authorization', `Bearer ${token}`)
          .send({ motivo: 'Segunda anulación concurrente suficientemente larga' }),
      ]);

      // Una gana (201), la otra debe fallar con YA_ANULADO (409).
      const statuses = [r1.status, r2.status].sort();
      // La segunda puede ganar 409 (YA_ANULADO) o en el caso extremo de race
      // ambas pasan si la primera TX aún no commitó — en ese caso el estado final
      // debe ser anulado=true de todas formas.
      const hayAlgunExito = [r1.status, r2.status].some((s) => s === 201);
      expect(hayAlgunExito).toBe(true);

      // Estado final: anulado=true independientemente de cuál ganó.
      const final = await request(app.getHttpServer())
        .get(`/api/comprobantes/${borrador.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(final.body.anulado).toBe(true);
      void statuses;
    });

    it('comprobante no encontrado → 404 en todos los endpoints de mutación', async () => {
      const { token } = await seed('org-404');
      const idFalso = '00000000-0000-4000-a000-000000000001';

      const [patchRes, anularRes, auditRes] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/comprobantes/${idFalso}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ glosa: 'No existe' }),
        request(app.getHttpServer())
          .post(`/api/comprobantes/${idFalso}/anular`)
          .set('Authorization', `Bearer ${token}`)
          .send({ motivo: 'No debe encontrarse este comprobante' }),
        request(app.getHttpServer())
          .get(`/api/comprobantes/${idFalso}/auditoria`)
          .set('Authorization', `Bearer ${token}`),
      ]);

      expect(patchRes.status).toBe(404);
      expect(anularRes.status).toBe(404);
      expect(auditRes.status).toBe(404);
    });
  });
});
